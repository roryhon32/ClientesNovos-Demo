"""Exact financial reconciliation against item facts, including explicit exclusions."""

from __future__ import annotations

from typing import TYPE_CHECKING

from customer_intelligence.sql_utils import financial_aggregates

if TYPE_CHECKING:
    import duckdb


_MONEY = ("faturamento_contabil", "faturamento_liquido", "impostos", "margem_bruta_valor")
_RATIOS = ("percentual_impostos", "margem_bruta_percentual")


def _assert_comparison(
    connection: duckdb.DuckDBPyConnection,
    expected_query: str,
    actual_table: str,
    keys: tuple[str, ...],
    pairs: tuple[tuple[str, str], ...],
) -> None:
    """Compare both directions so absent and extra groups cannot disappear."""
    join = " AND ".join(f"e.{key} IS NOT DISTINCT FROM a.{key}" for key in keys)
    equal = " AND ".join(
        f"e.{expected} IS NOT DISTINCT FROM a.{actual}" for expected, actual in pairs
    )
    key_projection = ", ".join(f"COALESCE(e.{key}, a.{key}) AS {key}" for key in keys)
    mismatches = connection.execute(f"""
        WITH expected AS ({expected_query})
        SELECT {key_projection}
        FROM expected e FULL OUTER JOIN {actual_table} a ON {join}
        WHERE e.{keys[0]} IS NULL OR a.{keys[0]} IS NULL OR NOT ({equal})
        LIMIT 5
    """).fetchall()
    if mismatches:
        raise AssertionError(f"Reconciliação por grupo falhou em {actual_table}: {mismatches}")


def reconcile_monthly_cohort(connection: duckdb.DuckDBPyConnection) -> None:
    """Reconcile strict amounts and percentages without hiding missing groups.

    ``reconciliacao_financeira`` separates financial exclusions from the monthly
    and cohort scopes. All item rows remain accounted for, including unknown
    values, unidentifiable roots and invalid/future dates.
    """
    known = ",\n".join(
        f"SUM({name}) AS {name}_conhecido, "
        f"COUNT(*) FILTER (WHERE {name} IS NULL)::BIGINT AS itens_{name}_desconhecido"
        for name in _MONEY
    )
    connection.execute(f"""
        CREATE OR REPLACE TABLE reconciliacao_financeira AS
        WITH classified AS (
            SELECT v.*,
                   CASE WHEN v.data_emissao IS NULL THEN 'sem_data_valida'
                        WHEN v.data_emissao < s.history_start THEN 'anterior_historico'
                        WHEN v.data_emissao > s.reference_date THEN 'futuro'
                        WHEN v.raiz_cnpj IS NULL THEN 'sem_raiz_identificada'
                        WHEN d.data_primeira_compra IS NULL THEN 'cliente_sem_compra_valida'
                        WHEN date_trunc('month', v.data_emissao) < d.mes_aquisicao
                            THEN 'anterior_aquisicao'
                        ELSE 'incluido_cohort' END AS bucket
            FROM fato_vendas v LEFT JOIN dim_clientes d USING (raiz_cnpj)
            CROSS JOIN _ci_model_settings s
        )
        SELECT bucket,
               bucket IN ('cliente_sem_compra_valida', 'anterior_aquisicao', 'incluido_cohort')
                    AS escopo_mensal,
               bucket = 'incluido_cohort' AS escopo_cohort,
               COUNT(*)::BIGINT AS quantidade_itens,
               COUNT(DISTINCT raiz_cnpj)::BIGINT AS quantidade_clientes,
               {known},
               {financial_aggregates()}
        FROM classified GROUP BY bucket
    """)

    monthly_expected_money = ",\n".join(
        f"CASE WHEN f.quantidade_itens IS NULL THEN 0::DECIMAL(38,6) "
        f"ELSE f.{name} END AS {name}"
        for name in _MONEY
    )
    monthly_expected = f"""
        WITH universe AS (
            SELECT raiz_cnpj, MIN(data_emissao) AS primeira_data
            FROM fato_vendas CROSS JOIN _ci_model_settings s
            WHERE raiz_cnpj IS NOT NULL AND (
                data_emissao IS NULL OR data_emissao BETWEEN s.history_start AND s.reference_date
            ) GROUP BY raiz_cnpj
        ), grid AS (
            SELECT u.raiz_cnpj, m.mes_referencia::DATE AS mes_referencia
            FROM universe u CROSS JOIN _ci_model_settings s
            CROSS JOIN LATERAL generate_series(
                date_trunc('month', COALESCE(u.primeira_data, s.history_start)),
                date_trunc('month', s.reference_date), INTERVAL '1 month'
            ) m(mes_referencia)
        ), finance AS (
            SELECT raiz_cnpj, date_trunc('month', data_emissao)::DATE AS mes_referencia,
                   COUNT(*)::BIGINT AS quantidade_itens,
                   COUNT(DISTINCT identificador_documento)::BIGINT AS quantidade_documentos,
                   COUNT(*) FILTER (WHERE identificador_documento IS NULL)::BIGINT
                       AS quantidade_sem_documento,
                   {financial_aggregates()}
            FROM fato_vendas CROSS JOIN _ci_model_settings s
            WHERE raiz_cnpj IS NOT NULL
              AND data_emissao BETWEEN s.history_start AND s.reference_date
            GROUP BY raiz_cnpj, date_trunc('month', data_emissao)::DATE
        )
        SELECT g.raiz_cnpj, g.mes_referencia,
               COALESCE(f.quantidade_itens, 0)::BIGINT AS quantidade_itens,
               COALESCE(f.quantidade_documentos, 0)::BIGINT AS quantidade_documentos,
               COALESCE(f.quantidade_sem_documento, 0)::BIGINT AS quantidade_sem_documento,
               {monthly_expected_money}, f.percentual_impostos, f.margem_bruta_percentual
        FROM grid g LEFT JOIN finance f USING (raiz_cnpj, mes_referencia)
    """
    _assert_comparison(
        connection, monthly_expected, "fato_clientes_mensal", ("raiz_cnpj", "mes_referencia"),
        tuple((name, f"{name}_mes") for name in (*_MONEY, *_RATIOS)) + (
            ("quantidade_itens", "quantidade_itens_financeiros_mes"),
            ("quantidade_documentos", "quantidade_documentos_financeiros_mes"),
            ("quantidade_sem_documento", "quantidade_itens_sem_documento_mes"),
        ),
    )

    cohort_expected_money = ",\n".join(
        f"CASE WHEN f.quantidade_itens IS NULL THEN 0::DECIMAL(38,6) "
        f"ELSE f.{name} END AS {name}"
        for name in _MONEY
    )
    cohort_expected = f"""
        WITH vintages AS (
            SELECT safra_aquisicao, mes_aquisicao, COUNT(*)::BIGINT AS clientes
            FROM dim_clientes WHERE mes_aquisicao IS NOT NULL
            GROUP BY safra_aquisicao, mes_aquisicao
        ), grid AS (
            SELECT v.safra_aquisicao, v.clientes, m.mes_referencia::DATE AS mes_referencia,
                   date_diff('month', v.mes_aquisicao, m.mes_referencia)::INTEGER
                       AS meses_desde_aquisicao,
                   last_day(m.mes_referencia) <= s.reference_date AS periodo_completo
            FROM vintages v CROSS JOIN _ci_model_settings s
            CROSS JOIN LATERAL generate_series(
                v.mes_aquisicao, date_trunc('month', s.reference_date), INTERVAL '1 month'
            ) m(mes_referencia)
        ), finance AS (
            SELECT d.safra_aquisicao, date_trunc('month', v.data_emissao)::DATE AS mes_referencia,
                   COUNT(*)::BIGINT AS quantidade_itens,
                   {financial_aggregates(table_alias='v')}
            FROM fato_vendas v JOIN dim_clientes d USING (raiz_cnpj)
            CROSS JOIN _ci_model_settings s
            WHERE d.mes_aquisicao IS NOT NULL
              AND v.data_emissao BETWEEN s.history_start AND s.reference_date
              AND date_trunc('month', v.data_emissao) >= d.mes_aquisicao
            GROUP BY d.safra_aquisicao, date_trunc('month', v.data_emissao)::DATE
        )
        SELECT g.safra_aquisicao, g.meses_desde_aquisicao,
               g.clientes AS clientes_observados,
               CASE WHEN g.periodo_completo THEN g.clientes ELSE 0 END::BIGINT
                   AS clientes_elegiveis,
               CASE WHEN g.meses_desde_aquisicao = 0 THEN g.clientes ELSE 0 END::BIGINT
                   AS clientes_adquiridos,
               g.periodo_completo,
               {cohort_expected_money}, f.percentual_impostos, f.margem_bruta_percentual
        FROM grid g LEFT JOIN finance f USING (safra_aquisicao, mes_referencia)
    """
    _assert_comparison(
        connection, cohort_expected, "fato_cohort", ("safra_aquisicao", "meses_desde_aquisicao"),
        tuple((name, f"{name}_periodo") for name in (*_MONEY, *_RATIOS)) + (
            ("clientes_observados", "clientes_observados"),
            ("clientes_elegiveis", "clientes_elegiveis"),
            ("clientes_adquiridos", "clientes_adquiridos"),
            ("periodo_completo", "periodo_completo"),
        ),
    )
