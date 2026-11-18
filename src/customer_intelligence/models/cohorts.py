"""Calendar-period retention and cumulative second-document repurchase."""

from __future__ import annotations

from typing import TYPE_CHECKING

from customer_intelligence.sql_utils import financial_aggregates

if TYPE_CHECKING:
    import duckdb


def build_cohorts(connection: duckdb.DuckDBPyConnection) -> None:
    """Keep M0 acquisition separate and suppress rates for unfinished months."""
    connection.execute(f"""
        CREATE OR REPLACE TABLE fato_cohort AS
        WITH observations AS (
            SELECT d.safra_aquisicao, d.mes_aquisicao,
                   m.mes_referencia,
                   date_diff('month', d.mes_aquisicao, m.mes_referencia)::INTEGER
                       AS meses_desde_aquisicao,
                   m.periodo_completo, m.quantidade_notas_mes,
                   d.data_segunda_compra <= m.data_referencia_mes AS recompra_observada,
                   m.faturamento_contabil_mes AS faturamento_contabil,
                   m.faturamento_liquido_mes AS faturamento_liquido,
                   m.impostos_mes AS impostos,
                   m.margem_bruta_valor_mes AS margem_bruta_valor
            FROM fato_clientes_mensal m JOIN dim_clientes d USING (raiz_cnpj)
            WHERE d.mes_aquisicao IS NOT NULL AND m.mes_referencia >= d.mes_aquisicao
        ), totals AS (
            SELECT safra_aquisicao, mes_aquisicao, mes_referencia, meses_desde_aquisicao,
                   periodo_completo,
                   COUNT(*)::BIGINT AS clientes_observados,
                   CASE WHEN periodo_completo THEN COUNT(*) ELSE 0 END::BIGINT
                       AS clientes_elegiveis,
                   CASE WHEN meses_desde_aquisicao = 0 THEN COUNT(*) ELSE 0 END::BIGINT
                       AS clientes_adquiridos,
                   CASE WHEN meses_desde_aquisicao > 0
                        THEN COUNT(*) FILTER (WHERE quantidade_notas_mes > 0) END::BIGINT
                       AS clientes_retidos,
                   COUNT(*) FILTER (WHERE recompra_observada)::BIGINT
                       AS clientes_com_recompra_acumulada,
                   {financial_aggregates(suffix='_periodo')}
            FROM observations GROUP BY safra_aquisicao, mes_aquisicao, mes_referencia,
                                       meses_desde_aquisicao, periodo_completo
        )
        SELECT *,
               CASE WHEN periodo_completo AND meses_desde_aquisicao > 0
                    THEN 100.0 * clientes_retidos / NULLIF(clientes_elegiveis, 0) END
                    AS taxa_retencao,
               CASE WHEN periodo_completo
                    THEN 100.0 * clientes_com_recompra_acumulada
                              / NULLIF(clientes_elegiveis, 0) END AS taxa_recompra_acumulada,
               margem_bruta_valor_periodo AS margem_bruta_periodo
        FROM totals
    """)
