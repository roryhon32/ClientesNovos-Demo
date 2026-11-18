WITH {clients_cte}, documents AS (
    SELECT s.raiz_cnpj, s.identificador_documento, min(s.data_emissao) AS data_compra
    FROM fato_vendas s JOIN selected_clients c USING (raiz_cnpj)
    WHERE s.compra_valida AND s.identificador_documento IS NOT NULL
      AND s.data_emissao IS NOT NULL AND s.data_emissao <= ?
    GROUP BY s.raiz_cnpj, s.identificador_documento
), document_gaps AS (
    SELECT raiz_cnpj,
           date_diff('day', lag(data_compra) OVER (
               PARTITION BY raiz_cnpj ORDER BY data_compra, identificador_documento
           ), data_compra) AS intervalo_dias
    FROM documents
), intervals AS (
    SELECT raiz_cnpj, sum(intervalo_dias) AS soma_intervalos,
           count(intervalo_dias) AS quantidade_intervalos
    FROM document_gaps GROUP BY raiz_cnpj
), reactivated AS (
    SELECT DISTINCT raiz_cnpj FROM fato_transicoes WHERE reativacao
), lifecycle AS (
    SELECT c.*, i.soma_intervalos, i.quantidade_intervalos,
           r.raiz_cnpj IS NOT NULL AS reativado_no_historico
    FROM selected_clients c
    LEFT JOIN intervals i USING (raiz_cnpj)
    LEFT JOIN reactivated r USING (raiz_cnpj)
)
SELECT {dimensions}
       count(*) AS clientes,
       count(*) FILTER (WHERE status_atual = 'NOVO') AS clientes_novos,
       count(*) FILTER (WHERE status_atual = 'RECORRENTE') AS clientes_recorrentes,
       count(*) FILTER (WHERE status_atual = 'EM RISCO') AS clientes_em_risco,
       count(*) FILTER (WHERE status_atual = 'INATIVO') AS clientes_inativos,
       count(*) FILTER (WHERE status_atual = 'SEM FATURAMENTO') AS clientes_sem_faturamento,
       count(*) FILTER (WHERE status_atual = 'SEM CLASSIFICAÇÃO') AS clientes_sem_classificacao,
       count(*) FILTER (WHERE quantidade_compras_validas = 1) AS clientes_sem_recompra,
       count(*) FILTER (WHERE reativado_no_historico) AS clientes_reativados_no_historico,
       sum(soma_intervalos) / nullif(sum(quantidade_intervalos), 0)
           AS intervalo_medio_entre_compras_dias,
       avg(dias_ate_segunda_compra) AS media_dias_ate_segunda_compra,
       median(dias_ate_segunda_compra) AS mediana_dias_ate_segunda_compra,
       {repurchase_measures}
FROM lifecycle
{group_clause}
{order_clause}
