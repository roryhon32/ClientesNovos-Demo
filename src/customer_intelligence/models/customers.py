"""Customer identity, distinct valid purchases, and acquisition observations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from customer_intelligence.sql_utils import financial_aggregates

from .lifecycle import status_expression

if TYPE_CHECKING:
    import duckdb


def build_customers(connection: duckdb.DuckDBPyConnection) -> None:
    """Build one customer per valid root without discarding source fact rows."""
    finance = financial_aggregates()
    connection.execute(f"""
        CREATE OR REPLACE TABLE compras_validas AS
        SELECT raiz_cnpj, identificador_documento,
               MIN(data_emissao)::DATE AS data_compra,
               COUNT(*) AS quantidade_itens,
               list_sort(list(DISTINCT business_unit) FILTER (WHERE business_unit IS NOT NULL))
                   AS business_units,
               list_sort(list(DISTINCT vendedor) FILTER (WHERE vendedor IS NOT NULL)) AS vendedores,
               list_sort(list(DISTINCT canal_venda) FILTER (WHERE canal_venda IS NOT NULL)) AS canais,
               {finance}
        FROM fato_vendas CROSS JOIN _ci_model_settings s
        WHERE compra_valida AND raiz_cnpj IS NOT NULL
          AND identificador_documento IS NOT NULL
          AND data_emissao BETWEEN s.history_start AND s.reference_date
        GROUP BY raiz_cnpj, identificador_documento
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP TABLE _ci_compras_cliente AS
        WITH ordered AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY raiz_cnpj ORDER BY data_compra, identificador_documento
            ) AS ordem_compra,
            date_diff('day', lag(data_compra) OVER (
                PARTITION BY raiz_cnpj ORDER BY data_compra, identificador_documento
            ), data_compra) AS intervalo_dias
            FROM compras_validas
        )
        SELECT raiz_cnpj, MIN(data_compra) AS data_primeira_compra,
               MAX(data_compra) AS data_ultima_compra,
               MAX(data_compra) FILTER (WHERE ordem_compra = 2) AS data_segunda_compra,
               COUNT(*) AS quantidade_compras_validas,
               AVG(intervalo_dias) AS intervalo_medio_entre_compras
        FROM ordered GROUP BY raiz_cnpj
    """)
    connection.execute("""
        CREATE OR REPLACE TEMP TABLE _ci_customer_universe AS
        SELECT raiz_cnpj,
               MIN(NULLIF(TRIM(nome_cliente), '')) AS nome_cliente_representativo,
               MIN(data_emissao) AS data_primeira_observacao,
               COALESCE(list_sort(list(DISTINCT NULLIF(UPPER(TRIM(cliente_status_origem)), ''))
                   FILTER (WHERE NULLIF(TRIM(cliente_status_origem), '') IS NOT NULL)),
                   []::VARCHAR[]) AS status_origem,
               MIN(data_emissao) FILTER (
                   WHERE UPPER(TRIM(cliente_status_origem)) = 'SEM CLASSIFICAÇÃO'
               ) AS primeira_observacao_status_especial
        FROM fato_vendas CROSS JOIN _ci_model_settings s
        WHERE raiz_cnpj IS NOT NULL AND (
            data_emissao IS NULL OR data_emissao BETWEEN s.history_start AND s.reference_date
        ) GROUP BY raiz_cnpj
    """)
    connection.execute(f"""
        CREATE OR REPLACE TEMP TABLE _ci_primeiro_dia AS
        SELECT f.raiz_cnpj,
               COUNT(DISTINCT f.identificador_documento) AS quantidade_documentos_primeiro_dia,
               COALESCE(list_sort(list(DISTINCT business_unit)
                   FILTER (WHERE business_unit IS NOT NULL)), []::VARCHAR[]) AS business_units,
               COALESCE(list_sort(list(DISTINCT vendedor)
                   FILTER (WHERE vendedor IS NOT NULL)), []::VARCHAR[]) AS vendedores,
               COALESCE(list_sort(list(DISTINCT canal_venda)
                   FILTER (WHERE canal_venda IS NOT NULL)), []::VARCHAR[]) AS canais,
               COALESCE(list_sort(list(DISTINCT estado)
                   FILTER (WHERE estado IS NOT NULL)), []::VARCHAR[]) AS estados,
               COALESCE(list_sort(list(DISTINCT municipio)
                   FILTER (WHERE municipio IS NOT NULL)), []::VARCHAR[]) AS municipios,
               {financial_aggregates(table_alias='f')}
        FROM fato_vendas f JOIN _ci_compras_cliente c
          ON f.raiz_cnpj = c.raiz_cnpj AND f.data_emissao = c.data_primeira_compra
        WHERE f.compra_valida AND f.identificador_documento IS NOT NULL
        GROUP BY f.raiz_cnpj
    """)
    current_status = status_expression(
        "c.data_primeira_compra", "c.data_ultima_compra", "s.reference_date",
        "len(u.status_origem) = 1 AND list_contains(u.status_origem, 'SEM CLASSIFICAÇÃO')",
    )
    windows = ",\n".join(
        f"""date_diff('day', c.data_primeira_compra, s.reference_date) >= {days}
                    AS maturidade_{days}d,
              CASE WHEN date_diff('day', c.data_primeira_compra, s.reference_date) >= {days}
                   THEN COALESCE(date_diff('day', c.data_primeira_compra,
                                         c.data_segunda_compra) <= {days}, FALSE)
              END AS recompra_{days}d"""
        for days in (30, 60, 90, 180)
    )
    commercial = ",\n".join(
        f"""CASE WHEN NOT (s.acquisition_policy = 'pending'
                                  AND a.quantidade_documentos_primeiro_dia > 1)
                       AND len(a.{array}) = 1 THEN a.{array}[1] END AS {name},
              a.{array} AS {array_name}"""
        for array, name, array_name in (
            ("business_units", "bu_primeira_compra", "business_units_primeira_compra"),
            ("vendedores", "vendedor_primeira_compra", "vendedores_primeira_compra"),
            ("canais", "canal_primeira_compra", "canais_primeira_compra"),
            ("estados", "estado_primeira_compra", "estados_primeira_compra"),
            ("municipios", "municipio_primeira_compra", "municipios_primeira_compra"),
        )
    )
    connection.execute(f"""
        CREATE OR REPLACE TABLE dim_clientes AS
        SELECT u.raiz_cnpj, u.nome_cliente_representativo,
               u.data_primeira_observacao,
               c.data_primeira_compra, c.data_ultima_compra, c.data_segunda_compra,
               date_trunc('month', c.data_primeira_compra)::DATE AS mes_aquisicao,
               year(c.data_primeira_compra)::INTEGER AS ano_aquisicao,
               strftime(c.data_primeira_compra, '%Y-%m') AS safra_aquisicao,
               {commercial},
               {current_status} AS status_atual,
               {current_status} AS cliente_status_atual,
               COALESCE(c.quantidade_compras_validas, 0)::BIGINT AS quantidade_compras_validas,
               date_diff('day', c.data_ultima_compra, s.reference_date) AS dias_desde_ultima_compra,
               date_diff('day', c.data_primeira_compra, c.data_segunda_compra)
                    AS dias_ate_segunda_compra,
               c.intervalo_medio_entre_compras,
               {windows},
               u.status_origem,
               (s.special_status_policy = 'pending'
                    AND list_contains(u.status_origem, 'SEM CLASSIFICAÇÃO'))
                    AS status_especial_pendente,
               (s.acquisition_policy = 'pending'
                    AND COALESCE(a.quantidade_documentos_primeiro_dia > 1, FALSE))
                    AS atribuicao_comercial_pendente,
               COALESCE(a.quantidade_documentos_primeiro_dia, 0)::BIGINT
                    AS quantidade_documentos_primeiro_dia,
               s.reference_date AS data_referencia
        FROM _ci_customer_universe u
        LEFT JOIN _ci_compras_cliente c USING (raiz_cnpj)
        LEFT JOIN _ci_primeiro_dia a USING (raiz_cnpj)
        CROSS JOIN _ci_model_settings s
    """)
