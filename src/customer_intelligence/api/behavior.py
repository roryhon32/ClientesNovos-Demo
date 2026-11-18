"""Análises de comportamento sobre o fato existente; exclusivamente leitura SQL."""
from calendar import monthrange
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from customer_intelligence.sql_utils import company_predicate, complete_sum, financial_aggregates
from .behavior_schemas import CustomerBehavior, ProductInvoicesPage, ProductRepurchasePage
from .dependencies import authorize_customer_details, query_filters, service
from .schemas import QueryFilters, Result
from .serialization import response
from .services import Services

router = APIRouter()
F = Annotated[QueryFilters, Depends(query_filters)]
S = Annotated[Services, Depends(service, scope="function")]


def selection(s, f, customer_id=None):
    """Filtros incidem na transação; atributos de aquisição permanecem globais."""
    # Mesmo horizonte financeiro oficial de /finance e /items. A flag de compra
    # válida já aplica history_start, sem descartar movimentos contábeis antigos.
    conditions = ["v.data_emissao<=?"]
    params = [s.a.reference_date]
    if f.company is not None:
        conditions.append(company_predicate("v"))
        params.append(f.company)
    columns = {"start_date": ("v.data_emissao", ">="), "end_date": ("v.data_emissao", "<="),
               "business_unit": ("v.business_unit", "="), "seller": ("v.vendedor", "="),
               "state": ("v.estado", "="), "city": ("v.municipio", "="),
               "sales_channel": ("v.canal_venda", "="), "family": ("v.familia", "="),
               "customer_status": ("d.status_atual", "="),
               "valid_purchases_gt": ("coalesce(d.quantidade_compras_validas,0)", ">"),
               "acquisition_cohort": ("d.safra_aquisicao", "=")}
    for key, (column, op) in columns.items():
        value = getattr(f, key)
        if value is not None:
            conditions.append(f"{column} {op} ?")
            params.append(value)
    if f.product is not None:
        conditions.append("(v.codigo_produto = ? OR v.descricao_produto = ? OR coalesce(v.produtos, '') = ?)")
        params.extend([f.product, f.product, f.product])
    if customer_id is not None:
        conditions.append("v.raiz_cnpj=?")
        params.append(customer_id)
    return ("selected AS (SELECT v.* FROM fato_vendas v LEFT JOIN dim_clientes d USING(raiz_cnpj) "
            f"WHERE {' AND '.join(conditions)})"), params


VALID = "compra_valida AND identificador_documento IS NOT NULL"


def customer_behavior(s, f, customer_id):
    customer = s.repo.rows("SELECT coalesce(quantidade_compras_validas,0) AS purchases FROM dim_clientes WHERE raiz_cnpj=?", [customer_id])
    if not customer:
        raise HTTPException(404, "Cliente não encontrado")
    cte, params = selection(s, f, customer_id)

    def rows(sql):
        # Uma linha adicional detecta excesso sem materializar listas ilimitadas.
        return s.bounded(s.repo.rows(f"WITH {cte} {sql} LIMIT ?", [*params, s.max_rows+1]))

    summary = rows(f"""SELECT {financial_aggregates()},
        count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS valid_documents,
        count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS occasions,
        CASE WHEN count(DISTINCT identificador_documento) FILTER (WHERE {VALID})>1
        THEN date_diff('day',min(data_emissao) FILTER (WHERE {VALID}),
             max(data_emissao) FILTER (WHERE {VALID})) * 1.0 /
             (count(DISTINCT identificador_documento) FILTER (WHERE {VALID})-1) END
        AS mean_days_between_purchases FROM selected""")[0]
    bus = rows(f"""SELECT business_unit,{financial_aggregates()},
        count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS documents,
        count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS occasions
        FROM selected GROUP BY business_unit ORDER BY business_unit NULLS LAST""")
    total = summary["faturamento_liquido"]
    for bu in bus:
        bu["repurchased"] = bu["documents"] >= 2
        bu["net_share_pct"] = float(100 * bu["faturamento_liquido"] / total) if total and bu["faturamento_liquido"] is not None else None
    complete_bus = bus and all(b["faturamento_liquido"] is not None for b in bus)
    highest_bu = max(b["faturamento_liquido"] for b in bus) if complete_bus else None
    summary.update(general_repurchase=summary["valid_documents"] >= 2,
                   same_bu_repurchase=any(b["repurchased"] for b in bus),
                   predominant_business_units=[b["business_unit"] for b in bus if highest_bu is not None and b["faturamento_liquido"] == highest_bu],
                   occasion_mode="dates")
    monthly = rows(f"""SELECT date_trunc('month',data_emissao)::DATE AS month,business_unit,
        {financial_aggregates()}, count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS documents
        FROM selected GROUP BY ALL ORDER BY month,business_unit NULLS LAST""")
    products = rows(f"""SELECT codigo_produto AS product_id,
        coalesce(list_sort(list(DISTINCT descricao_produto) FILTER (WHERE descricao_produto IS NOT NULL)),[]::VARCHAR[]) AS descriptions,
        coalesce(list_sort(list(DISTINCT business_unit) FILTER (WHERE business_unit IS NOT NULL)),[]::VARCHAR[]) AS business_units,
        {financial_aggregates()}, {complete_sum('CASE WHEN compra_valida THEN quantidade_liquida ELSE 0 END')} AS quantity,
        count(DISTINCT identificador_documento) FILTER (WHERE {VALID}) AS documents,
        count(DISTINCT data_emissao) FILTER (WHERE {VALID}) AS occasions,
        min(data_emissao) FILTER (WHERE {VALID}) AS first_purchase,
        max(data_emissao) FILTER (WHERE {VALID}) AS last_purchase,
        CASE WHEN count(DISTINCT data_emissao) FILTER (WHERE {VALID})>1
        THEN date_diff('day',min(data_emissao) FILTER (WHERE {VALID}),max(data_emissao) FILTER (WHERE {VALID}))*1.0 /
             (count(DISTINCT data_emissao) FILTER (WHERE {VALID})-1) END AS mean_days_between_purchases
        FROM selected GROUP BY codigo_produto ORDER BY product_id NULLS LAST""")
    for p in products:
        p["repurchased"] = p["occasions"] >= 2
    summary["same_product_repurchase"] = any(p["repurchased"] for p in products if p["product_id"] is not None)
    first_products = s.repo.rows(f"""WITH first_day AS (
        SELECT min(data_emissao) AS day FROM fato_vendas WHERE raiz_cnpj=? AND {VALID}
        AND data_emissao BETWEEN ? AND ? AND ?)
        SELECT codigo_produto AS product_id, list_sort(list(DISTINCT descricao_produto)
               FILTER (WHERE descricao_produto IS NOT NULL)) AS descriptions,
        coalesce(list_sort(list(DISTINCT business_unit) FILTER (WHERE business_unit IS NOT NULL)),[]::VARCHAR[]) AS business_units,
        data_emissao AS date,count(DISTINCT identificador_documento) AS documents
        FROM fato_vendas v CROSS JOIN first_day WHERE raiz_cnpj=? AND {VALID} AND data_emissao=day
        {('AND ' + company_predicate('v')) if f.company is not None else ''}
        GROUP BY codigo_produto,data_emissao ORDER BY product_id NULLS LAST LIMIT ?""",
        [customer_id, s.a.history_start, s.a.reference_date,
         f.valid_purchases_gt is None or customer[0]["purchases"] > f.valid_purchases_gt,
         customer_id, *([f.company] if f.company is not None else []), s.max_rows+1])
    s.bounded(first_products)
    for p in first_products:
        p["descriptions"] = p["descriptions"] or []

    def top(field):
        eligible = [p for p in products if p["product_id"] is not None and p["documents"] > 0]
        # Não declarar vencedor quando valores de um concorrente são desconhecidos.
        if not eligible or any(p[field] is None for p in eligible):
            return []
        largest = max(p[field] for p in eligible)
        return [p for p in eligible if p[field] == largest]

    data = {"summary": summary, "business_units": s.bounded(bus),
            "monthly_business_units": s.bounded(monthly), "first_products": s.bounded(first_products),
            "top_products_quantity": top("quantity"), "top_products_revenue": top("faturamento_liquido"),
            "products": s.bounded(products), "mix": mix_evolution(s, f, customer_id)}
    result = s.wrap(f, data, period="transaction_period_with_global_first_purchase", population="selected_customer_transactions", segmentation="transaction_attributes")
    result["meta"]["notes"] += [
        "Recompra geral e na mesma BU: documentos distintos. Mesmo produto e frequência por produto: datas de emissão distintas.",
        "Primeiros produtos usam a primeira data válida global; filtros não redefinem aquisição.",
        "Quantidades são por produto, sem somar unidades de produtos diferentes; valores financeiros incluem devoluções.",
        "Ausência de produto no período não comprova abandono. Mix e maturidade usam os períodos explicitados."]
    return result


def mix_evolution(s, f, customer_id):
    reference = s.a.reference_date
    if f.start_date is None and f.end_date is None:
        end = reference if reference.day == monthrange(reference.year, reference.month)[1] else reference.replace(day=1)-timedelta(days=1)
        start = end.replace(day=1)
        basis = "last_closed_month_vs_previous_equal_days"
    else:
        start = f.start_date or s.a.history_start
        end = min(f.end_date or reference, reference)
        basis = "selected_period_vs_previous_equal_days"
    # Período futuro inteiro não gera intervalo invertido nem observações inventadas.
    end = max(start, end)
    previous_end = start - timedelta(days=1)
    previous_start = start - timedelta(days=(end-start).days+1)
    nondates = f.model_copy(update={"start_date": None, "end_date": None})
    cte, params = selection(s, nondates, customer_id)
    measures = s.repo.rows(f"""WITH {cte} SELECT codigo_produto AS product_id,
        min(data_emissao) AS first_seen,
        count(*) FILTER (WHERE data_emissao BETWEEN ? AND ?) AS current_rows,
        count(*) FILTER (WHERE data_emissao BETWEEN ? AND ?) AS previous_rows,
        {complete_sum('CASE WHEN data_emissao BETWEEN ? AND ? THEN faturamento_liquido ELSE 0 END')} AS current_net,
        {complete_sum('CASE WHEN data_emissao BETWEEN ? AND ? THEN faturamento_liquido ELSE 0 END')} AS previous_net
        FROM selected WHERE {VALID} AND codigo_produto IS NOT NULL GROUP BY codigo_produto ORDER BY codigo_produto LIMIT ?""",
        [*params, start, end, previous_start, previous_end,
         start, end, start, end, previous_start, previous_end, previous_start, previous_end, s.max_rows+1])
    s.bounded(measures)
    current = {p["product_id"] for p in measures if p["current_rows"]}
    previous = {p["product_id"] for p in measures if p["previous_rows"]}
    new = {p["product_id"] for p in measures if p["first_seen"] >= start and p["product_id"] in current}

    def concentration(prefix):
        values = [p[prefix+"_net"] for p in measures if p[prefix+"_rows"]]
        if not values or any(v is None or v < 0 for v in values) or not sum(values):
            return None
        return float(100*max(values)/sum(values))

    return {"current_start": start, "current_end": end, "previous_start": previous_start,
            "previous_end": previous_end, "period_basis": basis,
            "previous_period_complete": previous_start >= s.a.history_start and previous_end <= reference,
            "new_in_period": sorted(new), "not_observed_in_period": sorted(previous-current),
            "retained_products": sorted(current & previous), "resumed_products": sorted(current-previous-new),
            "current_products": len(current), "previous_products": len(previous),
            "current_top_product_share_pct": concentration("current"),
            "previous_top_product_share_pct": concentration("previous")}


def product_repurchase(s, f, page=1, page_size=50, search=None,
                       sort_by="repurchase_rate_pct", sort_order="desc", min_observation_days=0,
                       group_by="product_id"):
    allowed = {"product", "product_name", "product_id", "repurchase_rate_pct", "customers", "repurchased_customers"}
    if sort_by not in allowed or sort_order not in {"asc", "desc"}:
        raise ValueError("Ordenação não permitida")
    if group_by not in {"product", "product_id"}:
        raise ValueError("Modo de agrupamento não permitido")
    page_size = min(page_size, s.max_rows)
    cte, params = selection(s, f)
    cte_params = list(params)
    observation_end = min(f.end_date or s.a.reference_date, s.a.reference_date)
    # Oportunidade de recompra inicia na primeira compra observada do produto,
    # sob os mesmos filtros do denominador, sem futuro relativo à referência.
    params += [observation_end, min_observation_days]
    if group_by == "product":
        base = f"""WITH {cte}, cleaned_selected AS (
            SELECT *,
                CASE 
                    WHEN produtos ILIKE '%BUSCA PRE%' THEN 'BUSCA PREÇO'
                    WHEN produtos ILIKE '%SERVI%' THEN 'SERVIÇOS'
                    WHEN produtos ILIKE '%PARTES E PE%' THEN 'PARTES E PEÇAS'
                    WHEN produtos IS NOT NULL AND trim(produtos) != '' THEN trim(produtos)
                    ELSE coalesce(nullif(trim(descricao_produto), ''), codigo_produto, 'OUTROS PRODUTOS')
                END AS product_name
            FROM selected
        ), per_customer AS (
            SELECT product_name,
                   raiz_cnpj,
                   count(DISTINCT data_emissao) AS occasions,
                   date_diff('day', min(data_emissao), ?::DATE) AS observation_days
            FROM cleaned_selected WHERE {VALID} AND product_name IS NOT NULL AND raiz_cnpj IS NOT NULL
            GROUP BY product_name, raiz_cnpj), eligible AS (
            SELECT *, observation_days >= ? AS mature FROM per_customer), codes_agg AS (
            SELECT product_name,
                   coalesce(list_sort(list(DISTINCT codigo_produto) FILTER (WHERE codigo_produto IS NOT NULL)), []::VARCHAR[]) AS codes,
                   coalesce(list_sort(list(DISTINCT descricao_produto) FILTER (WHERE descricao_produto IS NOT NULL)), []::VARCHAR[]) AS descriptions
            FROM cleaned_selected GROUP BY product_name), ranking AS (
            SELECT product_name, count(*) AS customers, count(*) FILTER (WHERE mature) AS eligible_customers,
            count(*) FILTER (WHERE NOT mature) AS excluded_recent_customers,
            count(*) FILTER (WHERE mature AND occasions >= 2) AS repurchased_customers,
            100.0 * count(*) FILTER (WHERE mature AND occasions >= 2) / NULLIF(count(*) FILTER (WHERE mature), 0) AS repurchase_rate_pct,
            min(observation_days) AS minimum_observation_days, max(observation_days) AS maximum_observation_days
            FROM eligible GROUP BY product_name), result AS (
            SELECT r.product_name AS product_id,
                   r.product_name,
                   c.descriptions,
                   c.codes,
                   r.customers,
                   r.eligible_customers,
                   r.excluded_recent_customers,
                   r.repurchased_customers,
                   r.repurchase_rate_pct,
                   r.minimum_observation_days,
                   r.maximum_observation_days
            FROM ranking r JOIN codes_agg c USING (product_name))"""
        order_col = "product_name" if sort_by in ("product", "product_name") else sort_by
    else:
        base = f"""WITH {cte}, per_customer AS (
            SELECT codigo_produto AS product_id, raiz_cnpj,
            count(DISTINCT data_emissao) AS occasions,
            date_diff('day', min(data_emissao), ?::DATE) AS observation_days
            FROM selected WHERE {VALID} AND codigo_produto IS NOT NULL AND raiz_cnpj IS NOT NULL
            GROUP BY codigo_produto, raiz_cnpj), eligible AS (
            SELECT *, observation_days >= ? AS mature FROM per_customer), labels AS (
            SELECT codigo_produto AS product_id,
            coalesce(list_sort(list(DISTINCT descricao_produto) FILTER (WHERE descricao_produto IS NOT NULL)), []::VARCHAR[]) AS descriptions
            FROM selected GROUP BY codigo_produto), ranking AS (
            SELECT product_id, count(*) AS customers, count(*) FILTER (WHERE mature) AS eligible_customers,
            count(*) FILTER (WHERE NOT mature) AS excluded_recent_customers,
            count(*) FILTER (WHERE mature AND occasions >= 2) AS repurchased_customers,
            100.0 * count(*) FILTER (WHERE mature AND occasions >= 2) / NULLIF(count(*) FILTER (WHERE mature), 0) AS repurchase_rate_pct,
            min(observation_days) AS minimum_observation_days, max(observation_days) AS maximum_observation_days
            FROM eligible GROUP BY product_id), result AS (
            SELECT r.*,
                   coalesce(l.descriptions[1], r.product_id) AS product_name,
                   l.descriptions,
                   [r.product_id] AS codes
            FROM ranking r JOIN labels l USING (product_id))"""
        order_col = "coalesce(descriptions[1], product_id)" if sort_by in ("product", "product_name") else sort_by

    where = (" WHERE contains(lower(product_id), lower(?)) "
             "OR EXISTS (SELECT 1 FROM unnest(descriptions) t(label) WHERE contains(lower(label), lower(?))) "
             "OR EXISTS (SELECT 1 FROM unnest(codes) t(cd) WHERE contains(lower(cd), lower(?)))") if search else ""
    if search:
        params += [search, search, search]
    total = s.repo.rows(base + " SELECT count(*) AS n FROM result" + where, params)[0]["n"]
    items = s.repo.rows(base + " SELECT * FROM result" + where + f" ORDER BY {order_col} {sort_order} NULLS LAST, product_id LIMIT ? OFFSET ?",
                        [*params, min(page_size, s.max_rows), (page - 1) * page_size])

    if group_by == "product" and items:
        prod_names = [it["product_id"] for it in items]
        placeholders = ", ".join("?" for _ in prod_names)
        details_sql = f"""
            cleaned_selected AS (
                SELECT *,
                    CASE 
                        WHEN produtos ILIKE '%BUSCA PRE%' THEN 'BUSCA PREÇO'
                        WHEN produtos ILIKE '%SERVI%' THEN 'SERVIÇOS'
                        WHEN produtos ILIKE '%PARTES E PE%' THEN 'PARTES E PEÇAS'
                        WHEN produtos IS NOT NULL AND trim(produtos) != '' THEN trim(produtos)
                        ELSE coalesce(nullif(trim(descricao_produto), ''), codigo_produto, 'OUTROS PRODUTOS')
                    END AS product_name
                FROM selected
                WHERE {VALID} AND codigo_produto IS NOT NULL AND raiz_cnpj IS NOT NULL
            ), per_code_customer AS (
                SELECT product_name, codigo_produto, raiz_cnpj,
                       count(DISTINCT data_emissao) AS occasions,
                       date_diff('day', min(data_emissao), ?::DATE) AS observation_days
                FROM cleaned_selected
                WHERE product_name IN ({placeholders})
                GROUP BY product_name, codigo_produto, raiz_cnpj
            ), eligible AS (
                SELECT *, observation_days >= ? AS mature FROM per_code_customer
            ), labels AS (
                SELECT codigo_produto,
                       coalesce(list_sort(list(DISTINCT descricao_produto) FILTER (WHERE descricao_produto IS NOT NULL)), []::VARCHAR[]) AS descriptions
                FROM cleaned_selected GROUP BY codigo_produto
            ), ranking AS (
                SELECT product_name,
                       codigo_produto,
                       count(*) AS customers,
                       count(*) FILTER (WHERE mature) AS eligible_customers,
                       count(*) FILTER (WHERE NOT mature) AS excluded_recent_customers,
                       count(*) FILTER (WHERE mature AND occasions >= 2) AS repurchased_customers,
                       100.0 * count(*) FILTER (WHERE mature AND occasions >= 2) / NULLIF(count(*) FILTER (WHERE mature), 0) AS repurchase_rate_pct,
                       min(observation_days) AS minimum_observation_days,
                       max(observation_days) AS maximum_observation_days
                FROM eligible
                GROUP BY product_name, codigo_produto
            )
            SELECT r.*, coalesce(l.descriptions[1], r.codigo_produto) AS description
            FROM ranking r
            LEFT JOIN labels l USING (codigo_produto)
            ORDER BY r.product_name, r.customers DESC
        """
        code_rows = s.repo.rows(f"WITH {cte}, " + details_sql, [*cte_params, observation_end, *prod_names, min_observation_days])
        by_prod = {}
        for cr in code_rows:
            p_name = cr["product_name"]
            if p_name not in by_prod:
                by_prod[p_name] = []
            by_prod[p_name].append({
                "code": cr["codigo_produto"],
                "description": cr["description"],
                "customers": cr["customers"],
                "eligible_customers": cr["eligible_customers"],
                "excluded_recent_customers": cr["excluded_recent_customers"],
                "repurchased_customers": cr["repurchased_customers"],
                "repurchase_rate_pct": cr["repurchase_rate_pct"],
                "minimum_observation_days": cr["minimum_observation_days"],
                "maximum_observation_days": cr["maximum_observation_days"],
            })
        for it in items:
            it["code_details"] = by_prod.get(it["product_id"], [])
    else:
        for it in items:
            it["code_details"] = []

    result = s.wrap(f, {"items": items, "pagination": {"page": page, "page_size": page_size, "total_items": total,
                     "total_pages": (total + page_size - 1) // page_size}, "occasion_mode": "dates",
                     "min_observation_days": min_observation_days, "observation_end": observation_end,
                     "group_by": group_by},
                    period="transaction_period", population="unique_customer_product_pairs", segmentation="transaction_attributes")
    result["meta"]["notes"] += ["Recompra do mesmo produto exige datas de emissão distintas; itens e notas no mesmo dia não contam nova ocasião.",
        "Denominador: clientes únicos por produto, após maturidade opcional. Padrão zero dias não exclui clientes recentes.",
        "Dias de observação: primeira compra do produto no recorte até min(fim do período, referência).",
        "Devoluções, cancelamentos e transações sem documento válido não contam como compras."]
    return result


@router.get("/customers/{customer_id}/behavior", response_model=Result[CustomerBehavior], dependencies=[Depends(authorize_customer_details)])
def behavior(customer_id: Annotated[str, Path(pattern=r"^\d{8}$")], f: F, s: S):
    return response(Result[CustomerBehavior], customer_behavior(s, f, customer_id))


@router.get("/products/repurchase", response_model=Result[ProductRepurchasePage], dependencies=[Depends(authorize_customer_details)])
def repurchase(f: F, s: S, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               search: str | None = Query(None, max_length=200),
               sort_by: Literal["product", "product_name", "product_id", "repurchase_rate_pct", "customers", "repurchased_customers"] = "repurchase_rate_pct",
               sort_order: Literal["asc", "desc"] = "desc", min_observation_days: int = Query(0, ge=0, le=36500),
               group_by: Literal["product", "product_id"] = "product"):
    return response(Result[ProductRepurchasePage], product_repurchase(s, f, page, page_size, search, sort_by, sort_order, min_observation_days, group_by))


def product_code_invoices(s, f, code: str, page: int = 1, page_size: int = 10,
                          sort_by: str = "data_emissao", sort_order: str = "desc"):
    VALID = "v.compra_valida"
    cte, cte_params = selection(s, f)

    sort_map = {
        "data_emissao": "data_emissao",
        "num_docto": "num_docto",
        "cliente_real": "cliente_real",
        "faturamento_liquido": "faturamento_liquido",
        "margem_bruta_valor": "margem_bruta_valor",
        "margem_bruta_percentual": "margem_bruta_percentual",
    }
    order_col = sort_map.get(sort_by, "data_emissao")
    order_dir = "ASC" if sort_order.lower() == "asc" else "DESC"

    base_cte = f"""WITH {cte}, filtered AS (
        SELECT 
            coalesce(nullif(trim(s.num_docto), ''), nullif(trim(s.nota_documental), ''), v.identificador_documento) AS num_docto,
            coalesce(nullif(trim(s.serie), ''), nullif(trim(s.serie_documental), ''), '') AS serie,
            v.data_emissao,
            coalesce(nullif(trim(s.cliente_real), ''), nullif(trim(v.nome_cliente), ''), 'CLIENTE NÃO INFORMADO') AS cliente_real,
            v.nome_cliente,
            v.raiz_cnpj,
            round(sum(v.faturamento_liquido), 2) AS faturamento_liquido,
            round(sum(v.margem_bruta_valor), 2) AS margem_bruta_valor,
            round(100.0 * sum(v.margem_bruta_valor) / NULLIF(sum(v.faturamento_liquido), 0), 2) AS margem_bruta_percentual,
            count(*) AS itens
        FROM selected v
        LEFT JOIN stg_transacoes s ON v.source_row_id = s.source_row_id
        WHERE v.codigo_produto = ? AND {VALID}
        GROUP BY 1, 2, 3, 4, 5, 6
    )"""

    params = [*cte_params, code]
    total = s.repo.rows(base_cte + " SELECT count(*) AS n FROM filtered", params)[0]["n"]

    offset = (page - 1) * page_size
    query_items = base_cte + f" SELECT * FROM filtered ORDER BY {order_col} {order_dir} NULLS LAST, num_docto {order_dir} LIMIT ? OFFSET ?"
    items = s.repo.rows(query_items, [*params, min(page_size, s.max_rows), offset])

    for it in items:
        if it.get("faturamento_liquido") is not None:
            it["faturamento_liquido"] = float(it["faturamento_liquido"])
        if it.get("margem_bruta_valor") is not None:
            it["margem_bruta_valor"] = float(it["margem_bruta_valor"])
        if it.get("margem_bruta_percentual") is not None:
            it["margem_bruta_percentual"] = float(it["margem_bruta_percentual"])

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    result = s.wrap(
        f,
        {
            "items": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
            },
            "code": code,
        },
        period="transaction_period",
        population="product_code_invoices",
        segmentation="transaction_attributes",
    )
    result["meta"]["notes"] += [
        "Notas fiscais agregadas por número de documento, série, data de emissão e cliente real.",
        "Margem bruta calculada sobre faturamento líquido das compras válidas do código de produto.",
    ]
    return result


@router.get("/products/invoices", response_model=Result[ProductInvoicesPage], dependencies=[Depends(authorize_customer_details)])
def get_product_invoices(f: F, s: S,
                         code: str = Query(..., min_length=1, max_length=100),
                         page: int = Query(1, ge=1),
                         page_size: int = Query(10, ge=1, le=100),
                         sort_by: Literal["data_emissao", "num_docto", "cliente_real", "faturamento_liquido", "margem_bruta_valor", "margem_bruta_percentual"] = "data_emissao",
                         sort_order: Literal["asc", "desc"] = "desc"):
    return response(Result[ProductInvoicesPage], product_code_invoices(s, f, code, page, page_size, sort_by, sort_order))


@router.get("/products/{code}/invoices", response_model=Result[ProductInvoicesPage], dependencies=[Depends(authorize_customer_details)])
def get_product_code_invoices(code: Annotated[str, Path(min_length=1, max_length=100)],
                              f: F, s: S,
                              page: int = Query(1, ge=1),
                              page_size: int = Query(10, ge=1, le=100),
                              sort_by: Literal["data_emissao", "num_docto", "cliente_real", "faturamento_liquido", "margem_bruta_valor", "margem_bruta_percentual"] = "data_emissao",
                              sort_order: Literal["asc", "desc"] = "desc"):
    return response(Result[ProductInvoicesPage], product_code_invoices(s, f, code, page, page_size, sort_by, sort_order))
