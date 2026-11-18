# Validação da execução sintética

Referência: 2026-10-22; seed: 2026; clientes solicitados: 300.

Nenhuma base real foi lida. Fonte: gerador interno em memória.

Gate de qualidade: APROVADO.

| Tabela | Linhas |
| --- | ---: |
| dim_clientes | 300 |
| fato_vendas | 784 |
| fato_clientes_mensal | 6406 |
| fato_aquisicao | 275 |
| fato_cohort | 840 |
| fato_transicoes | 537 |

## Qualidade

| Indicador | Resultado |
| --- | ---: |
| records | 784 |
| distinct_roots | 300 |
| distinct_documents | 484 |
| identified_records | 782 |
| min_date | 2020-01-01 |
| max_date | 2026-11-01 |
| invalid_purchase_records | 56 |
| null_financial_records | 1 |
| missing_bu | 1 |
| missing_seller | 1 |
| incomplete_documents | 0 |
| missing_cnpj | 1 |
| invalid_cnpj | 1 |
| conflicting_identity | 0 |
| invalid_dates | 1 |
| future_dates | 1 |
| before_history | 0 |
| invalid_return_quantity | 0 |
| invalid_money | 0 |
| source_margin_percent_divergences | 0 |
| cpf_records | 0 |
| adjusted_measure_records | 784 |
| null_accounting | 1 |
| null_net | 1 |
| null_margin | 1 |
| identified_clients | 300 |
| duplicate_source_rows | 0 |
| duplicate_items | 0 |
| ambiguous_documents | 0 |
| missing_cnpj_percent | 0.12755102040816327 |
| invalid_cnpj_percent | 0.12755102040816327 |

| Severidade | Código | Ocorrências |
| --- | --- | ---: |
| warning | missing_cnpj | 1 |
| warning | invalid_cnpj | 1 |
| warning | invalid_dates | 1 |
| observation | future_dates | 1 |
| warning | null_financial_records | 1 |
| warning | missing_bu | 1 |
| warning | missing_seller | 1 |
| observation | invalid_purchase_records | 56 |
| observation | adjusted_measure_records | 784 |

## Distribuição do status atual

| Status | Clientes |
| --- | ---: |
| EM RISCO | 56 |
| INATIVO | 64 |
| NOVO | 50 |
| RECORRENTE | 105 |
| SEM FATURAMENTO | 25 |

## Etapas

| Etapa | Segundos |
| --- | ---: |
| ingestion_normalization | 0.192873 |
| staging_sales | 3.637649 |
| quality | 0.089844 |
| dimensional_models | 0.582462 |
| reconciliation | 0.085912 |

Reconciliação automática: contagens e somas fonte/fato, join com dimensão, unicidade dos seis grãos e reconciliações mensais/cohort (quando disponíveis).

As advertências são defeitos sintéticos intencionais, preservados nos fatos. Totais com componente financeiro ausente são NULL, acompanhados por contagens de completude.

Retenção após 90/180 dias segue pendente de definição da janela; recompra acumulada é calculada.
