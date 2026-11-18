"""Agregações DuckDB parametrizadas e pequenas respostas Polars.

Identificadores SQL vêm somente dos mapas internos. Valores fornecidos pelo
consumidor são sempre parâmetros; não há interface para SQL arbitrário.
"""

from __future__ import annotations

from datetime import date, datetime
from importlib.resources import files
from types import MappingProxyType
from typing import Literal

import duckdb
import polars as pl
from pydantic import BaseModel, ConfigDict, Field, model_validator

from customer_intelligence.sql_utils import company_predicate, complete_sum, financial_aggregates


class Filters(BaseModel):
    """Valores exatos de filtro; datas são inclusivas, strings não são SQL."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    year: int | None = Field(default=None, ge=1900, le=9999)
    month: int | None = Field(default=None, ge=1, le=12)
    start_date: date | None = None
    end_date: date | None = None
    company: str | None = None
    business_unit: str | None = None
    raiz_cnpj: str | None = None
    cliente: str | None = None
    vendedor: str | None = None
    estado: str | None = None
    municipio: str | None = None
    canal_venda: str | None = None
    familia: str | None = None
    codigo_produto: str | None = None
    safra_aquisicao: str | None = None
    status_cliente: str | None = None
    valid_purchases_gt: int | None = Field(default=None, ge=0, le=2147483647)

    @model_validator(mode="after")
    def valid_interval(self) -> Filters:
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date deve ser anterior ou igual a end_date")
        return self


_FINANCIAL_DIMENSIONS = {
    "year": "year(data_emissao)",
    "month": "month(data_emissao)",
    "mes_referencia": "mes_referencia",
    "business_unit": "business_unit",
    "raiz_cnpj": "raiz_cnpj",
    "cliente": "nome_cliente",
    "vendedor": "vendedor",
    "estado": "estado",
    "municipio": "municipio",
    "canal_venda": "canal_venda",
    "familia": "familia",
    "codigo_produto": "codigo_produto",
    "safra_aquisicao": "safra_aquisicao",
    "status_cliente": "status_atual",
}

# Arrays completos formam grupos mutuamente exclusivos: não há UNNEST de receita.
_CLIENT_DIMENSIONS = {
    "year": "ano_aquisicao",
    "month": "month(mes_aquisicao)",
    "mes_aquisicao": "mes_aquisicao",
    "ano_aquisicao": "ano_aquisicao",
    "safra_aquisicao": "safra_aquisicao",
    "business_unit": "business_units_aquisicao",
    "vendedor": "vendedores_aquisicao",
    "estado": "estados_aquisicao",
    "municipio": "municipios_aquisicao",
    "canal_venda": "canais_aquisicao",
    "raiz_cnpj": "raiz_cnpj",
    "cliente": "nome_cliente_representativo",
    "status_cliente": "status_atual",
}

_ATTRIBUTION_ARRAYS = {
    "business_unit": "business_units_aquisicao",
    "vendedor": "vendedores_aquisicao",
    "estado": "estados_aquisicao",
    "municipio": "municipios_aquisicao",
    "canal_venda": "canais_aquisicao",
}

AttributionDimension = Literal[
    "business_unit", "vendedor", "canal_venda", "estado", "municipio"
]

_QUERY_CATALOG = MappingProxyType({
    "financial_summary": "Financeiro por item com datas válidas até a referência.",
    "acquisition": "Primeiras aquisições observadas e receita dos clientes adquiridos.",
    "acquisition_growth": "Aquisições e crescimento em calendário mensal ou anual denso.",
    "retention": "Retenção mensal e recompra acumulada por safra; M0 separado.",
    "acquisition_quality": "Qualidade por conjuntos de atributos de aquisição.",
    "acquisition_attribution": "Clientes por associação comercial; contagens não aditivas.",
    "lifecycle_summary": "Situação atual, recompra e intervalos entre documentos.",
})


def _filtered_complete_sum(expression: str, predicate: str) -> str:
    """Uma ausência na população selecionada torna a soma desconhecida."""
    return (
        f"CASE WHEN count(*) FILTER (WHERE {predicate}) = 0 THEN 0 "
        f"WHEN count({expression}) FILTER (WHERE {predicate}) = "
        f"count(*) FILTER (WHERE {predicate}) THEN "
        f"sum({expression}) FILTER (WHERE {predicate}) END"
    )


def _repurchase_measures() -> str:
    measures: list[str] = []
    for days in (30, 60, 90, 180):
        eligible = f"count(*) FILTER (WHERE maturidade_{days}d)"
        repurchased = (
            f"count(*) FILTER (WHERE maturidade_{days}d AND recompra_{days}d)"
        )
        measures.extend([
            f"{eligible} AS clientes_elegiveis_recompra_{days}d",
            f"count(*) FILTER (WHERE NOT maturidade_{days}d) AS clientes_imaturos_{days}d",
            f"{repurchased} AS clientes_recompra_{days}d",
            f"100.0 * {repurchased} / nullif({eligible}, 0) AS taxa_recompra_{days}d",
        ])
    return ",\n".join(measures)


def _grouping(
    group_by: tuple[str, ...], allowed: dict[str, str]
) -> dict[str, str]:
    if not isinstance(group_by, tuple) or any(not isinstance(x, str) for x in group_by):
        raise ValueError("group_by deve ser uma tupla de nomes permitidos")
    if len(group_by) != len(set(group_by)):
        raise ValueError("group_by contém dimensões repetidas")
    unknown = set(group_by) - allowed.keys()
    if unknown:
        raise ValueError(f"Dimensões de agrupamento não permitidas: {sorted(unknown)}")
    expressions = [allowed[name] for name in group_by]
    return {
        "dimensions": "".join(
            f'{expression} AS "{name}",\n' for name, expression in zip(group_by, expressions)
        ),
        "group_clause": "GROUP BY " + ", ".join(expressions) if expressions else "",
        "order_clause": "ORDER BY " + ", ".join(
            f'"{name}" NULLS LAST' for name in group_by
        ) if expressions else "",
    }


def _temporal_conditions(
    filters: Filters, expression: str, *, bucket: Literal["month", "year"] | None = None
) -> tuple[list[str], list[object]]:
    predicates: list[str] = []
    parameters: list[object] = []
    for field, part in (("year", "year"), ("month", "month")):
        value = getattr(filters, field)
        if value is not None:
            predicates.append(f"{part}({expression}) = ?")
            parameters.append(value)
    for field, operator in (("start_date", ">="), ("end_date", "<=")):
        value = getattr(filters, field)
        if value is not None:
            predicates.append(
                f"{expression} {operator} " +
                (f"date_trunc('{bucket}', CAST(? AS DATE))" if bucket else "?")
            )
            parameters.append(value)
    return predicates, parameters


class Analytics:
    """Agrega no DuckDB e materializa somente o resultado da consulta em Polars."""

    def __init__(
        self, connection: duckdb.DuckDBPyConnection, reference_date: date | None = None
    ) -> None:
        self.connection = connection
        try:
            metadata = connection.execute(
                "SELECT reference_date, history_start FROM pipeline_metadata"
            ).fetchall()
        except duckdb.CatalogException as exc:
            metadata = []
            if reference_date is None:
                raise ValueError(
                    "Informe reference_date ou execute o pipeline com pipeline_metadata"
                ) from exc
        if metadata:
            if len(metadata) != 1 or metadata[0][0] is None:
                raise ValueError("pipeline_metadata deve conter uma única data de referência")
            snapshot_date, self.history_start = metadata[0]
            if reference_date is not None and reference_date != snapshot_date:
                raise ValueError(
                    "reference_date difere do snapshot; execute novamente o pipeline "
                    "para recalcular status e maturidade"
                )
            reference_date = snapshot_date
        elif reference_date is None:
            raise ValueError("pipeline_metadata deve conter uma única data de referência")
        else:
            self.history_start = connection.execute(
                "SELECT min(data_emissao) FROM fato_vendas WHERE data_emissao <= ?",
                [reference_date],
            ).fetchone()[0] or reference_date
        if not isinstance(reference_date, date) or isinstance(reference_date, datetime):
            raise TypeError("reference_date deve ser datetime.date")
        self.reference_date = reference_date

    @staticmethod
    def catalog() -> dict[str, str]:
        return dict(_QUERY_CATALOG)

    def query(
        self, name: str, filters: Filters | None = None,
        group_by: tuple[str, ...] | None = None,
        *, dimension: AttributionDimension | None = None,
    ) -> pl.DataFrame:
        """Despacho fechado para os métodos documentados, sem executar SQL externo."""
        if name not in _QUERY_CATALOG:
            raise ValueError(f"Consulta desconhecida: {name!r}")
        kwargs: dict[str, object] = {"filters": filters}
        if name == "acquisition_attribution":
            if group_by is not None:
                raise ValueError("acquisition_attribution usa dimension em vez de group_by")
            kwargs["dimension"] = "business_unit" if dimension is None else dimension
        elif dimension is not None:
            raise ValueError("dimension é exclusivo de acquisition_attribution")
        if group_by is not None:
            kwargs["group_by"] = group_by
        return getattr(self, name)(**kwargs)

    def _execute(self, sql: str, parameters: list[object]) -> pl.DataFrame:
        return self.connection.sql(sql, params=parameters).pl()

    @staticmethod
    def _template(name: str) -> str:
        return files("customer_intelligence.sql").joinpath(name).read_text(encoding="utf-8")

    @staticmethod
    def _filters(filters: Filters | None) -> Filters:
        if filters is None:
            return Filters()
        if not isinstance(filters, Filters):
            raise TypeError("filters deve ser Filters ou None")
        return filters

    def financial_summary(
        self, filters: Filters | None = None, group_by: tuple[str, ...] = ()
    ) -> pl.DataFrame:
        """Devoluções e demais status preservados; compra_valida não filtra finanças."""
        filters = self._filters(filters)
        predicates, parameters = _temporal_conditions(filters, "s.data_emissao")
        if filters.company is not None:
            predicates.append(company_predicate("s"))
            parameters.append(filters.company)
        expressions = {
            "business_unit": "s.business_unit", "raiz_cnpj": "s.raiz_cnpj",
            "cliente": "s.nome_cliente", "vendedor": "s.vendedor", "estado": "s.estado",
            "municipio": "s.municipio", "canal_venda": "s.canal_venda",
            "familia": "s.familia", "codigo_produto": "s.codigo_produto",
            "safra_aquisicao": "d.safra_aquisicao", "status_cliente": "d.status_atual",
        }
        for field, expression in expressions.items():
            value = getattr(filters, field)
            if value is not None:
                predicates.append(f"{expression} = ?")
                parameters.append(value)
        if filters.valid_purchases_gt is not None:
            predicates.append("coalesce(d.quantidade_compras_validas,0) > ?")
            parameters.append(filters.valid_purchases_gt)
        sql = self._template("revenue.sql").format(
            **_grouping(group_by, _FINANCIAL_DIMENSIONS),
            filters="".join(f" AND {predicate}" for predicate in predicates),
            financial_measures=financial_aggregates(),
            document_accounting=_filtered_complete_sum(
                "faturamento_contabil", "identificador_documento IS NOT NULL"
            ),
            document_net=_filtered_complete_sum(
                "faturamento_liquido", "identificador_documento IS NOT NULL"
            ),
            customer_net=_filtered_complete_sum("faturamento_liquido", "raiz_cnpj IS NOT NULL"),
            new_customer_net=_filtered_complete_sum(
                "faturamento_liquido", "mes_referencia = mes_aquisicao_cliente"
            ),
            net_total=complete_sum("faturamento_liquido"),
        )
        return self._execute(sql, [self.reference_date, *parameters])

    def _clients_cte(
        self, filters: Filters, *, acquisition_required: bool = True
    ) -> tuple[str, list[object]]:
        if filters.familia is not None or filters.codigo_produto is not None:
            raise ValueError(
                "Filtros produto/família estão disponíveis em financial_summary; "
                "a atribuição de produto à aquisição depende de regra comercial validada"
            )
        predicates, parameters = _temporal_conditions(filters, "a.data_aquisicao")
        if filters.valid_purchases_gt is not None:
            predicates.append("coalesce(d.quantidade_compras_validas,0) > ?")
            parameters.append(filters.valid_purchases_gt)
        for field, expression in {
            "raiz_cnpj": "d.raiz_cnpj", "cliente": "d.nome_cliente_representativo",
            "safra_aquisicao": "a.safra_aquisicao", "status_cliente": "d.status_atual",
        }.items():
            value = getattr(filters, field)
            if value is not None:
                predicates.append(f"{expression} = ?")
                parameters.append(value)
        for field, column in _ATTRIBUTION_ARRAYS.items():
            value = getattr(filters, field)
            if value is not None:
                predicates.append(f"list_contains(a.{column}, ?)")
                parameters.append(value)
        if acquisition_required:
            predicates.append("a.data_aquisicao IS NOT NULL")
        predicates.append("(a.data_aquisicao IS NULL OR a.data_aquisicao <= ?)")
        parameters.append(self.reference_date)
        customer_fields = [
            "nome_cliente_representativo", "status_atual", "quantidade_compras_validas",
            "data_primeira_compra", "data_ultima_compra", "data_segunda_compra",
            "dias_ate_segunda_compra", "dias_desde_ultima_compra",
            *[f"{prefix}_{days}d" for days in (30, 60, 90, 180)
              for prefix in ("maturidade", "recompra")],
        ]
        prefix = ""
        prefix_parameters = []
        acquisition_fields = "a.* EXCLUDE (raiz_cnpj)"
        company_join = ""
        if filters.company is not None:
            # A empresa restringe a atribuição do primeiro dia global, sem
            # readquirir clientes que só compraram nela posteriormente.
            prefix = f"""company_first_day AS (
                SELECT v.raiz_cnpj,{financial_aggregates(table_alias='v')},
                    count(DISTINCT v.identificador_documento) AS documents
                FROM fato_vendas v JOIN dim_clientes d USING(raiz_cnpj)
                WHERE v.compra_valida AND v.data_emissao=d.data_primeira_compra
                    AND {company_predicate('v')}
                    AND v.data_emissao BETWEEN ? AND ? GROUP BY v.raiz_cnpj), """
            prefix_parameters = [filters.company, self.history_start, self.reference_date]
            replacements = {
                "valor_primeira_compra": "faturamento_contabil",
                "faturamento_liquido_primeira_compra": "faturamento_liquido",
                "impostos_primeira_compra": "impostos",
                "margem_primeira_compra": "margem_bruta_valor",
                "margem_bruta_percentual_primeira_compra": "margem_bruta_percentual",
                "percentual_impostos_primeira_compra": "percentual_impostos",
            }
            acquisition_fields = (
                "a.* EXCLUDE (raiz_cnpj,quantidade_documentos_primeiro_dia,"
                + ",".join(replacements) + "), cf.documents AS quantidade_documentos_primeiro_dia, "
                + ", ".join(f"CASE WHEN NOT a.atribuicao_comercial_pendente THEN cf.{source} END AS {target}"
                            for target, source in replacements.items())
            )
            company_join = " LEFT JOIN company_first_day cf ON cf.raiz_cnpj=d.raiz_cnpj"
            if acquisition_required:
                predicates.append("cf.raiz_cnpj IS NOT NULL")
            else:
                predicates.append("""(cf.raiz_cnpj IS NOT NULL OR (a.data_aquisicao IS NULL AND EXISTS (
                    SELECT 1 FROM stg_transacoes cs WHERE cs.raiz_cnpj=d.raiz_cnpj AND cs.empresa=?
                    AND (cs.data_emissao IS NULL OR cs.data_emissao BETWEEN ? AND ?))))""")
                parameters.extend([filters.company, self.history_start, self.reference_date])
        cte = prefix + (
            f"selected_clients AS (SELECT d.raiz_cnpj, {acquisition_fields}, "
            + ", ".join(f"d.{column}" for column in customer_fields)
            + " FROM dim_clientes d LEFT JOIN fato_aquisicao a USING (raiz_cnpj)" + company_join + " WHERE "
            + " AND ".join(predicates) + ")"
        )
        return cte, [*prefix_parameters, *parameters]

    def acquisition(
        self, filters: Filters | None = None,
        group_by: tuple[str, ...] = ("mes_aquisicao",),
    ) -> pl.DataFrame:
        return self._acquisition(self._filters(filters), group_by, quality=False)

    def acquisition_quality(
        self, filters: Filters | None = None,
        group_by: tuple[str, ...] = ("business_unit", "vendedor", "safra_aquisicao"),
    ) -> pl.DataFrame:
        """Conjuntos de BUs/vendedores evitam atribuir integralmente receita várias vezes."""
        return self._acquisition(self._filters(filters), group_by, quality=True)

    def acquisition_attribution(
        self, dimension: AttributionDimension = "business_unit",
        filters: Filters | None = None,
    ) -> pl.DataFrame:
        """Conta raízes por membro do primeiro dia, sem distribuir valores financeiros.

        As contagens entre membros não são aditivas: uma raiz pode ter vários
        atributos. Filtros selecionam raízes antes da expansão das associações.
        """
        if dimension not in _ATTRIBUTION_ARRAYS:
            raise ValueError(f"Dimensão de atribuição não permitida: {dimension!r}")
        clients_cte, parameters = self._clients_cte(self._filters(filters))
        sql = self._template("attribution.sql").format(
            clients_cte=clients_cte, array_column=_ATTRIBUTION_ARRAYS[dimension],
            dimension=dimension,
        )
        return self._execute(sql, parameters)

    def _acquisition(
        self, filters: Filters, group_by: tuple[str, ...], *, quality: bool
    ) -> pl.DataFrame:
        clients_cte, parameters = self._clients_cte(filters)
        first_purchase_totals = ",\n".join([
            f"{complete_sum(column)} AS {column}"
            for column in (
                "valor_primeira_compra", "faturamento_liquido_primeira_compra",
                "impostos_primeira_compra", "margem_primeira_compra",
            )
        ])
        sql = self._template("acquisition.sql").format(
            **_grouping(group_by, _CLIENT_DIMENSIONS),
            clients_cte=clients_cte,
            client_financial_measures=financial_aggregates(table_alias="s"),
            acquisition_month_accounting=_filtered_complete_sum(
                "s.faturamento_contabil", "s.mes_referencia = c.mes_aquisicao"
            ),
            acquisition_month_net=_filtered_complete_sum(
                "s.faturamento_liquido", "s.mes_referencia = c.mes_aquisicao"
            ),
            acquisition_month_margin=_filtered_complete_sum(
                "s.margem_bruta_valor", "s.mes_referencia = c.mes_aquisicao"
            ),
            financial_measures=financial_aggregates(),
            net_total=complete_sum("faturamento_liquido"),
            margin_total=complete_sum("margem_bruta_valor"),
            acquisition_month_totals=",\n".join(
                f"{complete_sum(column)} AS {column}" for column in (
                    "faturamento_contabil_mes_aquisicao", "faturamento_liquido_mes_aquisicao",
                    "margem_bruta_mes_aquisicao",
                )
            ),
            first_purchase_totals=first_purchase_totals,
            company_filter=(" AND " + company_predicate("s")) if filters.company is not None else "",
            repurchase_measures=_repurchase_measures(),
            pending_retention=(
                ", CAST(NULL AS DOUBLE) AS retencao_90d, "
                "CAST(NULL AS DOUBLE) AS retencao_180d, "
                "'PENDENTE_DEFINICAO_JANELA_RETENCAO' AS definicao_retencao_dias"
                if quality else ""
            ),
        )
        return self._execute(sql, [*parameters, self.reference_date,
                                   *([filters.company] if filters.company is not None else [])])

    def retention(
        self, filters: Filters | None = None,
        group_by: tuple[str, ...] = ("safra_aquisicao", "meses_desde_aquisicao"),
    ) -> pl.DataFrame:
        """Safras mensais com denominadores maduros; M0 não representa retenção."""
        if not {"safra_aquisicao", "meses_desde_aquisicao"}.issubset(group_by):
            raise ValueError("retention requer safra_aquisicao e meses_desde_aquisicao")
        allowed = {
            **_CLIENT_DIMENSIONS,
            "meses_desde_aquisicao": "meses_desde_aquisicao",
            "mes_referencia": "mes_referencia",
        }
        clients_cte, parameters = self._clients_cte(self._filters(filters))
        sql = self._template("retention.sql").format(
            **_grouping(group_by, allowed), clients_cte=clients_cte,
            financial_measures=financial_aggregates(suffix="_periodo"),
        )
        return self._execute(sql, parameters)

    def lifecycle_summary(
        self, filters: Filters | None = None,
        group_by: tuple[str, ...] = ("status_cliente",),
    ) -> pl.DataFrame:
        clients_cte, parameters = self._clients_cte(
            self._filters(filters), acquisition_required=False
        )
        sql = self._template("lifecycle.sql").format(
            **_grouping(group_by, _CLIENT_DIMENSIONS), clients_cte=clients_cte,
            repurchase_measures=_repurchase_measures(),
        )
        return self._execute(sql, [*parameters, self.reference_date])

    def acquisition_growth(
        self, filters: Filters | None = None,
        group_by: tuple[str, ...] = (),
        frequency: Literal["month", "year"] = "month",
    ) -> pl.DataFrame:
        """LAG em calendário denso; datas do filtro selecionam buckets completos."""
        if frequency not in ("month", "year"):
            raise ValueError("frequency deve ser month ou year")
        allowed = {k: v for k, v in _CLIENT_DIMENSIONS.items() if k not in {
            "year", "month", "mes_aquisicao", "ano_aquisicao", "safra_aquisicao"
        }}
        _grouping(group_by, allowed)
        filters = self._filters(filters)
        if frequency == "year" and filters.month is not None:
            raise ValueError("month não se aplica ao crescimento com frequency='year'")
        cohort_filters = filters.model_copy(update={
            "year": None, "month": None, "start_date": None, "end_date": None,
        })
        clients_cte, parameters = self._clients_cte(cohort_filters)
        dimensions = ", ".join(f'"{name}"' for name in group_by)
        select_dimensions = (dimensions + ", ") if dimensions else ""
        expressions = ", ".join(
            f'{allowed[name]} AS "{name}"' for name in group_by
        )
        groups = (
            f"SELECT DISTINCT {expressions} FROM selected_clients"
            if group_by else "SELECT 1 AS singleton"
        )
        join_dimensions = "".join(
            f' AND n."{name}" IS NOT DISTINCT FROM g."{name}"' for name in group_by
        )
        numbered_dimensions = ", ".join(str(i + 2) for i in range(len(group_by)))
        group_clause = "GROUP BY 1" + (
            ", " + numbered_dimensions if group_by else ""
        )
        partition = f"PARTITION BY {dimensions} " if group_by else ""
        predicates, temporal_params = _temporal_conditions(filters, "periodo", bucket=frequency)
        period_filter = "WHERE " + " AND ".join(predicates) if predicates else ""
        # Todas as dimensões e a unidade do intervalo foram validadas em allowlists.
        sql = f"""
        WITH {clients_cte}, bounds AS (
            SELECT CAST(? AS DATE) AS history_start
        ), calendar AS (
            SELECT CAST(periodo AS DATE) AS periodo
            FROM bounds, generate_series(
                date_trunc('{frequency}', history_start),
                date_trunc('{frequency}', CAST(? AS DATE)),
                INTERVAL 1 {frequency}
            ) periods(periodo)
        ), groups AS ({groups}), new_customers AS (
            SELECT CAST(date_trunc('{frequency}', data_aquisicao) AS DATE) AS periodo,
                   {expressions + ',' if expressions else ''} count(*) AS clientes_novos
            FROM selected_clients {group_clause}
        ), dense AS (
            SELECT c.periodo, {''.join(f'g."{name}", ' for name in group_by)}
                   coalesce(n.clientes_novos, 0) AS clientes_novos
            FROM calendar c CROSS JOIN groups g LEFT JOIN new_customers n
              ON n.periodo = c.periodo {join_dimensions}
        ), growth AS (
            SELECT *, lag(clientes_novos) OVER ({partition}ORDER BY periodo) AS anterior,
                   lag(clientes_novos, {12 if frequency == 'month' else 1})
                     OVER ({partition}ORDER BY periodo) AS ano_anterior
            FROM dense
        )
        SELECT periodo, {select_dimensions} clientes_novos,
               100.0 * (clientes_novos - anterior) / nullif(anterior, 0)
                   AS crescimento_{'mensal' if frequency == 'month' else 'anual'}_percentual
               {', 100.0 * (clientes_novos - ano_anterior) / nullif(ano_anterior, 0) AS crescimento_anual_percentual' if frequency == 'month' else ''}
        FROM growth {period_filter} ORDER BY {select_dimensions} periodo
        """
        return self._execute(sql, [
            *parameters, self.history_start, self.reference_date, *temporal_params
        ])
