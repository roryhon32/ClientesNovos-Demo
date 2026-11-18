# Contrato dos modelos DuckDB

Snapshot de tipos obtido automaticamente de uma execucao sintetica em memoria: referencia 2026-10-22, seed 42, 30 clientes solicitados. Nenhuma fonte real foi consultada.

| Estrutura | Grao logico |
| --- | --- |
| dim_clientes | Uma raiz CNPJ identificada e observada ate a referencia |
| fato_vendas | Um item de origem, incluindo movimentos nao elegiveis |
| fato_clientes_mensal | Uma raiz e um mes observado no calendario denso |
| fato_aquisicao | Uma raiz com primeira compra valida observada |
| fato_cohort | Uma safra e um mes calendario relativo a aquisicao |
| fato_transicoes | Uma raiz e um mes em que o status mudou |
| compras_validas | Uma raiz e um identificador documental completo |
| reconciliacao_financeira | Um bucket exclusivo de escopo financeiro |

As chaves sao verificadas pelo pipeline e pela reconciliacao. As tabelas sao materializadas por SQL CTAS; a nulabilidade fisica do DDL nao substitui os invariantes de granularidade e identidade.

Atributos comerciais escalares de aquisicao so sao preenchidos quando ha um unico valor conhecido. As listas ordenadas de BUs, vendedores, canais e localidades preservam multiatribuicao. Elas nao fazem rateio financeiro; explodir essas listas junto a valores pode multiplicar totais.

O bundle da primeira data inclui todas as notas validas dessa data. A segunda nota distinta, inclusive na mesma data, e recompra. M0 tem aquisicao explicita e retencao NULL; meses abertos tem taxas NULL e clientes_elegiveis zero. Medidas financeiras desconhecidas ficam NULL, enquanto meses sem transacoes tem somas zero.

Buckets de reconciliacao sao exclusivos, nesta precedencia: sem_data_valida, anterior_historico, futuro, sem_raiz_identificada, cliente_sem_compra_valida, anterior_aquisicao, incluido_cohort. Os tres ultimos participam do mensal; apenas incluido_cohort participa da cohort. Valores *_conhecido somam componentes presentes; medidas sem sufixo exigem completude e ficam NULL se houver item desconhecido.

A chave documental oficial confirmada: Filial + Num. Docto. + Cod. Cliente + Empresa. Serie, Emissao, Item e NF + Prod. nao compoem a chave. Componentes ausentes produzem documento NULL sem excluir o item financeiro.

Regras e limites completos: [model_notes.md](model_notes.md).

## dim_clientes

| Coluna | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| nome_cliente_representativo | VARCHAR |
| data_primeira_observacao | DATE |
| data_primeira_compra | DATE |
| data_ultima_compra | DATE |
| data_segunda_compra | DATE |
| mes_aquisicao | DATE |
| ano_aquisicao | INTEGER |
| safra_aquisicao | VARCHAR |
| bu_primeira_compra | VARCHAR |
| business_units_primeira_compra | VARCHAR[] |
| vendedor_primeira_compra | VARCHAR |
| vendedores_primeira_compra | VARCHAR[] |
| canal_primeira_compra | VARCHAR |
| canais_primeira_compra | VARCHAR[] |
| estado_primeira_compra | VARCHAR |
| estados_primeira_compra | VARCHAR[] |
| municipio_primeira_compra | VARCHAR |
| municipios_primeira_compra | VARCHAR[] |
| status_atual | VARCHAR |
| cliente_status_atual | VARCHAR |
| quantidade_compras_validas | BIGINT |
| dias_desde_ultima_compra | BIGINT |
| dias_ate_segunda_compra | BIGINT |
| intervalo_medio_entre_compras | DOUBLE |
| maturidade_30d | BOOLEAN |
| recompra_30d | BOOLEAN |
| maturidade_60d | BOOLEAN |
| recompra_60d | BOOLEAN |
| maturidade_90d | BOOLEAN |
| recompra_90d | BOOLEAN |
| maturidade_180d | BOOLEAN |
| recompra_180d | BOOLEAN |
| status_origem | VARCHAR[] |
| status_especial_pendente | BOOLEAN |
| atribuicao_comercial_pendente | BOOLEAN |
| quantidade_documentos_primeiro_dia | BIGINT |
| data_referencia | DATE |

```sql
CREATE TABLE dim_clientes(raiz_cnpj VARCHAR, nome_cliente_representativo VARCHAR, data_primeira_observacao DATE, data_primeira_compra DATE, data_ultima_compra DATE, data_segunda_compra DATE, mes_aquisicao DATE, ano_aquisicao INTEGER, safra_aquisicao VARCHAR, bu_primeira_compra VARCHAR, business_units_primeira_compra VARCHAR[], vendedor_primeira_compra VARCHAR, vendedores_primeira_compra VARCHAR[], canal_primeira_compra VARCHAR, canais_primeira_compra VARCHAR[], estado_primeira_compra VARCHAR, estados_primeira_compra VARCHAR[], municipio_primeira_compra VARCHAR, municipios_primeira_compra VARCHAR[], status_atual VARCHAR, cliente_status_atual VARCHAR, quantidade_compras_validas BIGINT, dias_desde_ultima_compra BIGINT, dias_ate_segunda_compra BIGINT, intervalo_medio_entre_compras DOUBLE, maturidade_30d BOOLEAN, recompra_30d BOOLEAN, maturidade_60d BOOLEAN, recompra_60d BOOLEAN, maturidade_90d BOOLEAN, recompra_90d BOOLEAN, maturidade_180d BOOLEAN, recompra_180d BOOLEAN, status_origem VARCHAR[], status_especial_pendente BOOLEAN, atribuicao_comercial_pendente BOOLEAN, quantidade_documentos_primeiro_dia BIGINT, data_referencia DATE);
```

## fato_vendas

| Coluna | Tipo DuckDB |
| --- | --- |
| identificador_item | VARCHAR |
| source_row_id | UINTEGER |
| source_fingerprint | VARCHAR |
| chave_item_candidata | VARCHAR |
| identificador_documento | VARCHAR |
| raiz_cnpj | VARCHAR |
| data_emissao | DATE |
| mes_referencia | DATE |
| business_unit | VARCHAR |
| codigo_produto | VARCHAR |
| descricao_produto | VARCHAR |
| familia | VARCHAR |
| subfamilia | VARCHAR |
| vendedor | VARCHAR |
| estado | VARCHAR |
| municipio | VARCHAR |
| canal_venda | VARCHAR |
| nome_cliente | VARCHAR |
| cliente_status_origem | VARCHAR |
| faturamento_contabil | DECIMAL(24,6) |
| faturamento_liquido | DECIMAL(24,6) |
| impostos | DECIMAL(25,6) |
| percentual_impostos | DOUBLE |
| margem_bruta_valor | DECIMAL(24,6) |
| margem_bruta_percentual | DOUBLE |
| quantidade_faturada | DECIMAL(24,6) |
| quantidade_devolvida | DECIMAL(24,6) |
| quantidade_liquida | DECIMAL(24,6) |
| criterios_comerciais_validos | BOOLEAN |
| compra_valida | BOOLEAN |
| status_origem | VARCHAR |
| origem_transacao | VARCHAR |

```sql
CREATE TABLE fato_vendas(identificador_item VARCHAR, source_row_id UINTEGER, source_fingerprint VARCHAR, chave_item_candidata VARCHAR, identificador_documento VARCHAR, raiz_cnpj VARCHAR, data_emissao DATE, mes_referencia DATE, business_unit VARCHAR, codigo_produto VARCHAR, descricao_produto VARCHAR, familia VARCHAR, subfamilia VARCHAR, vendedor VARCHAR, estado VARCHAR, municipio VARCHAR, canal_venda VARCHAR, nome_cliente VARCHAR, cliente_status_origem VARCHAR, faturamento_contabil DECIMAL(24,6), faturamento_liquido DECIMAL(24,6), impostos DECIMAL(25,6), percentual_impostos DOUBLE, margem_bruta_valor DECIMAL(24,6), margem_bruta_percentual DOUBLE, quantidade_faturada DECIMAL(24,6), quantidade_devolvida DECIMAL(24,6), quantidade_liquida DECIMAL(24,6), criterios_comerciais_validos BOOLEAN, compra_valida BOOLEAN, status_origem VARCHAR, origem_transacao VARCHAR);
```

## fato_clientes_mensal

| Coluna | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| mes_referencia | DATE |
| status_historico | VARCHAR |
| cliente_status_historico | VARCHAR |
| data_ultima_compra_ate_mes | DATE |
| dias_sem_compra | BIGINT |
| quantidade_notas_mes | BIGINT |
| quantidade_compras_acumuladas | BIGINT |
| quantidade_itens_financeiros_mes | BIGINT |
| quantidade_documentos_financeiros_mes | BIGINT |
| quantidade_itens_sem_documento_mes | BIGINT |
| faturamento_contabil_mes | DECIMAL(38,6) |
| faturamento_liquido_mes | DECIMAL(38,6) |
| impostos_mes | DECIMAL(38,6) |
| margem_bruta_valor_mes | DECIMAL(38,6) |
| percentual_impostos_mes | DOUBLE |
| margem_bruta_percentual_mes | DOUBLE |
| data_referencia_mes | DATE |
| periodo_completo | BOOLEAN |
| status_especial_pendente | BOOLEAN |

```sql
CREATE TABLE fato_clientes_mensal(raiz_cnpj VARCHAR, mes_referencia DATE, status_historico VARCHAR, cliente_status_historico VARCHAR, data_ultima_compra_ate_mes DATE, dias_sem_compra BIGINT, quantidade_notas_mes BIGINT, quantidade_compras_acumuladas BIGINT, quantidade_itens_financeiros_mes BIGINT, quantidade_documentos_financeiros_mes BIGINT, quantidade_itens_sem_documento_mes BIGINT, faturamento_contabil_mes DECIMAL(38,6), faturamento_liquido_mes DECIMAL(38,6), impostos_mes DECIMAL(38,6), margem_bruta_valor_mes DECIMAL(38,6), percentual_impostos_mes DOUBLE, margem_bruta_percentual_mes DOUBLE, data_referencia_mes DATE, periodo_completo BOOLEAN, status_especial_pendente BOOLEAN);
```

## fato_aquisicao

| Coluna | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| data_aquisicao | DATE |
| mes_aquisicao | DATE |
| ano_aquisicao | INTEGER |
| safra_aquisicao | VARCHAR |
| bu_aquisicao | VARCHAR |
| vendedor_aquisicao | VARCHAR |
| canal_aquisicao | VARCHAR |
| estado_aquisicao | VARCHAR |
| municipio_aquisicao | VARCHAR |
| business_units_aquisicao | VARCHAR[] |
| vendedores_aquisicao | VARCHAR[] |
| canais_aquisicao | VARCHAR[] |
| estados_aquisicao | VARCHAR[] |
| municipios_aquisicao | VARCHAR[] |
| valor_primeira_compra | DECIMAL(38,6) |
| faturamento_liquido_primeira_compra | DECIMAL(38,6) |
| impostos_primeira_compra | DECIMAL(38,6) |
| margem_primeira_compra | DECIMAL(38,6) |
| margem_bruta_percentual_primeira_compra | DOUBLE |
| percentual_impostos_primeira_compra | DOUBLE |
| quantidade_documentos_primeiro_dia | BIGINT |
| atribuicao_comercial_pendente | BOOLEAN |
| aquisicao_multiplas_bus | BOOLEAN |
| aquisicao_multiplos_vendedores | BOOLEAN |
| politica_aquisicao | VARCHAR |

```sql
CREATE TABLE fato_aquisicao(raiz_cnpj VARCHAR, data_aquisicao DATE, mes_aquisicao DATE, ano_aquisicao INTEGER, safra_aquisicao VARCHAR, bu_aquisicao VARCHAR, vendedor_aquisicao VARCHAR, canal_aquisicao VARCHAR, estado_aquisicao VARCHAR, municipio_aquisicao VARCHAR, business_units_aquisicao VARCHAR[], vendedores_aquisicao VARCHAR[], canais_aquisicao VARCHAR[], estados_aquisicao VARCHAR[], municipios_aquisicao VARCHAR[], valor_primeira_compra DECIMAL(38,6), faturamento_liquido_primeira_compra DECIMAL(38,6), impostos_primeira_compra DECIMAL(38,6), margem_primeira_compra DECIMAL(38,6), margem_bruta_percentual_primeira_compra DOUBLE, percentual_impostos_primeira_compra DOUBLE, quantidade_documentos_primeiro_dia BIGINT, atribuicao_comercial_pendente BOOLEAN, aquisicao_multiplas_bus BOOLEAN, aquisicao_multiplos_vendedores BOOLEAN, politica_aquisicao VARCHAR);
```

## fato_cohort

| Coluna | Tipo DuckDB |
| --- | --- |
| safra_aquisicao | VARCHAR |
| mes_aquisicao | DATE |
| mes_referencia | DATE |
| meses_desde_aquisicao | INTEGER |
| periodo_completo | BOOLEAN |
| clientes_observados | BIGINT |
| clientes_elegiveis | BIGINT |
| clientes_adquiridos | BIGINT |
| clientes_retidos | BIGINT |
| clientes_com_recompra_acumulada | BIGINT |
| faturamento_contabil_periodo | DECIMAL(38,6) |
| faturamento_liquido_periodo | DECIMAL(38,6) |
| impostos_periodo | DECIMAL(38,6) |
| margem_bruta_valor_periodo | DECIMAL(38,6) |
| percentual_impostos_periodo | DOUBLE |
| margem_bruta_percentual_periodo | DOUBLE |
| taxa_retencao | DOUBLE |
| taxa_recompra_acumulada | DOUBLE |
| margem_bruta_periodo | DECIMAL(38,6) |

```sql
CREATE TABLE fato_cohort(safra_aquisicao VARCHAR, mes_aquisicao DATE, mes_referencia DATE, meses_desde_aquisicao INTEGER, periodo_completo BOOLEAN, clientes_observados BIGINT, clientes_elegiveis BIGINT, clientes_adquiridos BIGINT, clientes_retidos BIGINT, clientes_com_recompra_acumulada BIGINT, faturamento_contabil_periodo DECIMAL(38,6), faturamento_liquido_periodo DECIMAL(38,6), impostos_periodo DECIMAL(38,6), margem_bruta_valor_periodo DECIMAL(38,6), percentual_impostos_periodo DOUBLE, margem_bruta_percentual_periodo DOUBLE, taxa_retencao DOUBLE, taxa_recompra_acumulada DOUBLE, margem_bruta_periodo DECIMAL(38,6));
```

## fato_transicoes

| Coluna | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| mes_referencia | DATE |
| status_anterior | VARCHAR |
| status_atual | VARCHAR |
| tipo_transicao | VARCHAR |
| reativacao | BOOLEAN |
| retomada_em_risco | BOOLEAN |
| periodo_completo | BOOLEAN |

```sql
CREATE TABLE fato_transicoes(raiz_cnpj VARCHAR, mes_referencia DATE, status_anterior VARCHAR, status_atual VARCHAR, tipo_transicao VARCHAR, reativacao BOOLEAN, retomada_em_risco BOOLEAN, periodo_completo BOOLEAN);
```

## compras_validas

| Coluna | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| identificador_documento | VARCHAR |
| data_compra | DATE |
| quantidade_itens | BIGINT |
| business_units | VARCHAR[] |
| vendedores | VARCHAR[] |
| canais | VARCHAR[] |
| faturamento_contabil | DECIMAL(38,6) |
| faturamento_liquido | DECIMAL(38,6) |
| impostos | DECIMAL(38,6) |
| margem_bruta_valor | DECIMAL(38,6) |
| percentual_impostos | DOUBLE |
| margem_bruta_percentual | DOUBLE |

```sql
CREATE TABLE compras_validas(raiz_cnpj VARCHAR, identificador_documento VARCHAR, data_compra DATE, quantidade_itens BIGINT, business_units VARCHAR[], vendedores VARCHAR[], canais VARCHAR[], faturamento_contabil DECIMAL(38,6), faturamento_liquido DECIMAL(38,6), impostos DECIMAL(38,6), margem_bruta_valor DECIMAL(38,6), percentual_impostos DOUBLE, margem_bruta_percentual DOUBLE);
```

## reconciliacao_financeira

| Coluna | Tipo DuckDB |
| --- | --- |
| bucket | VARCHAR |
| escopo_mensal | BOOLEAN |
| escopo_cohort | BOOLEAN |
| quantidade_itens | BIGINT |
| quantidade_clientes | BIGINT |
| faturamento_contabil_conhecido | DECIMAL(38,6) |
| itens_faturamento_contabil_desconhecido | BIGINT |
| faturamento_liquido_conhecido | DECIMAL(38,6) |
| itens_faturamento_liquido_desconhecido | BIGINT |
| impostos_conhecido | DECIMAL(38,6) |
| itens_impostos_desconhecido | BIGINT |
| margem_bruta_valor_conhecido | DECIMAL(38,6) |
| itens_margem_bruta_valor_desconhecido | BIGINT |
| faturamento_contabil | DECIMAL(38,6) |
| faturamento_liquido | DECIMAL(38,6) |
| impostos | DECIMAL(38,6) |
| margem_bruta_valor | DECIMAL(38,6) |
| percentual_impostos | DOUBLE |
| margem_bruta_percentual | DOUBLE |

```sql
CREATE TABLE reconciliacao_financeira(bucket VARCHAR, escopo_mensal BOOLEAN, escopo_cohort BOOLEAN, quantidade_itens BIGINT, quantidade_clientes BIGINT, faturamento_contabil_conhecido DECIMAL(38,6), itens_faturamento_contabil_desconhecido BIGINT, faturamento_liquido_conhecido DECIMAL(38,6), itens_faturamento_liquido_desconhecido BIGINT, impostos_conhecido DECIMAL(38,6), itens_impostos_desconhecido BIGINT, margem_bruta_valor_conhecido DECIMAL(38,6), itens_margem_bruta_valor_desconhecido BIGINT, faturamento_contabil DECIMAL(38,6), faturamento_liquido DECIMAL(38,6), impostos DECIMAL(38,6), margem_bruta_valor DECIMAL(38,6), percentual_impostos DOUBLE, margem_bruta_percentual DOUBLE);
```
