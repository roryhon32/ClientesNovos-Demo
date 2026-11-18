"""SQL de leitura: filtros de população reutilizam o contrato da Fase 1."""
from datetime import date
from typing import Literal

from customer_intelligence.metrics import Analytics
from customer_intelligence.sql_utils import company_predicate, financial_aggregates
from .schemas import QueryFilters

GROUPS = {"business_unit": "business_unit", "seller": "vendedor", "customer": "raiz_cnpj",
          "product": "codigo_produto", "family": "familia", "state": "estado",
          "sales_channel": "canal_venda", "acquisition_cohort": "safra_aquisicao"}
SORTS = {"customer_id": "customer_id", "name": "name", "first_purchase": "first_purchase",
         "last_purchase": "last_purchase", "status": "status", "valid_purchases": "valid_purchases",
         "net_revenue": "faturamento_liquido", "gross_margin": "margem_bruta_valor",
         "gross_margin_pct": "margem_bruta_percentual", "accounting_revenue": "faturamento_contabil"}


def parse_sorts(sort_by: str, sort_order: str, sort: str | None = None) -> list[tuple[str, str]]:
    """Valida e converte ordenação simples ou multi-coluna contra a whitelist SORTS."""
    if sort_by not in SORTS or sort_order not in ("asc", "desc"):
        raise ValueError("Ordenação não permitida")
    if sort is None:
        return [(sort_by, sort_order)]
    raw_items = [item.strip() for item in sort.split(",")]
    if not raw_items or len(raw_items) > 4:
        raise ValueError("Ordenação não permitida")
    parsed: list[tuple[str, str]] = []
    seen: set[str] = set()
    for item in raw_items:
        field, sep, direction = item.partition(":")
        if sep != ":" or field not in SORTS or direction not in ("asc", "desc") or field in seen:
            raise ValueError("Ordenação não permitida")
        seen.add(field)
        parsed.append((field, direction))
    return parsed


class Repository:
    def __init__(self, conn):
        self.conn = conn
        self.analytics = Analytics(conn)

    def rows(self, sql, params=()):
        cursor = self.conn.execute(sql, list(params))
        names = [c[0] for c in cursor.description]
        return [dict(zip(names, row)) for row in cursor.fetchall()]

    def population(self, filters: QueryFilters, acquired=False):
        # Adaptador interno único; mantém atribuições globais e regras de filtros existentes.
        return self.analytics._clients_cte(filters.analytical(), acquisition_required=acquired)

    def acquired_period_finance(self, filters):
        cte,params=self.population(filters,acquired=True)
        conditions=["v.data_emissao<=?"]
        params.append(self.analytics.reference_date)
        if filters.company is not None:
            conditions.append(company_predicate("v"))
            params.append(filters.company)
        for value,op in ((filters.start_date,">="),(filters.end_date,"<=")):
            if value:
                conditions.append(f"v.data_emissao {op} ?")
                params.append(value)
        return self.rows(f"""WITH {cte} SELECT {financial_aggregates(table_alias='v')}
            FROM fato_vendas v JOIN selected_clients c USING(raiz_cnpj)
            WHERE {' AND '.join(conditions)}""",params)[0]

    def customer_page(self, filters, page, page_size, sort_by, sort_order, search=None, customer_id=None, sort=None):
        sorts = parse_sorts(sort_by, sort_order, sort)
        order_parts = [f"{SORTS[field]} {direction.upper()} NULLS LAST" for field, direction in sorts]
        if all(field != "customer_id" for field, _ in sorts):
            order_parts.append("customer_id")
        order_clause = ", ".join(order_parts)
        cte, params = self.population(filters)
        # Um conjunto de nomes por raiz, no mesmo horizonte da dimensão.
        # A agregação precede os joins financeiros e nunca multiplica medidas.
        names = """customer_labels AS (
            SELECT s.raiz_cnpj,
                coalesce(list_sort(list(DISTINCT s.nome_cliente)
                    FILTER (WHERE s.nome_cliente IS NOT NULL)),[]::VARCHAR[]) AS customer_names,
                coalesce(list_sort(list(DISTINCT s.cliente_real)
                    FILTER (WHERE s.cliente_real IS NOT NULL)),[]::VARCHAR[]) AS real_customer_names
            FROM stg_transacoes s JOIN selected_clients c USING(raiz_cnpj)
            WHERE s.data_emissao IS NULL OR s.data_emissao BETWEEN ? AND ?
            GROUP BY s.raiz_cnpj
        )"""
        params += [self.analytics.history_start, self.analytics.reference_date]
        predicates = []
        if search:
            predicates.append("""(contains(lower(c.nome_cliente_representativo),lower(?))
                OR contains(c.raiz_cnpj,?) OR EXISTS (
                    SELECT 1 FROM unnest(n.customer_names || n.real_customer_names) labels(value)
                    WHERE contains(lower(value),lower(?))))""")
            params += [search, search, search]
        if customer_id:
            predicates.append("c.raiz_cnpj=?")
            params.append(customer_id)
        where = " AND ".join(predicates) if predicates else "true"
        base = f"""WITH {cte}, {names}, population AS (
            SELECT c.*,coalesce(n.customer_names,[]::VARCHAR[]) AS customer_names,
                coalesce(n.real_customer_names,[]::VARCHAR[]) AS real_customer_names
            FROM selected_clients c LEFT JOIN customer_labels n USING(raiz_cnpj) WHERE {where})"""
        total = self.rows(base + " SELECT count(*) n FROM population", params)[0]["n"]
        data = self.rows(base + f""", finance AS (
            SELECT v.raiz_cnpj,{financial_aggregates(table_alias='v')},
                   count(DISTINCT identificador_documento) AS documentos_distintos
            FROM fato_vendas v JOIN population c USING(raiz_cnpj)
            WHERE v.data_emissao <= ? {('AND ' + company_predicate('v')) if filters.company is not None else ''}
            GROUP BY v.raiz_cnpj
        ) SELECT c.raiz_cnpj AS customer_id,c.nome_cliente_representativo AS name,
            c.customer_names,c.real_customer_names,
            c.data_primeira_compra AS first_purchase,c.data_ultima_compra AS last_purchase,
            c.data_segunda_compra AS second_purchase,
            CASE WHEN c.quantidade_compras_validas <= 5 AND c.status_atual = 'RECORRENTE' THEN 'NOVO' ELSE c.status_atual END AS status,
            c.quantidade_compras_validas AS valid_purchases,
            coalesce(c.business_units_aquisicao,[]::VARCHAR[]) AS acquisition_business_units,
            coalesce(c.vendedores_aquisicao,[]::VARCHAR[]) AS acquisition_sellers,
            date_diff('day', c.data_ultima_compra, current_date) AS days_without_purchase,
            f.* EXCLUDE(raiz_cnpj,documentos_distintos),
            coalesce(f.documentos_distintos,0) AS documentos_distintos
        FROM population c LEFT JOIN finance f USING(raiz_cnpj)
        ORDER BY {order_clause}
        LIMIT ? OFFSET ?""", [*params, self.analytics.reference_date,
            *([filters.company] if filters.company is not None else []), page_size, (page-1)*page_size])
        return {"items": data, "pagination": {"page": page,"page_size": page_size,
                "total_items": total,"total_pages": (total+page_size-1)//page_size}}

    def customer_profile(self, customer_id, filters):
        """Retorna perfil comercial consolidado do cliente: canais, localização, empresas, BUs, vendedores e famílias."""
        dim_row = self.rows("""SELECT safra_aquisicao,
            coalesce(canais_primeira_compra,[]::VARCHAR[]) AS acquisition_channels,
            coalesce(estados_primeira_compra,[]::VARCHAR[]) AS acquisition_states,
            coalesce(municipios_primeira_compra,[]::VARCHAR[]) AS acquisition_cities,
            dias_ate_segunda_compra, intervalo_medio_entre_compras
            FROM dim_clientes WHERE raiz_cnpj=?""", [customer_id])
        dim = dim_row[0] if dim_row else {
            "safra_aquisicao": None, "acquisition_channels": [], "acquisition_states": [],
            "acquisition_cities": [], "dias_ate_segunda_compra": None, "intervalo_medio_entre_compras": None,
        }
        company_cond = f" AND {company_predicate('v')}" if filters.company is not None else ""
        params = [customer_id, self.analytics.reference_date, *([filters.company] if filters.company is not None else [])]
        agg = self.rows(f"""SELECT
            coalesce(list_sort(list(DISTINCT v.canal_venda) FILTER (WHERE v.canal_venda IS NOT NULL)),[]::VARCHAR[]) AS sales_channels,
            coalesce(list_sort(list(DISTINCT v.business_unit) FILTER (WHERE v.business_unit IS NOT NULL)),[]::VARCHAR[]) AS business_units,
            coalesce(list_sort(list(DISTINCT v.vendedor) FILTER (WHERE v.vendedor IS NOT NULL)),[]::VARCHAR[]) AS sellers,
            coalesce(list_sort(list(DISTINCT s.empresa) FILTER (WHERE s.empresa IS NOT NULL)),[]::VARCHAR[]) AS companies,
            coalesce(list_sort(list(DISTINCT v.estado) FILTER (WHERE v.estado IS NOT NULL)),[]::VARCHAR[]) AS states,
            coalesce(list_sort(list(DISTINCT v.municipio) FILTER (WHERE v.municipio IS NOT NULL)),[]::VARCHAR[]) AS cities,
            coalesce(list_sort(list(DISTINCT v.familia) FILTER (WHERE v.familia IS NOT NULL)),[]::VARCHAR[]) AS families
            FROM fato_vendas v JOIN stg_transacoes s USING(source_row_id)
            WHERE v.raiz_cnpj=? AND v.data_emissao <= ? {company_cond}""", params)[0]
        channels = self.rows(f"""SELECT coalesce(v.canal_venda, 'Não informado') AS channel,
            {financial_aggregates(table_alias='v')},
            count(DISTINCT v.identificador_documento) FILTER (WHERE v.compra_valida AND v.identificador_documento IS NOT NULL) AS documents
            FROM fato_vendas v
            WHERE v.raiz_cnpj=? AND v.data_emissao <= ? {company_cond}
            GROUP BY coalesce(v.canal_venda, 'Não informado')
            ORDER BY faturamento_liquido DESC NULLS LAST, channel""", params)
        return {**dim, **agg, "channel_breakdown": channels}

    def customer_items(self, customer_id, filters, page, page_size, search=None):
        """Linhas financeiras do cliente; filtros incidem na transação, sem deduplicar itens.

        source_row_id é único na staging e no fato: o join recupera os componentes
        legíveis da chave documental sem multiplicar as linhas ou os financeiros.
        """
        predicates = ["v.raiz_cnpj=?", "v.data_emissao<=?"]
        params = [customer_id, self.analytics.reference_date]
        for value, column, operator in (
            (filters.company, "s.empresa", "="),
            (filters.start_date, "v.data_emissao", ">="),
            (filters.end_date, "v.data_emissao", "<="),
            (filters.business_unit, "v.business_unit", "="),
            (filters.seller, "v.vendedor", "="),
            (filters.state, "v.estado", "="),
            (filters.city, "v.municipio", "="),
            (filters.sales_channel, "v.canal_venda", "="),
            (filters.family, "v.familia", "="),
            (filters.customer_status, "d.status_atual", "="),
            (filters.valid_purchases_gt, "coalesce(d.quantidade_compras_validas,0)", ">"),
            (filters.acquisition_cohort, "d.safra_aquisicao", "="),
        ):
            if value is not None:
                predicates.append(f"{column} {operator} ?")
                params.append(value)
        if filters.product is not None:
            predicates.append("(v.codigo_produto = ? OR v.descricao_produto = ?)")
            params.extend([filters.product, filters.product])
        if search:
            predicates.append("""(contains(lower(v.codigo_produto),lower(?))
                OR contains(lower(v.descricao_produto),lower(?))
                OR contains(lower(s.num_docto),lower(?)))""")
            params.extend([search] * 3)
        base = f"""FROM fato_vendas v JOIN stg_transacoes s USING(source_row_id)
            LEFT JOIN dim_clientes d ON d.raiz_cnpj=v.raiz_cnpj
            WHERE {' AND '.join(predicates)}"""
        total = self.rows("SELECT count(*) AS n " + base, params)[0]["n"]
        items = self.rows("""SELECT v.identificador_item,v.identificador_documento,
            s.num_docto AS document_number,s.filial AS branch,s.empresa AS company,
            s.cod_cliente AS customer_code,s.nome_cliente,s.cliente_real,s.item,
            v.data_emissao,v.codigo_produto,v.descricao_produto,v.business_unit,
            v.familia,v.subfamilia,v.vendedor,v.estado,v.municipio,v.canal_venda,
            v.quantidade_faturada,TRY_CAST(s.dev_quant AS DECIMAL(24,6)) AS quantidade_devolvida,
            v.quantidade_liquida,v.status_origem,v.origem_transacao,
            v.compra_valida,v.faturamento_contabil,v.faturamento_liquido,v.impostos,
            v.percentual_impostos,v.margem_bruta_valor,v.margem_bruta_percentual
            """ + base + """ ORDER BY v.data_emissao DESC,
            v.identificador_documento NULLS LAST,v.source_row_id
            LIMIT ? OFFSET ?""", [*params, page_size, (page - 1) * page_size])
        return {"items": items, "pagination": {"page": page, "page_size": page_size,
            "total_items": total, "total_pages": (total + page_size - 1) // page_size}}

    def profitability(self, filters, group_by, limit):
        if group_by not in GROUPS:
            raise ValueError("Dimensão não permitida")
        f = filters.analytical()
        # Reutiliza a construção parametrizada da consulta financeira oficial,
        # aplica LIMIT no SQL antes de materializar o resultado agregado.
        predicates = ["v.data_emissao <= ?"]
        params = [self.analytics.reference_date]
        if filters.company is not None:
            predicates.append(company_predicate("v"))
            params.append(filters.company)
        mapping = {"start_date": ("v.data_emissao", ">="), "end_date": ("v.data_emissao", "<="),
                   "business_unit": ("v.business_unit", "="), "seller": ("v.vendedor", "="),
                   "state": ("v.estado", "="), "city": ("v.municipio", "="),
                   "sales_channel": ("v.canal_venda", "="), "family": ("v.familia", "="),
                   "customer_status": ("d.status_atual", "="),
                   "valid_purchases_gt": ("coalesce(d.quantidade_compras_validas,0)", ">"),
                   "acquisition_cohort": ("d.safra_aquisicao", "=")}
        for key,(column,op) in mapping.items():
            value = getattr(filters,key)
            if value is not None:
                predicates.append(f"{column} {op} ?")
                params.append(value)
        if filters.product is not None:
            predicates.append("(v.codigo_produto = ? OR v.descricao_produto = ?)")
            params.extend([filters.product, filters.product])
        dim = "d.safra_aquisicao" if group_by == "acquisition_cohort" else "v."+GROUPS[group_by]
        return self.rows(f"""SELECT {dim} AS dimension,{financial_aggregates(table_alias='v')},
            count(DISTINCT v.raiz_cnpj) clientes_identificados,
            count(DISTINCT identificador_documento) documentos_distintos
            FROM fato_vendas v LEFT JOIN dim_clientes d USING(raiz_cnpj)
            WHERE {' AND '.join(predicates)} GROUP BY {dim}
            ORDER BY dimension NULLS LAST LIMIT ?""", [*params,limit])

    def lifecycle(self, filters, reference_date=None, transitions=False):
        # Status histórico nunca vem de d.status_atual.
        selection = filters.model_copy(update={"start_date":None,"end_date":None,"customer_status":None})
        cte, params = self.population(selection)
        if transitions:
            where = ["true"]
            for value, op in ((filters.start_date,">="),(filters.end_date,"<=")):
                if value:
                    where.append(f"t.mes_referencia {op} ?")
                    params.append(value.replace(day=1))
            if filters.customer_status:
                where.append("t.status_atual=?")
                params.append(filters.customer_status)
            return self.rows(f"""WITH {cte} SELECT t.mes_referencia AS period,
                t.status_anterior AS previous_status,t.status_atual AS status,
                count(*) AS customers,bool_and(t.periodo_completo) AS mature
                FROM fato_transicoes t JOIN selected_clients c USING(raiz_cnpj)
                WHERE {' AND '.join(where)} GROUP BY ALL ORDER BY period,previous_status,status""",params)
        ref = reference_date or self.analytics.reference_date
        if ref == self.analytics.reference_date and not self.rows("SELECT 1 FROM fato_clientes_mensal WHERE data_referencia_mes=? LIMIT 1", [ref]):
            cond_snap = " AND c.status_atual=?" if filters.customer_status else ""
            return self.rows(f"""WITH {cte} SELECT c.status_atual AS status, count(*) AS customers
                FROM selected_clients c
                WHERE 1=1 {cond_snap} GROUP BY c.status_atual ORDER BY status""",
                [*params, *([filters.customer_status] if filters.customer_status else [])])
        if not self.rows("SELECT 1 FROM fato_clientes_mensal WHERE data_referencia_mes=? LIMIT 1", [ref]) and ref != self.analytics.reference_date:
            raise ValueError("Referência disponível somente no snapshot ou em fechamentos mensais observados")
        condition = " AND m.status_historico=?" if filters.customer_status else ""
        return self.rows(f"""WITH {cte} SELECT m.status_historico AS status,count(*) AS customers
            FROM fato_clientes_mensal m JOIN selected_clients c USING(raiz_cnpj)
            WHERE m.data_referencia_mes=? {condition} GROUP BY m.status_historico ORDER BY status""",
            [*params,ref,*([filters.customer_status] if filters.customer_status else [])])

    def filter_values(self, filters, dimension, search, page, page_size):
        dims = {**GROUPS,"company":"(SELECT cs.empresa FROM stg_transacoes cs WHERE cs.source_row_id=v.source_row_id)",
                "city":"municipio","year":"year(data_emissao)::VARCHAR",
                "month":"month(data_emissao)::VARCHAR","customer_status":"status_atual"}
        if dimension not in dims:
            raise ValueError("Dimensão não permitida")
        # Filtros dependentes são aplicados às transações; valores nunca são SQL.
        predicates=["v.data_emissao<=?"]
        params=[self.analytics.reference_date]
        if filters.company is not None:
            predicates.append(company_predicate("v"))
            params.append(filters.company)
        mapping={"business_unit":"v.business_unit","seller":"v.vendedor","state":"v.estado",
                 "city":"v.municipio","sales_channel":"v.canal_venda","family":"v.familia",
                 "customer_status":"d.status_atual",
                 "acquisition_cohort":"d.safra_aquisicao"}
        for key,col in mapping.items():
            if getattr(filters,key) is not None:
                predicates.append(f"{col}=?"); params.append(getattr(filters,key))
        if filters.product is not None:
            predicates.append("(v.codigo_produto = ? OR v.descricao_produto = ?)")
            params.extend([filters.product, filters.product])
        if filters.valid_purchases_gt is not None:
            predicates.append("coalesce(d.quantidade_compras_validas,0) > ?")
            params.append(filters.valid_purchases_gt)
        for key,op in (("start_date",">="),("end_date","<=")):
            if getattr(filters,key):
                predicates.append(f"v.data_emissao {op} ?");params.append(getattr(filters,key))
        col=dims[dimension]
        base=f"""WITH vals AS (SELECT DISTINCT {col} AS value FROM fato_vendas v
            LEFT JOIN dim_clientes d USING(raiz_cnpj) WHERE {' AND '.join(predicates)})
            SELECT value FROM vals WHERE value IS NOT NULL"""
        if search:
            base+=" AND contains(lower(value),lower(?))";params.append(search)
        total=self.rows(f"SELECT count(*) n FROM ({base})",params)[0]["n"]
        return {"items":self.rows(base+" ORDER BY value LIMIT ? OFFSET ?",[*params,page_size,(page-1)*page_size]),
                "pagination":{"page":page,"page_size":page_size,"total_items":total,"total_pages":(total+page_size-1)//page_size}}
