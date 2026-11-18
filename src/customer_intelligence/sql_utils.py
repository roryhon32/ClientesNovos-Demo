"""Expressões financeiras oficiais e agregações com completude explícita."""


def company_predicate(fact_alias: str) -> str:
    """Empresa da linha original, inclusive em snapshots sem coluna no fato.

    O alias é interno; o valor da empresa ocupa sempre um parâmetro SQL.
    EXISTS preserva a granularidade dos itens financeiros.
    """
    return ("EXISTS (SELECT 1 FROM stg_transacoes company_source "
            f"WHERE company_source.source_row_id={fact_alias}.source_row_id "
            "AND company_source.empresa=?)")


def complete_sum(expression: str) -> str:
    return f"CASE WHEN count({expression}) = count(*) THEN sum({expression}) END"


def financial_aggregates(suffix: str = "", table_alias: str | None = None) -> str:
    p = f"{table_alias}." if table_alias else ""
    accounting = complete_sum(p + "faturamento_contabil")
    net = complete_sum(p + "faturamento_liquido")
    margin = complete_sum(p + "margem_bruta_valor")
    taxes = f"({accounting} - {net})"
    return ",\n".join([
        f"{accounting} AS faturamento_contabil{suffix}",
        f"{net} AS faturamento_liquido{suffix}",
        f"{taxes} AS impostos{suffix}",
        f"{margin} AS margem_bruta_valor{suffix}",
        f"100.0 * {taxes} / NULLIF({accounting}, 0) AS percentual_impostos{suffix}",
        f"100.0 * {margin} / NULLIF({net}, 0) AS margem_bruta_percentual{suffix}",
    ])
