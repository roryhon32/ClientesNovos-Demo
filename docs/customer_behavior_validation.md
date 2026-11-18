# Comportamento de compra e filtros compartilhados

Atualização local em 23/10/2026 sobre FastAPI, DuckDB e React existentes.
A identidade visual e a chave documental oficial foram preservadas. Nenhuma
linha de faturamento corporativo foi acessada e nenhum Excel foi alterado.

## Funcionalidades

- Dossiê: BU predominante com empates, faturamento e participação por BU,
  evolução mensal, primeiros produtos/BUs na primeira data global, líderes em
  quantidade/valor, frequência, intervalos e evolução do mix.
- Geral e mesma BU: documentos válidos distintos. Mesmo produto: **datas de
  emissão diferentes**, conforme decisão do usuário. Duas notas do mesmo dia
  não geram recompra do produto.
- Produtos: ranking por clientes únicos, busca, ordenação, paginação,
  elegíveis/excluídos e observação mínima configurável, inicialmente zero.
- Cliente REAL principal e Nome Cliente abaixo; raiz CNPJ continua sendo a
  chave. Ausência de um campo não é preenchida silenciosamente pelo outro.
- Sidebar de 224 px, barras horizontais locais superior/inferior sincronizadas
  e roscas com legendas responsivas, valores e percentuais.

As definições estão em [behavior_metrics.md](behavior_metrics.md).

## Filtros e escopos

O provider mantém estado global e URL. Navegar preserva período, BU, vendedor,
localidade, canal, status e safra. Intervalos personalizados mudam atomicamente;
o seletor rejeita datas invertidas. Seleções combinadas não se sobrescrevem.
Barras mensais, roscas, dimensões, safras e transições compartilham os filtros.
Controles por teclado utilizam os mesmos callbacks. Repetir a seleção remove o
filtro. Chips permitem remover um filtro ou limpar todos, inclusive sem resultados.

Produto/família são exploração local de Produtos/Rentabilidade: a sidebar não os
leva às páginas cuja população de aquisição não suporta esses cruzamentos.
Busca, ordenação, paginação e maturidade são locais. Na rentabilidade por cliente,
a seleção local restringe KPIs, gráfico e tabela ao cliente entre as dimensões
retornadas.

Período mantém o significado de cada análise: entrada em aquisição, emissões em
financeiros/comportamento, mês da mudança em transições. Cadastro e resumo oficial
do dossiê conservam financeiros acumulados até o snapshot, com escopo identificado.
Aquisição e primeiros produtos nunca são redefinidos por uma seleção exploratória.

Ciclo de vida utiliza as dimensões globais e o último fechamento no fim do
período, limitado ao snapshot; fim no meio do mês usa fechamento anterior.
O intervalo inteiro filtra transições. A referência é exibida.
SEM CLASSIFICAÇÃO não recebe uma causa inferida.

A distribuição transacional por BU informa presenças: um cliente pode estar em
várias BUs. A soma não representa clientes únicos da empresa nem partição da aquisição.

## Arquivos envolvidos

Backend:

- Novos `src/customer_intelligence/api/behavior.py` e `behavior_schemas.py`.
- `src/customer_intelligence/api/main.py`: rotas e itens com filtros completos.
- `src/customer_intelligence/api/repository.py`: filtros parametrizados dos itens.
- Novo `tests/api/test_behavior.py`.

Frontend:

- Novo `frontend/src/api/behavior.ts`; atualizados `queries.ts` e `types.ts`.
- `frontend/src/context/FilterContext.tsx` e `frontend/src/App.tsx`.
- Novo `frontend/src/pages/ProductsPage.tsx`; atualizadas Overview, Acquisition,
  Customers, Retention, Profitability e Lifecycle.
- Layout: Header, Sidebar, AppShell e `frontend/src/index.css`.
- Novos `common/HorizontalScroll.tsx`, `common/ChartFilterOptions.tsx` e
  `customers/CustomerBehaviorPanel.tsx` em `frontend/src/components`.
- Atualizados CustomerTable, CustomerDetailDrawer, CustomerItemsPanel,
  AcquisitionBarChart, DistributionDonutChart, ProfitabilityBarChart,
  CohortHeatmapChart e LifecycleTransitionsChart.
- Novos testes behavior_queries, customer_behavior, products_page,
  layout_interactions, shared_filters, chart_crossfilters e lifecycle_filters.
  Expectativas de nomes atualizadas em components, customer_exploration e navigation_filters.

Documentação: este relatório, `behavior_metrics.md`, `api_contract.md`,
`document_key_validation.md` e READMEs da raiz e frontend.
`frontend/dist` é regenerado pelo build.

## Verificação

Resultado final: **219 testes Python aprovados** em 150,58 s e **88 testes
frontend aprovados** em 13 arquivos. TypeScript e build Vite aprovados.
O backend emitiu somente o aviso de depreciação Starlette/HTTPX já existente;
o build informa o tamanho elevado do bundle, sem falha de compilação.

Após reiniciar somente os servidores deste projeto, **14 verificações HTTP**
passaram pelo proxy local, incluindo Produtos, comportamento, itens, finanças,
retenção, cohorts e filtros combinados. Os quatro financeiros do comportamento
foram conciliados com os itens do cliente sintético consultado.

O snapshot sintético em leitura contém 331.705 itens financeiros e 289.422
documentos distintos. A auditoria encontrou **zero conflitos documentais** e
zero chaves com datas ou raízes incompatíveis. A composição continua exatamente
Filial + Num. Docto. + Cód. Cliente + Empresa.
Evidências locais: `data/synthetic/behavior_http_validation.json` e
`data/synthetic/document_consistency_behavior.json`.

Somente fixtures sintéticas: chave de quatro campos, vários itens por nota,
mesmo dia/dias diferentes, clientes únicos, filtros combinados, sem dados,
empates, NULL, negativos, devoluções, cancelamentos, maturidade, mix,
limites/paginação, HTTP, persistência, teclado, rolagem e seleção de gráficos.
A matriz de cohorts inclui renderização SVG real pelo ECharts.
Não houve inspeção visual em navegador nesta execução; testes de DOM e build
não substituem revisão visual em tamanhos de tela diferentes.

```powershell
python -m pytest -o addopts="" -q -p no:cacheprovider
cd frontend
node node_modules/vitest/vitest.mjs run --configLoader native --pool threads --maxWorkers 1
npm run build -- --configLoader native
```

Painel local: `http://127.0.0.1:5173`. API sintética somente leitura:
`http://127.0.0.1:8010`. Iniciar o proxy com
`VITE_BACKEND_TARGET=http://127.0.0.1:8010`.
