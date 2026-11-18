"""Monthly changes in reconstructed lifecycle status."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import duckdb


def build_transitions(connection: duckdb.DuckDBPyConnection) -> None:
    connection.execute("""
        CREATE OR REPLACE TABLE fato_transicoes AS
        WITH changes AS (
            SELECT raiz_cnpj, mes_referencia,
                   LAG(status_historico) OVER (
                       PARTITION BY raiz_cnpj ORDER BY mes_referencia
                   ) AS status_anterior,
                   status_historico AS status_atual,
                   periodo_completo
            FROM fato_clientes_mensal
        )
        SELECT raiz_cnpj, mes_referencia, status_anterior, status_atual,
               status_anterior || ' -> ' || status_atual AS tipo_transicao,
               status_anterior = 'INATIVO' AND status_atual = 'RECORRENTE' AS reativacao,
               status_anterior = 'EM RISCO' AND status_atual = 'RECORRENTE' AS retomada_em_risco,
               periodo_completo
        FROM changes
        WHERE status_anterior IS NOT NULL AND status_anterior <> status_atual
    """)
