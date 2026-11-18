WITH {clients_cte}, monthly AS (
    SELECT c.*, m.mes_referencia,
           date_diff('month', c.mes_aquisicao, m.mes_referencia)
               AS meses_desde_aquisicao,
           m.periodo_completo, m.quantidade_notas_mes,
           m.quantidade_compras_acumuladas,
           m.faturamento_contabil_mes AS faturamento_contabil,
           m.faturamento_liquido_mes AS faturamento_liquido,
           m.margem_bruta_valor_mes AS margem_bruta_valor
    FROM selected_clients c
    JOIN fato_clientes_mensal m USING (raiz_cnpj)
    WHERE m.mes_referencia >= c.mes_aquisicao
)
SELECT {dimensions}
       count(*) AS clientes_observados,
       count(*) FILTER (WHERE periodo_completo) AS clientes_elegiveis,
       bool_and(periodo_completo) AS periodo_completo,
       count(*) FILTER (WHERE meses_desde_aquisicao = 0) AS clientes_adquiridos,
       count(*) FILTER (WHERE quantidade_notas_mes > 0) AS clientes_com_compra,
       CASE WHEN min(meses_desde_aquisicao) > 0
            THEN count(*) FILTER (WHERE quantidade_notas_mes > 0) END
           AS clientes_retidos,
       CASE WHEN min(meses_desde_aquisicao) > 0 AND bool_and(periodo_completo)
            THEN 100.0 * count(*) FILTER (WHERE quantidade_notas_mes > 0)
                 / nullif(count(*), 0) END AS taxa_retencao,
       count(*) FILTER (WHERE quantidade_compras_acumuladas >= 2)
           AS clientes_com_recompra_acumulada,
       CASE WHEN bool_and(periodo_completo)
            THEN 100.0 * count(*) FILTER (WHERE quantidade_compras_acumuladas >= 2)
                 / nullif(count(*), 0) END AS taxa_recompra_acumulada,
       {financial_measures}
FROM monthly
{group_clause}
{order_clause}
