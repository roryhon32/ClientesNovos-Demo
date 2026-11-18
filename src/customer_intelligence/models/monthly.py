"""Dense customer calendar with point-in-time purchases and financial measures."""

from __future__ import annotations

from typing import TYPE_CHECKING

from customer_intelligence.sql_utils import financial_aggregates

from .lifecycle import status_expression

if TYPE_CHECKING:
    import duckdb


def build_monthly(connection: duckdb.DuckDBPyConnection) -> None:
    connection.execute(f"""
        CREATE OR REPLACE TEMP TABLE _ci_financeiro_mensal AS
        SELECT raiz_cnpj, date_trunc('month', data_emissao)::DATE AS mes_referencia,
               COUNT(*) AS quantidade_itens_financeiros_mes,
               COUNT(DISTINCT identificador_documento) AS quantidade_documentos_financeiros_mes,
               COUNT(*) FILTER (WHERE identificador_documento IS NULL)
                    AS quantidade_itens_sem_documento_mes,
               {financial_aggregates(suffix='_mes')}
        FROM fato_vendas CROSS JOIN _ci_model_settings s
        WHERE raiz_cnpj IS NOT NULL
          AND data_emissao BETWEEN s.history_start AND s.reference_date
        GROUP BY raiz_cnpj, date_trunc('month', data_emissao)::DATE
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP TABLE _ci_compras_mensal AS
        SELECT raiz_cnpj, date_trunc('month', data_compra)::DATE AS mes_referencia,
               COUNT(*) AS quantidade_notas_mes,
               MAX(data_compra) AS data_ultima_compra_mes
        FROM compras_validas GROUP BY raiz_cnpj, date_trunc('month', data_compra)::DATE
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP TABLE _ci_source_status_observations AS
        SELECT raiz_cnpj, UPPER(TRIM(cliente_status_origem)) AS status_origem,
               MIN(data_emissao) AS primeira_observacao
        FROM fato_vendas CROSS JOIN _ci_model_settings s
        WHERE raiz_cnpj IS NOT NULL
          AND NULLIF(TRIM(cliente_status_origem), '') IS NOT NULL
          AND data_emissao BETWEEN s.history_start AND s.reference_date
        GROUP BY raiz_cnpj, UPPER(TRIM(cliente_status_origem))
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP TABLE _ci_customer_calendar AS
        WITH grid AS (
            SELECT d.raiz_cnpj, d.data_primeira_compra,
                   m.mes_referencia::DATE AS mes_referencia,
                   LEAST(last_day(m.mes_referencia), s.reference_date)::DATE
                       AS data_referencia_mes,
                   last_day(m.mes_referencia) <= s.reference_date AS periodo_completo
            FROM dim_clientes d CROSS JOIN _ci_model_settings s
            CROSS JOIN LATERAL generate_series(
                date_trunc('month', COALESCE(d.data_primeira_observacao, s.history_start)),
                date_trunc('month', s.reference_date), INTERVAL '1 month'
            ) AS m(mes_referencia)
        ), joined AS (
            SELECT g.*,
                   COALESCE(c.quantidade_notas_mes, 0)::BIGINT AS quantidade_notas_mes,
                   c.data_ultima_compra_mes,
                   COUNT(o.status_origem) AS quantidade_status_origem_ate_mes,
                   COUNT(o.status_origem) FILTER (WHERE o.status_origem = 'SEM CLASSIFICAÇÃO')
                       AS quantidade_status_especial_ate_mes
            FROM grid g
            LEFT JOIN _ci_compras_mensal c USING (raiz_cnpj, mes_referencia)
            LEFT JOIN _ci_source_status_observations o
                ON o.raiz_cnpj = g.raiz_cnpj AND o.primeira_observacao <= g.data_referencia_mes
            GROUP BY ALL
        )
        SELECT *, MAX(data_ultima_compra_mes) OVER customer_months AS data_ultima_compra_ate_mes,
                  SUM(quantidade_notas_mes) OVER customer_months::BIGINT
                      AS quantidade_compras_acumuladas
        FROM joined
        WINDOW customer_months AS (
            PARTITION BY raiz_cnpj ORDER BY mes_referencia
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
    """)
    status = status_expression(
        "g.data_primeira_compra", "g.data_ultima_compra_ate_mes", "g.data_referencia_mes",
        "g.quantidade_status_origem_ate_mes = 1 AND g.quantidade_status_especial_ate_mes = 1",
    )
    # Missing months have known zero activity; existing rows with NULL financial
    # values retain that uncertainty instead of being silently changed to zero.
    money = ",\n".join(
        f"CASE WHEN f.quantidade_itens_financeiros_mes IS NULL THEN 0::DECIMAL(38,6) "
        f"ELSE f.{field}_mes END AS {field}_mes"
        for field in ("faturamento_contabil", "faturamento_liquido", "impostos", "margem_bruta_valor")
    )
    connection.execute(f"""
        CREATE OR REPLACE TABLE fato_clientes_mensal AS
        SELECT g.raiz_cnpj, g.mes_referencia,
               {status} AS status_historico,
               {status} AS cliente_status_historico,
               g.data_ultima_compra_ate_mes,
               date_diff('day', g.data_ultima_compra_ate_mes, g.data_referencia_mes) AS dias_sem_compra,
               g.quantidade_notas_mes, g.quantidade_compras_acumuladas,
               COALESCE(f.quantidade_itens_financeiros_mes, 0)::BIGINT
                   AS quantidade_itens_financeiros_mes,
               COALESCE(f.quantidade_documentos_financeiros_mes, 0)::BIGINT
                   AS quantidade_documentos_financeiros_mes,
               COALESCE(f.quantidade_itens_sem_documento_mes, 0)::BIGINT
                   AS quantidade_itens_sem_documento_mes,
               {money},
               f.percentual_impostos_mes, f.margem_bruta_percentual_mes,
               g.data_referencia_mes, g.periodo_completo,
               (s.special_status_policy = 'pending'
                   AND g.quantidade_status_especial_ate_mes > 0) AS status_especial_pendente
        FROM _ci_customer_calendar g
        LEFT JOIN _ci_financeiro_mensal f USING (raiz_cnpj, mes_referencia)
        CROSS JOIN _ci_model_settings s
    """)
