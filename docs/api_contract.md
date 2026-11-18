# Contrato da API analítica — v1.0

A API utiliza exclusivamente o snapshot sintético autorizado da Fase 1. A chave
documental permanece **Filial + Num. Docto. + Cód. Cliente + Empresa**; a raiz CNPJ
é a identidade do cliente. Nenhum endpoint escreve no banco ou aceita caminhos/SQL.

## Comportamento e recompra por produto

Filtro compartilhado `valid_purchases_gt`: inteiro de 0 a 2.147.483.647, opcional,
com comparação estrita `quantidade_compras_validas > N` na dimensão do snapshot.
Propaga-se a aquisição, financeiros, clientes, itens, comportamento, produtos,
retenção/cohorts, ciclo de vida/transições e opções dos filtros. O resumo oficial
individual `/customers/{id}` continua representando o histórico global do cliente.
Os itens expõem `quantidade_devolvida` e `compra_valida` separadamente: devoluções
continuam no histórico financeiro e não são eventos de compra.

`GET /api/v1/finance` retorna os financeiros oficiais por transação, separado
dos indicadores de aquisição de `/overview`, com os mesmos filtros financeiros.
`GET /api/v1/customers/{customer_id}/items` aplica período, BU, vendedor,
estado, cidade, canal, família, produto, status e safra; a paginação preserva
as linhas e os valores originais.

`GET /api/v1/customers/{customer_id}/behavior` retorna distribuição e evolução
mensal por BU, primeiros produtos, líderes, frequência e comparação do mix.
`GET /api/v1/products/repurchase` retorna ranking paginado por clientes únicos.
Recompra por produto exige datas de emissão diferentes; geral e mesma BU
mantêm documentos distintos. `min_observation_days` é opcional e começa em
zero, com elegíveis e recentes excluídos expostos separadamente.
Veja [regras e parâmetros completos](behavior_metrics.md).

## Infraestrutura e limites

Router (`api/main.py`) → Services → Repository/Analytics da Fase 1 → DuckDB.
A estrutura foi compactada para evitar um módulo redundante por endpoint.
`config.py`, `dependencies.py`, `database.py`, `schemas.py` e `serialization.py`
separam configuração, autorização futura, conexão, contratos e JSON.

`CUSTOMER_API_DATABASE_PATH` é obrigatório, sem descoberta ou fallback. O destino
precisa estar sob `data/synthetic/` da raiz de execução, com marcador sintético
válido, metadados sintéticos e gate sem erros bloqueantes. A inicialização verifica
os seis modelos. Cada requisição abre e fecha sua própria conexão `read_only=True`,
sem conexão global; acessos externos do motor são desabilitados. Não execute o
pipeline de escrita simultaneamente à API; indisponibilidade de conexão retorna 503.

Limites externos: página 1–1.000.000, tamanho 1–100, rentabilidade até 1.000 grupos,
acompanhamento M0–M84 e strings até 200 caracteres (pesquisa até 100).
`CUSTOMER_API_MAX_ROWS` (padrão 1.000) também limita páginas e séries; em cohorts
limita a quantidade de safras. A matriz possui teto separado de 10.000 células
(safras × meses, incluindo M0), sem contar células como se fossem linhas de safra.
Consultas amplas demais retornam 422 para solicitar filtros mais restritos.
Paginação, ordenação e limite dos dados de clientes/produtos são feitos no SQL.
Séries/cohorts são materializados somente após agregação SQL, nunca fatos completos.

`CUSTOMER_API_QUERY_TIMEOUT_SECONDS` (padrão 15, máximo 120) interrompe consultas;
`CUSTOMER_API_MEMORY_LIMIT_MB` (padrão 512) limita o motor DuckDB, com duas threads.
O limite de memória do motor não é um limite rígido do processo inteiro. O orçamento
engloba a requisição analítica e usa `interrupt()`; não constitui SLA de latência.
Logs registram rota parametrizada, status, duração e quantidade de resultados,
sem valores de filtros, documentos, nomes, SQL ou caminhos.

Somente clientes loopback são aceitos; bind local e `--no-proxy-headers` são
obrigatórios no comando recomendado. CORS usa lista explícita, vazia por padrão;
sem credenciais e sem wildcard. Isso não substitui autenticação de produção.
`authorize_customer_details` é o ponto de extensão para autorização real, sem
usuário/token fictício. Outros modos de dados são recusados pela configuração.

## Filtros e escopos

Datas inclusivas em ISO 8601: `start_date`, `end_date`. Filtros de dimensão:
`business_unit`, `seller`, `state`, `city`, `sales_channel`, `family`, `product`,
`customer_status`, `acquisition_cohort` (YYYY-MM). Valores usam parâmetros SQL;
dimensões, agrupamentos e ordenação vêm de allowlists internas.

| Endpoint | Semântica do período e da segmentação |
| --- | --- |
| overview | Receita da empresa filtra datas/atributos das transações; métricas dos adquiridos selecionam globalmente raízes pela aquisição e atributos da primeira compra |
| acquisition | Datas de aquisição global e conjuntos da primeira data; nunca recalcula primeira compra após filtrar BU/vendedor |
| customers | Datas/atributos selecionam clientes pela aquisição; financeiros são acumulados até a referência do snapshot |
| retention/cohorts | População fixada pela aquisição; acompanhamento considera todas as compras posteriores da população, sem refiltrar BU da transação |
| profitability | Datas/atributos das transações; safra e status atual são atributos da raiz |
| lifecycle | `reference_date`: fechamento mensal observado ou referência atual; start/end são recusados para evitar equivalência indevida |
| lifecycle/transitions | start/end selecionam meses de transição; status filtra o status histórico de destino |
| filters | Valores disponíveis nas transações do período, com dependência entre dimensões |

Status em financeiro, clientes e população adquirida significa status **atual do
snapshot**. Em lifecycle/transitions é histórico. Segmentos de aquisição não são
aditivos entre BUs quando uma raiz pertence ao conjunto de várias BUs. Nenhuma
receita é explodida/rateada para atribuir crédito arbitrário a vários membros.
Família/produto são suportados em financeiro/profitability/filters; nos endpoints
de população adquirida e ciclo de vida retornam 422, pois sua atribuição comercial
à aquisição não foi definida. A API não inventa esse cruzamento.

## Endpoints

Todos usam GET e prefixo `/api/v1`.

| Caminho | Resposta e parâmetros específicos |
| --- | --- |
| `/health`, `/ready` | Estado da conexão e prontidão dos modelos; sem caminhos |
| `/metadata` | Versão, referência, primeiro/último período até referência, disponibilidade dos modelos, definições e limitações |
| `/overview` | Indicadores com quatro escopos de receita explícitos, clientes adquiridos, recompra 90d e crescimento |
| `/acquisition` | Série mensal com primeira compra contábil/líquida/margem e crescimento |
| `/customers` | `page`, `page_size`, `sort_by`, `sort_order`, `search`; itens e total/total_pages |
| `/customers/{customer_id}` | Raiz de oito dígitos; agregado, histórico mensal e indicadores de recompra; 404 se ausente |
| `/customers/{customer_id}/items` | Itens financeiros paginados; produto, quantidades, BU, nota e atributos da transação |
| `/retention` | Janelas 30/60/90/180, elegíveis, imaturos, recompradores, taxas e média/mediana até segunda compra |
| `/cohorts` | Heatmap organizado por safra; `max_months` é o maior offset, inclusivo |
| `/profitability` | `group_by`, `limit`; medidas oficiais, clientes e documentos distintos |
| `/lifecycle` | Distribuição dos status por `reference_date` |
| `/lifecycle/transitions` | Contagens por mês/status de origem/status de destino, sem expor raízes |
| `/filters` | `dimension`, `search`, `page`, `page_size`; valores distintos e paginação |

Ordenação de clientes: `customer_id`, `name`, `first_purchase`, `last_purchase`,
`status`, `valid_purchases`, `net_revenue`, `accounting_revenue`, `gross_margin`,
`gross_margin_pct`; direção asc/desc. `gross_margin` ordena pela margem em reais;
`gross_margin_pct` ordena pela razão oficial ponderada de margem sobre líquido.
Desempate estável pela raiz, nulos ao final. Pesquisa usa substring literal, não
padrão SQL com wildcards. Agrupamentos de rentabilidade: `business_unit`, `seller`,
`customer`, `product`, `family`, `state`, `sales_channel`, `acquisition_cohort`.
Filtros de valores aceitam esses nomes e também `city`, `customer_status`, `year`,
`month`. Produto é o código; exemplos dependentes: `dimension=city&state=SP` e
`dimension=product&family=FAMILIA%20SINTETICA`.

## Contratos JSON e precisão

No cadastro e no dossiê, `name` mantém o nome representativo compatível com o
contrato anterior. `customer_names` preserva os valores distintos de **Nome Cliente**
e `real_customer_names` os de **Cliente REAL**, sem escolher arbitrariamente um
nome entre filiais. Campos ausentes retornam listas vazias; não são substituídos
um pelo outro. A busca da lista inclui Nome Cliente, Cliente REAL e raiz CNPJ.

Em `/customers/{customer_id}/items`, `page` e `page_size` seguem os limites gerais.
`search` pesquisa literalmente código/descrição de produto e número da nota;
`start_date`, `end_date` e `business_unit` filtram as transações. A resposta tem
`data.items` e `data.pagination`. Campos por linha incluem `nome_cliente`,
`cliente_real`, `codigo_produto`, `descricao_produto`, `quantidade_faturada`,
`quantidade_liquida`, `business_unit`, `familia`, `subfamilia`, `vendedor`,
`canal_venda`, `estado`, `municipio`, `document_number`, `branch`, `company`,
`customer_code`, `item`, `data_emissao`, `compra_valida`, status/origem e as seis
medidas financeiras oficiais. As quantidades preservam a unidade da origem.
Devoluções são mantidas; datas ilegíveis ou futuras ao snapshot ficam fora deste
recorte financeiro. Não se deve contar linhas dessa lista como quantidade de compras.

Componentes legíveis da nota e nomes vêm da staging por `source_row_id`; a
identidade documental continua sendo os quatro campos aprovados, nunca produto
ou item. A agregação de nomes é feita antes dos joins, evitando multiplicar valores.

As respostas analíticas têm `{meta, data}`. `meta` contém versão, referência,
tipo de período, população, segmentação, filtros de datas informados, unidade
monetária e unidade das taxas. Datas omitidas significam todo histórico elegível
até a referência; não significam que aquisição e faturamento usam a mesma data.

Moeda: `source_currency_unvalidated`; não se presume BRL nem se converte moeda.
Valores monetários são tokens JSON **numéricos**, escritos diretamente a partir
de Decimal sem conversão intermediária para float e sem arredondamento de somas.
OpenAPI descreve-os como number. Clientes JavaScript devem considerar uma biblioteca
decimal quando precisarem reproduzir a precisão completa; Number tem precisão
finita. Datas usam ISO; contagens são inteiros; taxas usam unidade percentual.
MB% pode ser negativa/superior a 100 conforme a medida oficial; não é truncada.
NaN/infinito são serializados como null, nunca tokens JSON inválidos.

Impostos = contábil − líquido; MB% = 100 × margem agregada / líquido agregado.
Ausência em qualquer item torna o agregado afetado NULL, seguindo a Fase 1.
Divisor zero retorna NULL. Financeiro preserva devoluções; compra válida não é
filtro financeiro genérico. Ticket usa receita dos itens com documento conhecido
dividida por documentos distintos, sem usar quantidade de itens.

Overview distingue: `company_transaction_revenue` (transações selecionadas),
`acquired_customer_period_revenue` (receita no período dos clientes adquiridos),
`acquired_customer_lifetime_revenue` (acumulado dessa população até a referência)
e `acquisition_month_net_revenue` (receita no respectivo mês de aquisição).
Crescimento do overview compara o período explícito a uma janela imediatamente
anterior com igual quantidade de dias; sem início/fim, base anterior positiva,
cobertura histórica ou período inteiramente observado, retorna NULL. Na série de
aquisição, compara meses calendário completos; meses ausentes são zero, base zero
ou mês aberto/recorte parcial resulta em crescimento NULL.

Recompra usa segundo documento distinto, inclusive no mesmo dia. Clientes sem
janela completa são excluídos do denominador e informados em `immature_customers`.
`mature` na janela só é true se toda a população observada for madura e houver
elegíveis. Média/mediana consideram somente clientes com segunda compra observada,
não imputam tempo para quem não recomprou. Cohort M0 tem retenção NULL, aquisição
separada; mês aberto tem taxa NULL e flag false. Células futuras até `max_months`
são produzidas pela API com medidas NULL, sem confundir futuro com zero.

Exemplo de health (retorno real do banco sintético):

```json
{"status":"healthy","database":"connected","mode":"synthetic","read_only":true}
```

Exemplo de janela no fixture sintético de integração, dentro de `data.windows`:

```json
{"days":90,"eligible_customers":3,"immature_customers":1,"repurchased_customers":1,"rate_pct":33.333333333333336,"mature":false}
```

Exemplo de paginação do mesmo fixture, dentro de `data.pagination`:

```json
{"page":1,"page_size":2,"total_items":5,"total_pages":3}
```

## Erros

Formato: `{"error":{"code":"invalid_request","message":"..."}}`.
422 indica parâmetros inválidos, limite de resultados ou cruzamento pendente;
404, cliente/recurso ausente; 403, cliente remoto; 503, snapshot/conexão/consulta
indisponível; 504, orçamento de consulta excedido; 500, falha inesperada ou de
contrato de saída. Nenhuma resposta inclui SQL interno ou caminho local.
Combinações válidas sem resultados retornam 200: listas vazias, paginação total
zero, contagens zero e taxas indefinidas NULL. CORS/Host inválidos podem ser
recusados pelo middleware antes de atingir o roteamento.
## Filtro global de empresa e contagem de novos clientes — 29/10/2026

`company` filtra pelo texto normalizado da coluna original **Empresa**. Valores
disponíveis: `GET /api/v1/filters?dimension=company`. O parâmetro é literal,
opcional, com até 200 caracteres; ausência inclui todas as empresas.

Nos relatórios financeiros, itens e comportamento, seleciona as transações da
empresa. É compatível com o banco existente: a empresa é obtida da staging por
`source_row_id`, sem migração ou reimportação dos dados. As receitas acumuladas
e da primeira data apresentadas para a empresa incluem apenas seus movimentos.

Na aquisição, a primeira compra permanece **global por raiz CNPJ**, desde o
início do histórico. A empresa selecionada precisa participar da primeira data
válida. Um cliente que comprou em A em setembro e apenas depois em B em outubro
não é readquirido em outubro por B. Se empresas A e B participaram da mesma
primeira data, o cliente aparece nas duas seleções; cada raiz conta uma vez no
total geral. Por isso, contagens de empresas não são necessariamente aditivas.

Os filtros de aquisição selecionam a população acompanhada por retenção e ciclo
de vida. Esses indicadores continuam medindo a história global dos clientes
selecionados; não redefinem a segunda compra ou o status para cada empresa.
Clientes identificados sem compra válida podem pertencer à carteira da empresa
quando observados em seus movimentos no horizonte do snapshot.

O cartão **Novos Clientes** conta raízes distintas cuja **primeira compra válida
ocorreu entre as datas escolhidas, inclusivas**, respeitando a referência do
snapshot. Não é uma contagem dos clientes atualmente classificados como NOVO.
Sem período, representa as aquisições em todo o histórico disponível. O status
atual, quando explicitamente selecionado como filtro, restringe a população,
sem redefinir a data de entrada. O cartão mostra o intervalo observado, inclusive
quando o fim escolhido ultrapassa a data de referência disponível.

Validações: `tests/api/test_company_filters.py`, matriz de filtros em
`tests/test_analytics.py` e `frontend/src/test/company_filters.test.tsx`.

