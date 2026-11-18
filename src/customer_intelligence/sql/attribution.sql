-- Somente contagens de associação; somas financeiras permanecem no grão da raiz.
WITH {clients_cte}, memberships AS (
    SELECT raiz_cnpj, unnest({array_column}) AS attribute,
           len(list_distinct({array_column})) > 1 AS multiple_attributes
    FROM selected_clients
)
SELECT attribute AS "{dimension}",
       count(DISTINCT raiz_cnpj) AS clientes_novos,
       count(DISTINCT raiz_cnpj) FILTER (WHERE multiple_attributes)
           AS clientes_multiplas_atribuicoes
FROM memberships
WHERE attribute IS NOT NULL
GROUP BY attribute
ORDER BY attribute
