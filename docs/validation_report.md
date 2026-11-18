# Relatório de validação

Implementação validada exclusivamente com entradas artificiais geradas em memória. Referência analítica: **2026-10-22**. Nenhum arquivo corporativo, banco real, unidade de rede ou API externa foi consultado. Nenhuma automação existente foi alterada. Não há frontend nem endpoints HTTP.

## Resultados executados

- `python -m pytest -p no:cacheprovider`: **114 passed in 62.85s**, após atualização da chave documental oficial.
- Persistência, idempotência, rollback e reconciliação estão incluídos na suíte completa atual.
- CLI completo com 100 clientes, seed 42, persistência sintética e relatório Markdown: aprovado, 267 itens.
- Wheel `dist/customer_intelligence-0.1.0-py3-none-any.whl`: gerado localmente, importado diretamente do arquivo e executado com dados sintéticos. Templates SQL, catálogo com sete consultas, associação por BU e agregação financeira funcionaram a partir do pacote, sem depender do diretório `src` no import.
- Benchmarks de 100, 1.000 e 5.000 clientes: executados e registrados em [benchmark_results.md](benchmark_results.md), com tempos por etapa em `data/synthetic/benchmark_results.json`. Não foram estabelecidas metas artificiais.

Ambiente observado: Python 3.13.14, Polars 1.43.0, DuckDB 1.5.5, PyArrow 20.0.0, Pydantic 2.13.5 e Pytest 9.0.2. Uv indisponível; as dependências já existentes permitiram executar sem instalação ou acesso à rede.

## Cobertura dos critérios de aceite

| Critério | Evidência |
| --- | --- |
| Pipeline completo e seis estruturas | CLI e testes de existência/granularidade; contagens em [synthetic_run.md](synthetic_run.md) |
| Impostos oficiais | Testes positivos, zero, negativos e ausências; contábil − líquido no item e agregado |
| Margem oficial | Valor monetário da origem; percentual calculado sobre líquido |
| Percentuais agregados corretos | Testes com itens de margens diferentes por BU, mês e raiz; fórmula ponderada |
| Aquisição por raiz | Matriz/filial, troca de vendedor/BU e conjuntos da primeira data |
| Histórico sem vazamento | Compras futuras, meses fechados, mês aberto e fronteiras 179/180/364/365 dias |
| Recompra documental | Múltiplos itens, duas notas no mesmo dia e data normalizada em dois formatos |
| Cohort e maturidade | M0 separado, meses sem compras, clientes únicos, janelas imaturas fora do denominador |
| Integridade e reconciliação | Fonte/fato por linha, nulidades preservadas, join sem multiplicação, agregados por cliente/mês e safra/período |
| Gate financeiro detecta desvios | Testes adulteram valor agregado, removem mês e trocam NULL por zero; todos detectados |
| Idempotência e atomicidade | Reexecução no mesmo banco sintético e rollback que mantém a versão anterior após qualidade bloqueante |
| Filtros e consultas | Filtros validados, valores parametrizados, dimensões permitidas e strings com tentativas de injeção |
| Documentação | README, arquitetura, contrato integral de 129 colunas, regras, SQL, modelos e pendências |
| Restrições de acesso | Adaptador em memória; destino sintético delimitado; nenhuma fonte real ou integração externa |

## Qualidade e reconciliação

`dq_summary`, `dq_issues` e `dq_status_distribution` conservam indicadores, severidades e distribuições de classificações no snapshot. Erros bloqueantes incluem duplicidade de origem/item candidato, ambiguidade documental e valores monetários ilegíveis/fora da precisão declarada. Advertências registram identidade, datas, medidas ausentes, BU/vendedor ausentes e divergência do percentual de margem informado. Observações descrevem inelegibilidade comercial, movimentos futuros e campos ajustados presentes.

`reconciliacao_financeira` representa todos os itens em buckets exclusivos e informa sua participação nos escopos mensal e cohort. Medidas conhecidas e contagens de desconhecidos permitem inspecionar diferenças sem apresentar total parcial como completo. Cada agregado oficial incompleto permanece NULL.

Os defeitos do gerador são intencionais: datas ilegíveis/futuras, CNPJs inválidos/ausentes, ausência financeira, valores negativos, líquido zero e atributos ausentes. Eles permanecem auditáveis. O relatório detalhado da carga persistida está em [synthetic_run.md](synthetic_run.md).

## Limitações e pendências

- A chave documental foi confirmada como Filial + Num. Docto. + Cód. Cliente + Empresa. A atualização e seus testes estão em [document_key_validation.md](document_key_validation.md).
- Retenção após 90/180 dias permanece explicitamente NULL e pendente da definição das janelas, conforme decisão do responsável. Recompra acumulada em 30/60/90/180 dias e retenção mensal estão implementadas.
- O início do histórico em 2020 limita a aquisição à primeira compra observada.
- Campos de e-commerce semelhantes e medidas ajustadas permanecem distintos, sem atribuir significado não validado.
- Benchmarks de desenvolvimento não comprovam capacidade para milhões de linhas em produção. A carga em memória, conversões Arrow e grade cliente/mês requerem dimensionamento posterior.
- O sandbox Windows negou acesso a diretórios privados criados por `tempfile`/cache do Pytest e pelo build padrão. Os testes usam criação comum de diretórios sob o workspace e cache desativado. O wheel foi gerado por uma chamada local do comando de build do Setuptools, sem alterar dependências; a execução do pacote passou. Alguns diretórios temporários vazios, ignorados pelo projeto, podem permanecer inacessíveis por ACL. Isso não afeta a execução do pipeline.
