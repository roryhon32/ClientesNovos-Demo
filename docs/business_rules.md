# Regras de negócio e pendências

## Confirmadas

Faturamento contábil vem de `Valor Contábil`; faturamento líquido de `Fat. Líquido`; impostos são a diferença. Os campos tributários individuais não compõem a métrica de impostos. A margem monetária oficial vem de `Margem Bruta (R$)` e não é recalculada a partir de custos. A margem percentual de qualquer agrupamento é 100 × soma da margem / soma do faturamento líquido. O percentual de impostos é 100 × impostos totais / contábil total. Divisor zero ou ausente produz NULL.

Compras comerciais válidas exigem status FATURADO, origem Margem Bruta por NF, quantidade faturada positiva, contábil positivo e emissão válida até a referência. Por confirmação do usuário, **DEV - Quant. > 0 identifica devolução e exclui a linha das compras válidas**, mesmo com FAT - Quant. e valores positivos. Devoluções não adquirem, não geram segunda compra e não atualizam recência/reativação. DEV é opcional: ausente mantém compatibilidade com o contrato; preenchido ilegível ou fora da precisão exclui a compra e gera advertência, sem imputação. Texto ignora caixa e espaços excedentes. Para contar documentos por cliente é necessário também identidade consistente e chave documental completa. As condições comerciais ficam separadas dessas exigências de identificação. Transações excluídas do ciclo de vida continuam no fato financeiro e na auditoria.

RAIZ CNPJ é texto com oito dígitos. Pontuação convencional é removida, zeros são preservados e CPF não é tratado como CNPJ. Documentos completos informados precisam de 14 dígitos e dígitos verificadores válidos; raízes dos campos presentes devem concordar. Campo preenchido inválido ou conflito torna a raiz analítica NULL, sem chave compartilhada de cliente desconhecido. Sem documentos completos, uma raiz explícita com oito dígitos pode identificar a raiz, acompanhada de advertência de CNPJ ausente. Sem raiz explícita, um CNPJ completo válido permite derivar seus oito primeiros dígitos. Não há consulta cadastral nem comprovação de existência/regularidade fiscal.

A aquisição acontece uma vez por raiz na primeira compra válida observada desde `history_start`, por padrão 2020-01-01. Mudança de filial, vendedor ou BU não cria aquisição. Conforme confirmação do responsável nesta sessão, a primeira compra comercial soma todas as notas da primeira data. BUs, vendedores, canais e localidades são preservados em conjuntos ordenados; escalares só são preenchidos quando existe um único valor conhecido. Não há rateio ou crédito comercial arbitrário.

A segunda compra é o segundo documento distinto. Pode ocorrer na mesma data da primeira e produzir intervalo zero; vários itens da mesma nota nunca produzem recompra. Janelas 30/60/90/180 são dias corridos desde a aquisição, incluindo o último dia. Só clientes com a janela completa entram no denominador. Janelas imaturas retornam NULL no indicador individual.

NOVO significa primeira compra observada no mês; RECORRENTE, primeira compra em mês anterior e última compra até 179 dias; EM RISCO, de 180 a 364 dias; INATIVO, a partir de 365 dias. SEM FATURAMENTO significa identidade válida sem compra válida. Conforme confirmação, SEM CLASSIFICAÇÃO é preservado quando não há compra válida e é o único status informado na origem. A causa dessa condição não é inferida. A origem é preservada separadamente.

Cada fechamento mensal usa somente compras ocorridas até aquele dia. O mês aberto termina na referência. As séries incluem meses sem movimento e podem começar antes da aquisição se houver transações observadas anteriores, para reconciliação. Meses sem transações têm medidas monetárias zero; medidas faltantes em transações existentes permanecem desconhecidas.

Retenção mensal conta clientes adquiridos na safra que compraram no mês de acompanhamento. M0 expõe aquisição separadamente e taxa de retenção NULL. Recompra acumulada conta quem já realizou o segundo documento até o fechamento. Períodos abertos têm observações parciais e taxas NULL. Reativação identificada por transição mensal significa INATIVO → RECORRENTE; retomada de EM RISCO recebe indicador separado.

## Políticas técnicas explícitas

O filtro global `valid_purchases_gt=N` seleciona clientes com quantidade oficial
de documentos de compra válidos **estritamente maior que N**, no snapshot.
Mais de 1 significa pelo menos 2; mais de 5, pelo menos 6. Não conta itens,
devoluções ou duplicidades e não reinicia a contagem no período selecionado.
O período continua limitando o escopo próprio de cada análise. Clientes sem
compras válidas têm contagem zero; parâmetro ausente não restringe a população.

Somas de uma medida com qualquer item nulo retornam NULL para impedir a apresentação de total parcial como completo. Essa política é conservadora, documentada e acompanhada de contagens de completude. Nenhum valor financeiro é preenchido, ajustado ou corrigido automaticamente.

A chave documental oficial usa exclusivamente `Filial`, `Num. Docto.`, `Cód. Cliente` e `Empresa`. Série, emissão, item e NF + Prod. não compõem a chave. A emissão normalizada determina a cronologia dos documentos distintos. Múltiplos itens continuam no faturamento; compras contam documentos e ticket divide o faturamento pelo número de documentos distintos.

## Validação futura necessária

- Definir as janelas de retenção após 90/180 dias. Por decisão explícita, esses indicadores ficam NULL e marcados como pendentes; recompra acumulada nesses prazos está implementada.
- Validar o significado de campos semelhantes, incluindo `ECOMERCE` e `E-COMERCE`, que permanecem distintos, e as famílias de valores ajustados.
- Confirmar formatos e precisão do contrato real antes de implementar um adaptador de produção. O adaptador desta fase não lê arquivos externos.
- A identificação sintética não prova cadastro real. O histórico desde 2020 limita a interpretação de aquisição à primeira compra observada.


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
