WITH filtered_sales AS (
    SELECT s.*, d.safra_aquisicao, d.status_atual,
           d.mes_aquisicao AS mes_aquisicao_cliente
    FROM fato_vendas s
    LEFT JOIN dim_clientes d USING (raiz_cnpj)
    WHERE s.data_emissao IS NOT NULL AND s.data_emissao <= ?
      {filters}
)
SELECT {dimensions}
       {financial_measures},
       count(*) AS quantidade_itens,
       count(DISTINCT raiz_cnpj) AS clientes_identificados,
       count(DISTINCT identificador_documento) AS documentos_distintos,
       count(*) FILTER (WHERE identificador_documento IS NULL)
           AS itens_documento_incompleto,
       count(*) FILTER (WHERE raiz_cnpj IS NULL) AS itens_sem_cliente_identificado,
       count(*) FILTER (WHERE faturamento_contabil IS NULL)
           AS itens_sem_faturamento_contabil,
       count(*) FILTER (WHERE faturamento_liquido IS NULL)
           AS itens_sem_faturamento_liquido,
       count(*) FILTER (WHERE margem_bruta_valor IS NULL)
           AS itens_sem_margem_bruta,
       {document_accounting} / nullif(count(DISTINCT identificador_documento), 0)
           AS ticket_medio_contabil,
       {document_net} / nullif(count(DISTINCT identificador_documento), 0)
           AS ticket_medio_liquido,
       {customer_net} / nullif(count(DISTINCT raiz_cnpj), 0)
           AS receita_media_cliente,
       {new_customer_net} AS faturamento_liquido_mes_aquisicao,
       100.0 * {new_customer_net} / nullif({net_total}, 0)
           AS participacao_novos_percentual
FROM filtered_sales
{group_clause}
{order_clause}
