# Consultas analíticas

`customer_intelligence.metrics.Analytics` recebe uma conexão DuckDB já processada.
Os métodos retornam `polars.DataFrame`; somente o resultado agregado é materializado
em Python. Não existe servidor HTTP, integração externa ou componente de interface.

```python
from customer_intelligence.metrics import Analytics, Filters

analytics = Analytics(result.connection)
receita = analytics.financial_summary(
    Filters(year=2026, business_unit="BU SINTETICA A"),
    group_by=("mes_referencia", "vendedor"),
)
qualidade = analytics.acquisition_quality(
    group_by=("business_unit", "vendedor", "safra_aquisicao"),
)
clientes_por_bu = analytics.acquisition_attribution("business_unit")
cohorts = analytics.retention()
crescimento = analytics.acquisition_growth(frequency="month")
```

## Interface

| Método | Agrupamento padrão | Resultado principal |
| --- | --- | --- |
| `financial_summary(filters=None, group_by=())` | Total | Financeiro oficial, documentos, ticket, receita média e participação dos novos |
| `acquisition(filters=None, group_by=("mes_aquisicao",))` | Mês de aquisição | Clientes novos, receita acumulada, receita no mês de aquisição, primeiro dia e recompra |
| `acquisition_growth(filters=None, group_by=(), frequency="month")` | Calendário mensal | Novos clientes e variação mensal/anual; `frequency="year"` fornece variação anual |
| `retention(filters=None, group_by=("safra_aquisicao", "meses_desde_aquisicao"))` | Safra e M0/M1/... | Retenção mensal, recompra acumulada, maturidade e financeiro do período |
| `acquisition_quality(filters=None, group_by=("business_unit", "vendedor", "safra_aquisicao"))` | Conjuntos de BU/vendedor e safra | Receita e margem médias por adquirido, recompra e tempo até a segunda compra |
| `acquisition_attribution(dimension="business_unit", filters=None)` | Membro individual da dimensão escolhida | Clientes distintos associados e clientes com múltiplas atribuições; contagens não aditivas |
| `lifecycle_summary(filters=None, group_by=("status_cliente",))` | Status atual | Risco, inatividade, ausência de recompra, reativação observada e intervalos entre compras |

`Analytics.catalog()` lista consultas disponíveis. `Analytics.query(name, filters,
group_by)` despacha exclusivamente para esse catálogo. Para atribuição, use
`Analytics.query("acquisition_attribution", filters, dimension="vendedor")`;
`group_by` é rejeitado nessa consulta. Nenhum método aceita texto
SQL externo. Valores são parâmetros DuckDB e nomes de agrupamento pertencem a
allowlists específicas. Campos desconhecidos em `Filters`, períodos invertidos,
mês fora de 1–12, agrupamentos desconhecidos ou repetidos são rejeitados.

`Filters` aceita `year`, `month`, `start_date`, `end_date`, `business_unit`,
`raiz_cnpj`, `cliente`, `vendedor`, `estado`, `municipio`, `canal_venda`, `familia`,
`codigo_produto`, `safra_aquisicao` e `status_cliente`. Datas são inclusivas.
Strings usam igualdade exata; `cliente` representa nome, e `raiz_cnpj`, identidade.

O financeiro permite agrupar por `year`, `month`, `mes_referencia`, `business_unit`,
`raiz_cnpj`, `cliente`, `vendedor`, `estado`, `municipio`, `canal_venda`, `familia`,
`codigo_produto`, `safra_aquisicao` e `status_cliente`. `month` sozinho combina o
mesmo número de mês de anos diferentes; use `mes_referencia` para série temporal.
As consultas por cliente substituem família/produto por `mes_aquisicao` e
`ano_aquisicao`; retenção acrescenta `meses_desde_aquisicao` e `mes_referencia` e
exige manter safra e idade em meses no agrupamento. Crescimento aceita dimensões
de cliente/atribuição e mantém seu próprio calendário.

## Semântica dos filtros

No financeiro, ano/mês/período e atributos comerciais filtram itens de
`fato_vendas`. Safra e status atual vêm de um join 1:1 com `dim_clientes`. O filtro
de status é o atual do snapshot, inclusive quando a receita consultada é antiga;
o status histórico permanece em `fato_clientes_mensal`.

Nas consultas de aquisição, qualidade e retenção, as datas selecionam a aquisição
observada. Filtros BU/vendedor/canal/estado/município selecionam clientes que
possuem esse atributo no conjunto do primeiro dia. Os financeiros acumulados
incluem as transações posteriores desses clientes até a referência, mesmo que o
cliente depois mude de vendedor ou BU. Filtros de família/produto são rejeitados
nessas consultas: sua atribuição à aquisição requer uma definição comercial
específica. Esses filtros estão disponíveis no financeiro.

Em `lifecycle_summary`, os mesmos filtros selecionam clientes por aquisição;
sem filtros temporais, clientes sem compra válida também entram. A contagem de
reativados representa raízes com transição sinalizada como reativação em algum
mês do histórico observado; não representa quantidade de eventos de reativação.

No crescimento, as datas selecionam os buckets completos de mês/ano exibidos.
As janelas de comparação são calculadas antes desse recorte. Meses sem aquisição
possuem zero no calendário; `LAG(1)` compara o mês anterior e `LAG(12)`, o mesmo mês
do ano anterior. A série anual usa `LAG(1)` sobre anos consecutivos. Divisor zero
ou período anterior fora do histórico retorna `NULL`. `month` é rejeitado na
série anual. O mês/ano corrente pode estar aberto: a contagem corresponde ao
snapshot e deve ser interpretada como parcial.

## Regras financeiras e granularidade

O financeiro inclui devoluções, margens negativas e demais status. Exclui somente
emissões ausentes/inválidas ou posteriores à referência e os filtros explícitos.
Os registros excluídos dessa visão continuam preservados na origem/fato e no
relatório de qualidade. `compra_valida` seleciona compras para ciclo de vida e
não restringe reconciliação financeira.

Impostos são a diferença entre as somas contábil e líquida; MB% é a soma da margem
financeira dividida pela soma líquida. Qualquer ausência na medida de origem da
população agregada torna a soma dessa medida desconhecida (`NULL`); as medidas
independentes ainda podem ser conhecidas. Contagens de campos ausentes acompanham
o resumo financeiro. Divisão por zero retorna `NULL`, sem arredondamento antecipado.

`documentos_distintos` conta identificadores documentais completos distintos.
`itens_documento_incompleto` mostra quantos itens não podem compor esse denominador.
Os tickets contábil/líquido usam somente o faturamento dos itens com documento
identificado e dividem pela respectiva quantidade de documentos distintos; uma
nota com vários itens continua sendo uma nota. Os totais financeiros preservam
itens sem documento. Receita média por cliente usa somente receitas de raízes
identificadas e o número dessas raízes. Uma população selecionada vazia tem
receita de subconjunto igual a zero; uma fonte monetária ausente continua `NULL`.

Participação dos novos usa receita líquida das transações no mesmo mês da
aquisição observada, dividida pela receita líquida total do recorte. Pode refletir
devoluções; não é uma participação calculada sobre apenas compras válidas.

Aquisição representa a primeira compra válida observada desde o início disponível
do histórico, não uma comprovação de que o cliente jamais comprou anteriormente.
Cada raiz é adquirida uma vez. A política configurável `first_day_bundle` soma os
documentos válidos do primeiro dia, conforme definição aprovada; a política
`pending` mantém os valores da primeira compra como `NULL` se houver vários
documentos e explicita `clientes_atribuicao_pendente`.

Agrupamentos comerciais de aquisição/qualidade usam os arrays ordenados completos
como conjuntos exclusivos. Um cliente com `[BU A, BU B]` aparece nesse grupo
conjunto uma vez; sua receita não é repetida por um `UNNEST`. Filtros individuais
usam pertinência no conjunto. Consultas separadas filtradas por BU A e por BU B
podem, portanto, incluir a mesma raiz: esses dois recortes não são aditivos.

`acquisition_attribution` permite comparar membros individuais em vez dos conjuntos:
`dimension` aceita `business_unit`, `vendedor`, `canal_venda`, `estado` ou
`municipio`. Cada linha contém somente a dimensão, `clientes_novos` distintos e
`clientes_multiplas_atribuicoes`: dentre os clientes associados àquela linha,
quantos possuem mais de um atributo nessa dimensão no primeiro dia. Uma raiz
associada a BU A e BU B conta uma vez em cada linha, sem multiplicação por itens
da nota. As contagens são **não aditivas** entre linhas. A consulta não oferece
somas financeiras nem presume divisão de receita entre membros. Atributos ausentes
não criam associações artificiais. Os filtros selecionam as raízes primeiro; ao
filtrar BU A, uma raiz adquirida em `[BU A, BU B]` continua mostrando suas duas
associações se a dimensão exibida for `business_unit`.

## Retenção, recompra e referência

`clientes_elegiveis_recompra_30d/60d/90d/180d` conta somente clientes com a janela
completa de observação; `clientes_imaturos_*` explicita os demais. Numeradores e
`taxa_recompra_*` usam o mesmo conjunto elegível. A segunda compra é um documento
válido distinto; documentos diferentes no mesmo dia podem produzir intervalo
zero. Intervalo médio de ciclo de vida pondera todos os intervalos documentais
observados, enquanto média/mediana até a segunda compra usam uma observação por
cliente que efetivamente recomprou. Clientes sem segunda compra não recebem
tempo artificial e são contados separadamente.

Na retenção mensal, M0 mostra aquisição e eventuais recompras acumuladas;
`clientes_retidos`/`taxa_retencao` são `NULL` em M0. M1 e posteriores contam raízes
com pelo menos uma compra válida no mês, uma vez por período. Um mês aberto
preserva contagens observadas, mas tem elegíveis zero e taxas `NULL`, com
`periodo_completo=false`. Meses fechados sem compra aparecem com atividade zero.

`retencao_90d` e `retencao_180d` da qualidade de aquisição permanecem `NULL`, com
`definicao_retencao_dias=PENDENTE_DEFINICAO_JANELA_RETENCAO`. Recompra até 90/180 dias
já está definida e calculada; uma janela de retenção após esses marcos ainda
depende de confirmação do responsável.

A referência vem de `pipeline_metadata`. Pode ser informada explicitamente ao
construtor em uma conexão preparada sem metadados. Se divergir da referência de
um snapshot existente, a consulta é recusada: é preciso reprocessar os modelos
para recalcular status e maturidade. SQL distribuído como recurso do pacote vive
em `src/customer_intelligence/sql/` e é usado diretamente pelos métodos.
