# Retenção, margens e exploração de clientes — validação

Atualização local em 23/10/2026. Foram mantidas a raiz CNPJ, a chave documental
oficial de quatro campos e todas as fórmulas financeiras. Nenhum registro do Excel
corporativo foi importado ou utilizado nos testes.

## Correções e melhorias

### Retenção

O serviço tratava células de acompanhamento como linhas de resultado: 82 safras
com M0–M12 produzem 1.066 células e ultrapassavam o antigo limite de 1.000. Agora
`max_rows` limita safras e a matriz tem teto independente de 10.000 células, sem
alocar uma lista auxiliar para contar células. A regressão cobre 82 safras até
M+12, M+24 e M+84; os limites exatos continuam testados.

O gráfico usa séries distintas para taxas e estados sem taxa. Cada série heatmap
recebe seu visualMap próprio, conforme exigido pelo motor ECharts, incluindo um
mapa categórico oculto para aquisição, aberto e futuro. M0 não é retenção; NULL
não é zero. Existe teste de renderização real de SVG pelo ECharts, além dos mocks
de componentes. A interface distingue base, aberto, futuro e taxa indisponível,
oferece tabela acessível e mantém filtros/horizonte disponíveis quando há erro.
Falhas de cohorts e de indicadores de recompra não ocultam a seção saudável.
Elegíveis e imaturos são apresentados separadamente em cada janela de recompra.

### Margem bruta

A coluna exibida como MB% enviava `sort_by=gross_margin`, que ordenava os valores
em reais. Foram separados os cabeçalhos MB (R$) e MB%, com `gross_margin` e
`gross_margin_pct` respectivamente. O percentual continua sendo a razão ponderada
oficial, não a média de percentuais nem uma classificação por faixas inventadas.
Nulos ficam ao final e a raiz desempata ordenações. Há teste com valores que
distinguem ordenação monetária e percentual.

### Clientes, produtos e nomes

`GET /api/v1/customers/{customer_id}/items` retorna itens paginados no SQL, com
busca literal por produto/nota e filtros por emissão/BU. São exibidos produto,
código, família/subfamília, quantidades faturada e líquida, BU, vendedor, nota,
filial, item, empresa, cliente de origem, canal, localidade, status/origem e
financeiros oficiais. Devoluções são preservadas; datas inválidas/futuras ficam
fora do recorte financeiro da API. As linhas não são contadas como compras.

`Cliente REAL` e `Nome Cliente` são campos distintos. Cadastro/dossiê expõem os
conjuntos ordenados `real_customer_names` e `customer_names`, sem escolher um nome
arbitrário entre filiais. O rótulo anterior `name` permanece compatível. A pesquisa
da lista considera ambos os nomes e raiz; nomes exclusivos de registros futuros
ou anteriores ao histórico não entram. Nos itens, `cliente_real` e `nome_cliente`
preservam o valor de cada linha. Ausência de informação continua vazia/NULL, com
"Não informado" na interface, sem substituir um campo pelo outro.

O dossiê tem abas de resumo/histórico e produtos/notas, com pesquisa, paginação,
validação local de datas e recuperação de erro. Também bloqueia a rolagem do
fundo, controla foco, fecha por Escape e restaura o foco anterior. A busca de
clientes cancela timers antigos e reinicia a paginação ao mudar filtros/ordenação.
A chave do cache de rentabilidade agora inclui o limite solicitado.

## Testes finais

- Backend: `python -m pytest -p no:cacheprovider` — **204 aprovados em 113,38 s**,
  preservando os testes anteriores. Um aviso já existente de depreciação do
  cliente Starlette/HTTPX, sem falhas.
- Frontend: `node node_modules/vitest/vitest.mjs run --configLoader native --pool threads`
  — **48 aprovados em 29,14 s**, seis arquivos de testes.
- Build: `npm run build -- --configLoader native` — TypeScript e Vite aprovados;
  aviso de bundle grande já existente (aproximadamente 1,62 MB antes de gzip).
- Casos cobertos: 82 safras, maturidade, M0/NULL/zero, teto de células, documentos
  distintos, ordenação financeira/percentual, nomes de matriz/filiais, busca,
  paginação e isolamento por cliente, reconciliação sem multiplicação, precisão
  decimal e erro 422 para período invertido/injeção.
- A falha de seletor antigo no teste de cabeçalho foi corrigida para selecionar
  explicitamente o papel `columnheader`; a nova legenda Cliente REAL tornou a
  antiga busca textual genérica ambígua.

O sandbox Windows impediu a criação de workers por fork no comando padrão do
Vitest. O modo threads com carregamento nativo funciona; a suíte também foi
verificada com workers fora do sandbox por revisão automática. Não houve mudança
de dependências. Não há ferramenta de navegador disponível nesta sessão; a
validação visual não foi manual. A tentativa de verificação HTTP conjunta do
Vite/API temporários encontrou timeout no preview; os processos foram encerrados.
Isso não é apresentado como teste de navegador aprovado. As rotas foram validadas
com TestClient, a matriz com o motor SVG real e o frontend pelo build.

## Cabeçalho do Excel autorizado

Foi lida exclusivamente a primeira linha da primeira aba, em modo de leitura,
conforme autorização específica do responsável. Resultado: **129 células de
cabeçalho, 129 nomes reconhecidos no contrato e os quatro campos da chave presentes**.
Linhas transacionais lidas: **zero**. O arquivo original não foi alterado.
A conferência do cabeçalho não habilita importação da base nem muda a API para
modo real; a fonte de testes e do ambiente preparado continua sintética.

## Arquivos

- API: `services.py`, `repository.py`, `schemas.py`, `main.py` em
  `src/customer_intelligence/api/`.
- Backend: `tests/api/test_retention_regression.py`, `tests/api/test_customer_items.py`.
- Frontend: `api/types.ts`, `api/queries.ts`, `pages/CustomersPage.tsx`,
  `pages/RetentionPage.tsx`, `components/charts/CohortHeatmapChart.tsx`,
  `components/customers/CustomerTable.tsx`, `CustomerDetailDrawer.tsx` e novo
  `CustomerItemsPanel.tsx`.
- Frontend testes: `customer_exploration.test.tsx`, `retention_page.test.tsx` e
  ajuste de seletor em `components.test.tsx`.
- Documentação: `README.md`, `docs/api_contract.md` e este relatório.
- A saída compilada em `frontend/dist/` foi atualizada pelo build.

Reinicie a API e atualize a página para utilizar o endpoint de itens, os nomes e
a ordenação novos. Nenhum serviço temporário de validação ficou em execução.
