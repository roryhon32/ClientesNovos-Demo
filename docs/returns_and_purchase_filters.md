# Devoluções e filtro de compras válidas

Correção em 23/10/2026. O usuário confirmou que a devolução é identificada por
`DEV - Quant. > 0`. O predicado anterior não consultava esse campo: uma linha
com Status FATURADO, FAT positivo e contábil positivo podia atualizar recência
e recompra mesmo sendo devolução.

## Comportamento corrigido

- Normalização decimal de DEV sem arredondamento ou substituição por zero.
- DEV positivo exclui o item dos eventos de compra em um único predicado central.
- Primeira/segunda/última compra, quantidade de compras, recência, aquisição,
  recompra geral/BU/produto, cohorts, retenção e reativação utilizam a flag corrigida.
- Todas as linhas, documentos, faturamento, impostos e margem permanecem no fato.
- DEV ausente mantém o contrato opcional anterior. Valor preenchido ilegível ou
  com precisão inválida não autoriza compra e gera `invalid_return_quantity`.
- Itens exibem quantidade devolvida e Compra válida: Sim/Não visivelmente.

RECORRENTE é o status do cliente calculado pela última compra válida, sem exigir
duas compras. Portanto, uma devolução pode aparecer no histórico financeiro de
um cliente que continua RECORRENTE por uma compra verdadeira anterior; ela
própria não se torna compra nem renova sua recência.

## Filtro global

`valid_purchases_gt` significa mais de N documentos válidos no snapshot:
`>1` seleciona pelo menos 2, `>5` pelo menos 6. A interface oferece >1, >5,
>10, >20 e limite personalizado inteiro não negativo. O filtro compõe-se com
período/BU/demais filtros e persiste na navegação; o chip permite removê-lo.
A contagem não é recalculada apenas sobre as linhas do período.

## Materialização e procedência

A correção do código não altera automaticamente um banco já materializado.
É preciso reconstruir os fatos e dimensões para recalcular classificações,
recompras e indicadores. Nenhum Excel original precisa ser modificado.
Os testes desta correção geram suas próprias linhas e bancos em memória.
Não executar o importador real nem sobrescrever o banco existente para validar.

## Arquivos

- `transformations/normalization.py`, `transformations/valid_sales.py`, `sales.py`:
  normalização DEV e predicado de compra.
- `validation/quality_checks.py`: advertência de DEV ilegível.
- `api/schemas.py`, `api/dependencies.py`, `api/repository.py`, `api/behavior.py`,
  `metrics/indicators.py`: quantidade devolvida e filtro de clientes no backend.
- Frontend: `api/types.ts`, `context/FilterContext.tsx`, Header, GlobalFilters,
  Sidebar e CustomerItemsPanel.
- Testes: `tests/test_returns.py`, `tests/api/test_purchase_count_filters.py`,
  `frontend/src/test/purchase_count_filters.test.tsx`.
- Regras e contrato atualizados em `business_rules.md` e `api_contract.md`.

Os caminhos Python acima são relativos a `src/customer_intelligence/`;
os componentes são relativos a `frontend/src/components/`.
