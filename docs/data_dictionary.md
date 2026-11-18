# Dicionário de dados

## Contrato de origem

129 nomes originais preservados em `transacoes_origem`. O mapeamento é bijetivo e não modifica arquivos externos. Identificadores devem chegar como texto; a carga sintética usa strings e NULL. Colunas opcionais ausentes são adicionadas como NULL e continuam distintas.

| Nome original | Alias interno | Presença no contrato mínimo |
| --- | --- | --- |
| CONCATENADO | `concatenado` | Opcional |
| MONTH | `month` | Opcional |
| Filial | `filial` | Obrigatória (valor pode ser NULL auditável) |
| Mês/Ano | `mes_ano` | Opcional |
| Origem | `origem` | Obrigatória (valor pode ser NULL auditável) |
| Setor | `setor` | Opcional |
| Emissão | `emissao` | Obrigatória (valor pode ser NULL auditável) |
| Num. Docto. | `num_docto` | Obrigatória (valor pode ser NULL auditável) |
| Série | `serie` | Opcional |
| Cód. Cliente | `cod_cliente` | Obrigatória (valor pode ser NULL auditável) |
| Nome Cliente | `nome_cliente` | Opcional |
| CNPJ/CPF | `cnpj_cpf` | Obrigatória (valor pode ser NULL auditável) |
| Estado | `estado` | Opcional |
| Município | `municipio` | Opcional |
| Cód. Vend. | `cod_vend` | Opcional |
| Nome Vendedor | `nome_vendedor` | Opcional |
| TES | `tes` | Opcional |
| CFOP | `cfop` | Opcional |
| Item | `item` | Obrigatória (valor pode ser NULL auditável) |
| Cód. Prod. | `cod_prod` | Opcional |
| Desc. Produto | `desc_produto` | Opcional |
| Cod. Familia | `cod_familia` | Opcional |
| Desc. Familia | `desc_familia` | Opcional |
| Cód. Custo | `cod_custo` | Opcional |
| Desc. C Custo | `desc_c_custo` | Opcional |
| Grupo | `grupo` | Opcional |
| Tipo | `tipo` | Opcional |
| FAT - Quant. | `fat_quant` | Obrigatória (valor pode ser NULL auditável) |
| DEV - Quant. | `dev_quant` | Opcional |
| LIQ - Quant. | `liq_quant` | Opcional |
| Vlr. Produtos | `vlr_produtos` | Opcional |
| Vlr. Mercadoria (bruto) | `vlr_mercadoria_bruto` | Opcional |
| Desconto | `desconto` | Opcional |
| Cód. Condição | `cod_condicao` | Opcional |
| Desconto VD | `desconto_vd` | Opcional |
| Servicos VD | `servicos_vd` | Opcional |
| Valor Contábil | `valor_contabil` | Obrigatória (valor pode ser NULL auditável) |
| Vlr.IPI | `vlr_ipi` | Opcional |
| Vlr.ICMS | `vlr_icms` | Opcional |
| Vlr. ISS | `vlr_iss` | Opcional |
| PIS | `pis` | Opcional |
| COFINS | `cofins` | Opcional |
| ICMS DIFAL Origem | `icms_difal_origem` | Opcional |
| ICMS DIFAL Destino | `icms_difal_destino` | Opcional |
| ICMS Fundo de Pobreza | `icms_fundo_de_pobreza` | Opcional |
| Fat. Líquido | `fat_liquido` | Obrigatória (valor pode ser NULL auditável) |
| Custo Médio Total | `custo_medio_total` | Opcional |
| Custo Médio Unitário | `custo_medio_unitario` | Opcional |
| Origem Custo Médio | `origem_custo_medio` | Opcional |
| Margem Bruta (%) | `margem_bruta_percentual_origem` | Opcional |
| Margem Bruta (R$) | `margem_bruta_valor` | Obrigatória (valor pode ser NULL auditável) |
| Vendedor Ajustado | `vendedor_ajustado` | Opcional |
| Data Ajust. | `data_ajust` | Opcional |
| Valor Contábil Ajustado | `valor_contabil_ajustado` | Opcional |
| Fat. Líquido Ajustado | `fat_liquido_ajustado` | Opcional |
| Custo Total Ajustado | `custo_total_ajustado` | Opcional |
| Margem Bruta Ajustada | `margem_bruta_ajustada` | Opcional |
| Preço Médio | `preco_medio` | Opcional |
| Preço Serv. VD | `preco_serv_vd` | Opcional |
| Custo Médio | `custo_medio` | Opcional |
| Custo Serv. VD | `custo_serv_vd` | Opcional |
| CNPJ Aj. | `cnpj_aj` | Opcional |
| No. NF Aj. | `no_nf_aj` | Opcional |
| Cod. Prod. Aj. | `cod_prod_aj` | Opcional |
| NF + Prod. | `nf_prod` | Opcional |
| Roadmap | `roadmap` | Opcional |
| Linha (Família + BU) | `linha_familia_bu` | Opcional |
| Familia Ajustada | `familia_ajustada` | Opcional |
| BU Família | `bu_familia` | Opcional |
| BU Prod. | `bu_prod` | Opcional |
| BU Cliente | `bu_cliente` | Opcional |
| Business Unit | `business_unit` | Opcional |
| TOP 10 | `top_10` | Opcional |
| PRODUTOS | `produtos` | Opcional |
| Cliente REAL | `cliente_real` | Opcional |
| Forçar BU | `forcar_bu` | Opcional |
| CUT-OFF | `cut_off` | Opcional |
| DIA | `dia` | Opcional |
| Mês | `mes` | Opcional |
| Semana | `semana` | Opcional |
| Ano | `ano` | Opcional |
| Bu Centro de Custo | `bu_centro_de_custo` | Opcional |
| DIF Bus | `dif_bus` | Opcional |
| BU - Vendedor | `bu_vendedor` | Opcional |
| CODIGO/DESCRIÇÃO | `codigo_descricao` | Opcional |
| Dia Semana | `dia_semana` | Opcional |
| Trimestre | `trimestre` | Opcional |
| Semestre | `semestre` | Opcional |
| ML% | `ml_percentual` | Opcional |
| Tipo de Estoque | `tipo_de_estoque` | Opcional |
| FAT - Vend.Interno | `fat_vend_interno` | Opcional |
| FAT - Nome Vend.Int | `fat_nome_vend_int` | Opcional |
| TX Moeda | `tx_moeda` | Opcional |
| Empresa | `empresa` | Obrigatória (valor pode ser NULL auditável) |
| Moeda | `moeda` | Opcional |
| Conversao | `conversao` | Opcional |
| Vlr Negociado | `vlr_negociado` | Opcional |
| FAT - Estado-Ent | `fat_estado_ent` | Opcional |
| FAT - Município-Ent | `fat_municipio_ent` | Opcional |
| Campanha | `campanha` | Opcional |
| ProdutoCamp | `produtocamp` | Opcional |
| Classificação Ccusto | `classificacao_ccusto` | Opcional |
| Mês-Ano | `mes_ano_alternativo` | Opcional |
| ECOMERCE | `ecomerce_legado` | Opcional |
| Ajustar MB | `ajustar_mb` | Opcional |
| LIQ - Margem Bruta (R$)- Produtos MB <15% | `liq_margem_bruta_valor_produtos_mb_15_percentual` | Opcional |
| LIQ - Custo Medio Total- Produtos MB <15% | `liq_custo_medio_total_produtos_mb_15_percentual` | Opcional |
| MB% Produtos MB <15% | `mb_percentual_produtos_mb_15_percentual` | Opcional |
| LIQ - Custo Medio Total- Produtos MB >15% | `liq_custo_medio_total_produtos_mb_15_percentual_alternativo` | Opcional |
| LIQ - Custo Medio Total- Ajustado | `liq_custo_medio_total_ajustado` | Opcional |
| LIQ - Custo Medio Unit.- Ajustado | `liq_custo_medio_unit_ajustado` | Opcional |
| Custo Total- Ajustado | `custo_total_ajustado_alternativo` | Opcional |
| LIQ - MB (R$)- AJU | `liq_mb_valor_aju` | Opcional |
| Sistema Operacional | `sistema_operacional` | Opcional |
| Segmento do Produto | `segmento_do_produto` | Opcional |
| Canal de Venda | `canal_de_venda` | Opcional |
| Tipo de Venda | `tipo_de_venda` | Opcional |
| Mês/Ano c/ CUTOFF | `mes_ano_c_cutoff` | Opcional |
| Ano C/ CUTOFF | `ano_c_cutoff` | Opcional |
| Emissão c/ CUTOFF | `emissao_c_cutoff` | Opcional |
| Loja Virtual | `loja_virtual` | Opcional |
| Projetos | `projetos` | Opcional |
| Vendas em Dólar | `vendas_em_dolar` | Opcional |
| Subfamília | `subfamilia` | Opcional |
| Status | `status` | Obrigatória (valor pode ser NULL auditável) |
| RAIZ CNPJ | `raiz_cnpj_origem` | Obrigatória (valor pode ser NULL auditável) |
| E-COMERCE | `e_comerce` | Opcional |
| Cliente Novo | `cliente_novo` | Opcional |
| ODM | `odm` | Opcional |

## Linhagem principal

| Medida/atributo analítico | Origem/regra |
| --- | --- |
| faturamento_contabil | Valor Contábil |
| faturamento_liquido | Fat. Líquido |
| impostos | Contábil − líquido |
| margem_bruta_valor | Margem Bruta (R$), sem recálculo de custo |
| margem_bruta_percentual | 100 × margem / líquido, recálculo no agrupamento |
| percentual_impostos | 100 × impostos / contábil |
| vendedor | Nome Vendedor, sem substituição por vendedor ajustado |
| familia | Familia Ajustada, campo explicitamente identificado como família analítica |
| canal_venda | Canal de Venda |
| business_unit | Business Unit, sem inferir prioridade entre outras BUs |
| nome_cliente_representativo | Menor nome conhecido em ordem lexicográfica, rótulo técnico |
| raiz_cnpj | Consenso dos identificadores normalizados, sem CPF |
| identificador_documento | SHA-256 de Filial + Num. Docto. + Cód. Cliente + Empresa; NULL se incompleta |
| identificador_item | SHA-256 do fingerprint + posição da linha na carga |
| chave_item_candidata | SHA-256 de documento + Item, utilizada para auditoria |
| quantidade_devolvida | DEV - Quant. decimal; quantidade positiva exclui compra, sem remover financeiros |
| compra_valida | Critérios comerciais, DEV não positivo ou ausente + identidade/documento completos + período declarado |
| cliente_status_origem | Cliente Novo preservado, sem uso isolado para aquisição histórica |

## Modelos materializados

Datas de referência e de aquisição são DATE; `safra_aquisicao` usa YYYY-MM; `mes_referencia` e `mes_aquisicao` representam o primeiro dia do mês. Taxas usam a unidade percentual (0–100 quando aplicável). Medidas monetárias são decimais; percentuais não são somáveis. Lists VARCHAR[] preservam conjuntos de atribuição sem selecionar um responsável.

### dim_clientes

Uma linha por raiz CNPJ identificável no histórico considerado.

| Campo | Tipo DuckDB |
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

### fato_vendas

Uma linha por item de origem, incluindo inelegíveis e inconsistentes.

| Campo | Tipo DuckDB |
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

### fato_clientes_mensal

Uma linha por raiz e mês, inclusive meses sem movimento.

| Campo | Tipo DuckDB |
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

### fato_aquisicao

Uma linha por raiz adquirida; todos os documentos válidos da primeira data.

| Campo | Tipo DuckDB |
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

### fato_cohort

Uma linha por safra e mês relativo de acompanhamento (M0+).

| Campo | Tipo DuckDB |
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

### fato_transicoes

Uma linha por raiz e mês em que ocorreu mudança de status.

| Campo | Tipo DuckDB |
| --- | --- |
| raiz_cnpj | VARCHAR |
| mes_referencia | DATE |
| status_anterior | VARCHAR |
| status_atual | VARCHAR |
| tipo_transicao | VARCHAR |
| reativacao | BOOLEAN |
| retomada_em_risco | BOOLEAN |
| periodo_completo | BOOLEAN |

### compras_validas

Uma linha por raiz e documento válido distinto.

| Campo | Tipo DuckDB |
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

### reconciliacao_financeira

Um bucket de exclusão/participação por escopo financeiro.

| Campo | Tipo DuckDB |
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

### pipeline_metadata

Uma linha com a configuração do snapshot sintético.

| Campo | Tipo DuckDB |
| --- | --- |
| reference_date | DATE |
| history_start | DATE |
| synthetic | BOOLEAN |
| seed | BIGINT |
| acquisition_policy | VARCHAR |
| special_status_policy | VARCHAR |

### dq_summary

Uma linha por indicador de qualidade.

| Campo | Tipo DuckDB |
| --- | --- |
| metric | VARCHAR |
| value | VARCHAR |

### dq_issues

Uma linha por código de ocorrência e severidade.

| Campo | Tipo DuckDB |
| --- | --- |
| code | VARCHAR |
| severity | VARCHAR |
| occurrences | BIGINT |
| description | VARCHAR |

### dq_document_conflicts

Uma linha por chave documental com atributos de cabeçalho conflitantes.

| Campo | Tipo DuckDB |
| --- | --- |
| identificador_documento | VARCHAR |
| source_row_ids | UINTEGER[] |
| emission_dates | VARCHAR[] |
| customer_roots | VARCHAR[] |
| series | VARCHAR[] |
| conflicting_dates | BOOLEAN |
| conflicting_roots | BOOLEAN |
| conflicting_series | BOOLEAN |

### dq_status_distribution

Uma linha por escopo e classificação informada/calculada.

| Campo | Tipo DuckDB |
| --- | --- |
| scope | VARCHAR |
| status | VARCHAR |
| occurrences | BIGINT |

## Relacionamentos

`dim_clientes.raiz_cnpj` é a chave única do cliente. Fatos com raiz identificada relacionam-se a ela por raiz no escopo temporal do snapshot. Linhas financeiras sem identidade válida mantêm raiz NULL, sem dimensão de desconhecidos compartilhada. Linhas só futuras/fora do histórico podem existir na fato sem dimensão neste snapshot; consultas de financeiro usam LEFT JOIN. Aquisição é 1:0/1 com dimensão. Mensal é 1:N; transições são subconjunto dos meses; cohort agrega safras do mensal.

Campos auxiliares de completude, conjuntos de aquisição e contagens permitem distinguir zero conhecido, ausência de compra, informação faltante e período ainda incompleto.
