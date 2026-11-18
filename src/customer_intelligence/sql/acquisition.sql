WITH {clients_cte},
client_financial AS (
    SELECT s.raiz_cnpj,
           {client_financial_measures},
           {acquisition_month_accounting} AS faturamento_contabil_mes_aquisicao,
           {acquisition_month_net} AS faturamento_liquido_mes_aquisicao,
           {acquisition_month_margin} AS margem_bruta_mes_aquisicao
    FROM fato_vendas s
    JOIN selected_clients c USING (raiz_cnpj)
    WHERE s.data_emissao IS NOT NULL AND s.data_emissao <= ?
      {company_filter}
    GROUP BY s.raiz_cnpj
), client_metrics AS (
    SELECT c.*, f.* EXCLUDE (raiz_cnpj)
    FROM selected_clients c
    LEFT JOIN client_financial f USING (raiz_cnpj)
)
SELECT {dimensions}
       count(*) AS clientes_novos,
       {financial_measures},
       {net_total} / nullif(count(*), 0) AS receita_media_cliente_adquirido,
       {margin_total} / nullif(count(*), 0) AS margem_media_cliente_adquirido,
       {acquisition_month_totals},
       {first_purchase_totals},
       count(*) FILTER (WHERE atribuicao_comercial_pendente)
           AS clientes_atribuicao_pendente,
       {repurchase_measures},
       count(*) FILTER (WHERE quantidade_compras_validas = 1) AS clientes_sem_recompra,
       avg(dias_ate_segunda_compra) AS media_dias_ate_segunda_compra,
       median(dias_ate_segunda_compra) AS mediana_dias_ate_segunda_compra
       {pending_retention}
FROM client_metrics
{group_clause}
{order_clause}
