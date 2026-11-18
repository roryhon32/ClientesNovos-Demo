# Comportamento de clientes e recompra de produtos

Os endpoints `GET /api/v1/customers/{raiz}/behavior` e
`GET /api/v1/products/repurchase` consultam o DuckDB existente em leitura.
Nenhuma tabela do modelo dimensional é alterada. Testes usam apenas dados
sintéticos; não há leitura de Excel corporativo.

## Grãos e regras

- Cliente: `RAIZ CNPJ`, inclusive clientes com mais de um código ou filial.
- Documento: chave existente composta exclusivamente por Filial, Num. Docto.,
  Cód. Cliente e Empresa. Múltiplos itens continuam no fato financeiro, mas
  não multiplicam documentos.
- Recompra geral e na mesma BU: pelo menos dois documentos válidos distintos,
  inclusive documentos distintos emitidos no mesmo dia, preservando Fase 1.
- **Recompra do mesmo produto: pelo menos duas datas de emissão distintas**,
  conforme decisão explícita do usuário. Duas notas do mesmo produto na
  mesma data são uma ocasião. `products.documents` informa notas e
  `products.occasions` informa datas. `summary.occasions` e
  `business_units.occasions` continuam documentos; `occasion_mode=dates`
  identifica especificamente o critério de produto.
- Frequência por produto: datas distintas de compras válidas. Intervalo médio
  entre ocasiões = (última data − primeira data)/(ocasiões − 1). É NULL sem
  duas datas. O intervalo geral usa documentos distintos, podendo incluir zero
  entre documentos do mesmo dia.
- Compra válida: utiliza o indicador oficial `compra_valida` e exige chave
  documental não nula. Devoluções e cancelamentos não geram ocasiões.
- Datas posteriores à referência não entram. A flag oficial `compra_valida`
  exclui datas anteriores ao início histórico das contagens de compra; seus
  movimentos financeiros continuam preservados, como em `/finance` e `/items`.

## Escopo financeiro e filtros

Os filtros período, BU, vendedor, estado, cidade, canal, família e produto
incidem na transação. Status e safra são filtros da dimensão global existente;
não recalculam aquisição. Consultas são parametrizadas; identificadores de
ordenação têm lista explícita permitida.

Resumo, BUs, meses e produtos usam faturamento contábil, líquido, impostos e
margem oficiais em **todos os movimentos selecionados**, incluindo negativos.
Somas incompletas permanecem NULL. Percentuais são calculados após agregação.
Participação por BU = líquido da BU/líquido total × 100, NULL quando o total é
zero ou desconhecido; percentuais podem ser negativos ou superar 100 em
presença de devoluções. BU predominante é o maior líquido, preservando todos
os empates; não há vencedor com medidas incompletas.

Quantidade por produto soma `quantidade_liquida` apenas de compras válidas.
Não se soma quantidade entre produtos diferentes. O maior produto por
quantidade e por líquido é retornado como conjunto para preservar empates.
Nenhum vencedor é declarado se uma medida concorrente estiver desconhecida.
Produtos sem código não participam dos rankings de identificação.

Primeiros produtos são todos os produtos de todas as notas válidas da
primeira data de compra global do cliente, incluindo suas BUs. Filtros de
exploração não redefinem esse evento; o contrato explicita a diferença.

## Evolução do mix

Com datas explícitas, compara o período selecionado ao intervalo imediatamente
anterior com **igual número de dias inclusivos**. Se faltar um limite, usa o
início histórico ou a referência. Sem datas, usa o último mês fechado da
referência e compara com igual número de dias imediatamente anteriores.
Os quatro limites e a base aparecem na resposta. Não se presume mês civil
anterior quando a duração difere. `previous_period_complete` informa se o
intervalo anterior está inteiramente no horizonte histórico observado.

- `new_in_period`: primeira observação do produto no histórico sob os mesmos
  filtros ocorre no período atual.
- `resumed_products`: presente no período atual, ausente no anterior, já
  observado antes do atual.
- `not_observed_in_period`: comprado no anterior e ausente no atual; **não é
  classificação definitiva de abandono**.
- `retained_products`: presente em ambos.
- Concentração: participação do maior produto no líquido de compras válidas
  do período. NULL sem produtos, sem denominador positivo, com algum líquido
  desconhecido ou negativo. Devoluções continuam nos financeiros gerais.

## Ranking de fidelização e maturidade

Numerador: clientes únicos que compraram o mesmo produto em pelo menos duas
datas distintas dentro do recorte. Denominador: clientes únicos que compraram
o produto no mesmo recorte. Taxa = numerador/denominador × 100.

`min_observation_days` é opcional, padrão **0**: não há corte arbitrário de
maturidade. Quando informado, exclui do numerador e denominador os pares
cliente/produto com menos dias entre a primeira compra observada no recorte e
`observation_end=min(end_date, reference_date)`. A resposta informa clientes
totais, elegíveis, recentes excluídos e mínimo/máximo de dias observados,
permitindo ao usuário avaliar a oportunidade de recompra. Não estima
probabilidade futura e não classifica clientes recentes como abandono.

Paginação: `page>=1`, `1<=page_size<=200`, limitada também à configuração
`max_rows`. Busca literal por código/descrição, ordenação por `product_id`,
`repurchase_rate_pct`, `customers` ou `repurchased_customers`. Resultados
aninhados de clientes respeitam o limite de linhas e pedem filtros se excedido.
