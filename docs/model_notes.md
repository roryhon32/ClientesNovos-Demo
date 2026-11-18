# Decisões dos modelos dimensionais

`fato_vendas` preserva os itens de origem. Os outros modelos são fotografias da
`reference_date`, limitadas por `history_start`. Itens com emissão futura ou sem
data válida permanecem na fato e não entram nas medidas financeiras temporais.
Raízes desconhecidas não recebem chave compartilhada e não entram na dimensão.

## Compras e aquisição

`compras_validas` é uma tabela auxiliar com uma linha por raiz e identificador
documental completo. Somente itens com `compra_valida` entram nessa contagem.
O identificador documental usa exclusivamente a composição oficial confirmada:
`Filial`, `Num. Docto.`, `Cód. Cliente` e `Empresa`. Série, emissão, item e NF + Prod.
não entram na chave. Emissão normalizada serve à cronologia, sem alterar a identidade da nota. A composição é serializada de maneira
estruturada e recebe hash, evitando colisões por separadores textuais. Se algum
componente exigido faltar, o identificador permanece NULL e o item financeiro é
preservado, mas não conta como compra/recompra. `NF + Prod.` não é utilizado.
Itens da mesma nota não geram recompra. A segunda compra é o segundo documento
ordenado por data e identificador, inclusive quando ocorreu no mesmo dia da
primeira. O desempate técnico nunca escolhe BU, vendedor ou outro atributo.

A aquisição é a primeira compra **observada no histórico disponível**, iniciado
em 2020 por padrão; não comprova o nascimento do relacionamento comercial.
Trocas de filial, BU e vendedor não geram outra aquisição da raiz.

A política confirmada `first_day_bundle` soma todos os itens de todos os
documentos válidos da primeira data. Os atributos da aquisição são conjuntos
distintos ordenados. O campo escalar é preenchido somente quando o conjunto tem
um único valor. Em atribuições múltiplas, a lista preserva o contexto sem escolher
um responsável. Desconhecimento de um atributo continua desconhecimento; listas
contêm apenas os valores informados. Contagens de clientes por múltiplas
atribuições não devem ser somadas como se fossem exclusivas.

A política alternativa `pending` deixa valores e escalares comerciais da primeira
compra nulos quando existem vários documentos na primeira data, com
`atribuicao_comercial_pendente = true`. As listas e a aquisição da raiz são
preservadas. Nenhuma política rateia valores financeiros entre BUs ou vendedores.

`nome_cliente_representativo` usa o menor nome informado em ordem lexicográfica.
Isso fornece um rótulo determinístico, sem atribuir preferência comercial.

## Status e tempo

O status é calculado com compras válidas conhecidas até a referência: NOVO no mês
da primeira compra; RECORRENTE até 179 dias sem compra; EM RISCO de 180 a 364;
INATIVO a partir de 365. Sem compras válidas, o status é SEM FATURAMENTO.

A política confirmada `preserve_without_purchase` mantém SEM CLASSIFICAÇÃO
somente quando não existe compra válida e esse é o único status de origem
informado. Conflitos de origem não recebem prioridade. A política `source_only`
mantém a classificação calculada e a lista de classificações de origem. A
alternativa `pending` também calcula o status e sinaliza
`status_especial_pendente`.

A classificação de origem preserva o resultado informado pela automação externa;
não comprova uma classificação histórica. As medidas históricas dependem das
datas das compras, nunca do status atual. No tratamento especial sem compras, a
presença do rótulo de origem só é considerada a partir da primeira observação
datada desse rótulo. Uma classificação de origem sem data não é retroativamente
aplicada a meses históricos.

O calendário mensal começa na primeira transação datada da raiz, podendo incluir
devoluções anteriores à aquisição, e termina na referência. Isso permite
reconciliar transações identificáveis sem omitir movimentos anteriores à primeira
compra válida. Se não existe data válida, começa em `history_start`. Antes da
primeira compra válida, o status é SEM FATURAMENTO, sujeito à política especial.
Fechamentos passados usam o último dia do mês; o mês aberto usa `reference_date`.

`fato_transicoes` contém somente mudanças com um mês anterior observado.
`reativacao` indica INATIVO → RECORRENTE; EM RISCO → RECORRENTE recebe a flag
separada `retomada_em_risco`.

## Financeiro e ausência de informação

Somas monetárias preservam precisão decimal. Se qualquer item de um agrupamento
é desconhecido em uma medida, o total dessa medida é NULL. Essa política impede
que um total parcial pareça completo. Os percentuais são recalculados a partir
dos totais completos, com divisor zero ou desconhecido retornando NULL.

Impostos são a diferença oficial entre contábil e líquido. Margem monetária vem
do campo oficial. Nenhuma média simples de percentuais é usada. Um mês sem
transações tem somas monetárias zero e percentuais NULL. Um mês com transações
cujos valores faltam mantém NULL nesses valores.

## Recompra, maturidade e cohort

`maturidade_30d`, `maturidade_60d`, `maturidade_90d` e `maturidade_180d` indicam
observação de toda a janela a partir da data da primeira compra. Os indicadores
`recompra_*d` são NULL nas janelas incompletas, inclusive quando uma recompra já
foi observada; nas janelas completas indicam a segunda compra até o prazo,
inclusive o último dia. Para clientes sem aquisição, a maturidade é NULL.

Coortes usam meses calendário relativos ao mês da aquisição. Cada raiz aparece
uma vez por período. M0 contém `clientes_adquiridos`; `clientes_retidos` e
`taxa_retencao` são NULL em M0. A recompra acumulada em M0 pode existir quando há
um segundo documento, enquanto aquisição isolada nunca conta como recompra.

A retenção de M1 em diante usa clientes com compra válida naquele mês. A
recompra acumulada usa a segunda compra observada até o encerramento do período.
`clientes_observados` informa o tamanho observado da safra, inclusive no mês
aberto. `clientes_elegiveis` é esse total apenas em períodos completos, e é zero
no mês aberto. `periodo_completo` expõe o motivo; as duas taxas são NULL no mês
aberto. Numeradores observados ainda são apresentados sem sugerir uma taxa final.
Taxas são expressas em percentual, de 0 a 100.

Retenção por janela de 90/180 dias é diferente de recompra nessa janela e requer
definição comercial adicional; os modelos não inventam uma janela de retenção.

## Execução e escala

Todas as transformações são SQL vetorizado no DuckDB. Os únicos laços Python
geram expressões SQL de um conjunto fixo de medidas/janelas; não percorrem linhas
de dados. A expansão mensal é proporcional a clientes × meses observáveis.
O pipeline controla a transação para substituir fatos e modelos atomicamente.
Tabelas auxiliares de trabalho são temporárias; `compras_validas` é preservada
para inspeção e consultas de intervalos entre documentos. A tabela
`reconciliacao_financeira` registra todos os itens em buckets financeiros
exclusivos, incluindo itens fora do escopo mensal/cohort. Contagens de nulos e
somas dos componentes conhecidos distinguem ausência de informação de zero.

A reconciliação mensal compara cada raiz/mês contra os itens da fato, incluindo
meses sem movimentos, usando `FULL OUTER JOIN` e `IS NOT DISTINCT FROM`. A
reconciliação de cohort compara cada safra/período diretamente com os itens
atribuíveis, sem depender dos totais mensais derivados. Valores decimais e
percentuais usam as mesmas fórmulas oficiais e são comparados exatamente, com
NULL igual apenas a NULL. Grupos ausentes, adicionais e valores divergentes
interrompem a execução.


## Consistência documental

A chave oficial não pode ser estendida pela configuração. `dq_document_conflicts`
detalha cada chave associada a datas normalizadas diferentes, raízes distintas,
mistura de data/raiz conhecida e desconhecida ou séries divergentes. Série é
atributo de cabeçalho auditado, nunca componente da chave. BUs, produtos,
vendedores e famílias podem variar por item e não são conflitos de identidade.
O relatório registra as linhas de origem e os valores divergentes, sem escolher
uma data, raiz ou série corretiva. O gate bloqueia a publicação por padrão;
`QualityError.report.document_conflicts` mantém os detalhes mesmo após rollback.
No modo explícito de inspeção, a tabela é persistida e o snapshot permanece
reprovado: métricas de ciclo de vida desse snapshot não devem ser consumidas.
Nenhuma linha ou medida financeira é descartada ou corrigida.
