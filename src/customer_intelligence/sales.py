import duckdb

from customer_intelligence.config.settings import Settings


def build_sales(connection: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    """Materializa uma linha por origem; chaves incompletas permanecem NULL."""
    allowed = {row[0] for row in connection.execute("DESCRIBE stg_transacoes").fetchall()}
    keys = getattr(settings, "effective_document_key_columns", settings.document_key_columns)
    if not set(keys) <= allowed:
        raise ValueError("Chave documental contém coluna fora do schema interno")
    expressions = [f'"{c}"' for c in keys]
    complete = " AND ".join(f'{c} IS NOT NULL' for c in expressions)
    packed = ", ".join(f'k{i} := {c}' for i, c in enumerate(expressions))
    has_produtos = "produtos" in allowed

    if "tipo_movimento" in allowed:
        # Modo sintético (testes unitários e fixtures controladas)
        produtos_select = "produtos," if has_produtos else "NULL::VARCHAR AS produtos,"
        query = f"""
            CREATE OR REPLACE TABLE fato_vendas AS
            SELECT
                source_row_id,
                filial,
                num_docto,
                cod_cliente,
                empresa,
                origem,
                tipo_movimento,
                CASE WHEN {complete} THEN md5(struct_pack({packed})) END AS identificador_documento,
                data_emissao,
                data_cancelamento,
                mes_ano,
                raiz_cnpj,
                codigo_produto,
                descricao_produto,
                {produtos_select}
                business_unit,
                vendedor,
                estado,
                municipio,
                canal_venda,
                familia,
                quantidade,
                quantidade_devolvida,
                valor_contabil,
                faturamento_liquido,
                margem_bruta_valor,
                impostos,
                custo_total,
                lucro_bruto,
                tipo_desconto,
                criterio_compra_valida AS compra_valida,
                status_documento_valido,
                identificador_inconsistente,
                linha_repetida,
                item_repetido,
                origem_valida,
                movimento_valido,
                tipo_venda_valido,
                cliente_conflitante
            FROM stg_transacoes
        """
        connection.execute(query)
    else:
        # Modo alternativo (base tratada)
        if has_produtos:
            produtos_select = """
                CASE 
                    WHEN produtos ILIKE '%BUSCA PRE%' THEN 'BUSCA PREÇO'
                    WHEN produtos ILIKE '%SERVI%' THEN 'SERVIÇOS'
                    WHEN produtos ILIKE '%PARTES E PE%' THEN 'PARTES E PEÇAS'
                    WHEN produtos IS NOT NULL AND trim(produtos) != '' THEN trim(produtos)
                    ELSE coalesce(nullif(trim(desc_produto), ''), cod_prod, 'OUTROS PRODUTOS')
                END AS produtos,
            """
        else:
            produtos_select = "coalesce(nullif(trim(desc_produto), ''), cod_prod, 'OUTROS PRODUTOS') AS produtos,"

        connection.execute(f"""
            CREATE OR REPLACE TABLE fato_vendas AS
            WITH base AS (
                SELECT *, CASE WHEN {complete}
                    THEN sha256(to_json(struct_pack({packed}))) END AS document_key
                FROM stg_transacoes
            ), keyed AS (
                SELECT *, CASE WHEN document_key IS NOT NULL AND item IS NOT NULL
                    THEN sha256(to_json(struct_pack(doc := document_key, item := item))) END AS item_key
                FROM base
            )
            SELECT sha256(source_fingerprint || ':' || source_row_id::VARCHAR) AS identificador_item,
                source_row_id, source_fingerprint, item_key AS chave_item_candidata,
                document_key AS identificador_documento,
                raiz_cnpj, data_emissao, date_trunc('month',data_emissao)::DATE AS mes_referencia,
                business_unit, cod_prod AS codigo_produto, desc_produto AS descricao_produto,
                {produtos_select}
                familia_ajustada AS familia, subfamilia, nome_vendedor AS vendedor,
                estado, municipio, canal_de_venda AS canal_venda, nome_cliente,
                cliente_novo AS cliente_status_origem,
                valor_contabil_decimal AS faturamento_contabil,
                fat_liquido_decimal AS faturamento_liquido,
                valor_contabil_decimal - fat_liquido_decimal AS impostos,
                100.0 * (valor_contabil_decimal - fat_liquido_decimal) / NULLIF(valor_contabil_decimal,0)
                    AS percentual_impostos,
                margem_bruta_valor_decimal AS margem_bruta_valor,
                100.0 * margem_bruta_valor_decimal / NULLIF(fat_liquido_decimal,0)
                    AS margem_bruta_percentual,
                fat_quant_decimal AS quantidade_faturada, dev_quant_decimal AS quantidade_devolvida,
                liq_quant_decimal AS quantidade_liquida,
                criterio_compra_valida AS criterios_comerciais_validos,
                criterio_compra_valida AND raiz_cnpj IS NOT NULL AND document_key IS NOT NULL
                    AND data_emissao >= ? AS compra_valida,
                status AS status_origem, origem AS origem_transacao
            FROM keyed
        """, [settings.history_start])
