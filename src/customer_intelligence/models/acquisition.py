"""One acquisition per root, with explicit simultaneous-purchase attribution."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import duckdb


def build_acquisition(connection: duckdb.DuckDBPyConnection) -> None:
    approved = "(s.acquisition_policy = 'first_day_bundle' OR a.quantidade_documentos_primeiro_dia = 1)"
    connection.execute(f"""
        CREATE OR REPLACE TABLE fato_aquisicao AS
        SELECT d.raiz_cnpj, d.data_primeira_compra AS data_aquisicao,
               d.mes_aquisicao, d.ano_aquisicao, d.safra_aquisicao,
               d.bu_primeira_compra AS bu_aquisicao,
               d.vendedor_primeira_compra AS vendedor_aquisicao,
               d.canal_primeira_compra AS canal_aquisicao,
               d.estado_primeira_compra AS estado_aquisicao,
               d.municipio_primeira_compra AS municipio_aquisicao,
               d.business_units_primeira_compra AS business_units_aquisicao,
               d.vendedores_primeira_compra AS vendedores_aquisicao,
               d.canais_primeira_compra AS canais_aquisicao,
               d.estados_primeira_compra AS estados_aquisicao,
               d.municipios_primeira_compra AS municipios_aquisicao,
               CASE WHEN {approved} THEN a.faturamento_contabil END AS valor_primeira_compra,
               CASE WHEN {approved} THEN a.faturamento_liquido END
                    AS faturamento_liquido_primeira_compra,
               CASE WHEN {approved} THEN a.impostos END AS impostos_primeira_compra,
               CASE WHEN {approved} THEN a.margem_bruta_valor END AS margem_primeira_compra,
               CASE WHEN {approved} THEN a.margem_bruta_percentual END
                    AS margem_bruta_percentual_primeira_compra,
               CASE WHEN {approved} THEN a.percentual_impostos END
                    AS percentual_impostos_primeira_compra,
               a.quantidade_documentos_primeiro_dia,
               d.atribuicao_comercial_pendente,
               len(a.business_units) > 1 AS aquisicao_multiplas_bus,
               len(a.vendedores) > 1 AS aquisicao_multiplos_vendedores,
               s.acquisition_policy AS politica_aquisicao
        FROM dim_clientes d JOIN _ci_primeiro_dia a USING (raiz_cnpj)
        CROSS JOIN _ci_model_settings s
        WHERE d.data_primeira_compra IS NOT NULL
    """)
