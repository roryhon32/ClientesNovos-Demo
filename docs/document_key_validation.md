# Validação da chave documental oficial

Chave confirmada: **Filial + Num. Docto. + Cód. Cliente + Empresa**.
O hash serializa somente esses quatro campos normalizados. A configuração rejeita
qualquer composição alternativa. Série, emissão, Item e NF + Prod. não entram
na identidade documental. A raiz CNPJ continua identificando o cliente.

## Execução e resultado

Na atualização de comportamento de compra, a suíte completa passou com 219
testes Python e 88 testes de interface. A auditoria do snapshot exclusivamente
sintético encontrou zero conflitos documentais. Os novos endpoints preservam
a mesma composição de quatro campos; a regra específica de recompra de produto
exige datas distintas sem incluir emissão na chave. Veja o
[relatório atualizado](customer_behavior_validation.md).

`python -m pytest -p no:cacheprovider`: **114 testes aprovados em 62,85 segundos**.
Somente dados sintéticos foram utilizados. O caminho corporativo fornecido não
foi acessado e nenhum arquivo original de faturamento foi modificado.

A execução completa com 100 clientes, seed 42 e referência 2026-10-22 gerou
267 itens, passou no gate de qualidade e apresentou **zero documentos ambíguos**.
O banco exclusivamente sintético foi atualizado em
`data/synthetic/customer_intelligence.duckdb`; veja [synthetic_run.md](synthetic_run.md).

Os testes confirmam que alterar cada um dos quatro componentes distingue notas;
alterar emissão ou série em execuções separadas não altera o identificador;
itens/produtos diferentes continuam na mesma nota. Três itens em duas notas
preservaram contábil 3.000, líquido 2.550, impostos 450 e margem 765, com ticket
contábil 1.500 e líquido 1.275. Primeira e segunda compra usam documentos
distintos e as respectivas datas normalizadas. A suíte inclui também aquisição,
recompra, cohort, retenção, maturidade, reconciliação por linha e por grupo.

Conflitos sintéticos de data, raiz, série e data conhecida misturada com data
inválida foram detectados. Cada cenário manteve uma única chave, ambas as linhas,
contábil 2.000, líquido 1.700, impostos 300 e margem 510. O gate bloqueou cada
caso, sem escolher ou corrigir valores. Os detalhes são acessíveis em
`QualityError.report.document_conflicts` após rollback e em
`dq_document_conflicts` no modo explícito de inspeção, cujo snapshot permanece
reprovado. As listas registram linhas de origem, datas, raízes e séries.
Série divergente é auditada como incompatibilidade de cabeçalho; diferenças de
BU, produto, vendedor ou família por item não são tratadas como colisão.

## Arquivos alterados

- `src/customer_intelligence/config/settings.py`: composição oficial fixa e validação.
- `src/customer_intelligence/sales.py`: hash exclusivo dos quatro componentes; preservação dos itens.
- `src/customer_intelligence/schemas/source_schema.py`: Série deixa de ser obrigatória na entrada mínima.
- `src/customer_intelligence/validation/quality_checks.py`: conflitos detalhados e relatório serializável, preservado no erro.
- `tests/test_acquisition.py`: rejeição de extensão da chave por Item.
- `tests/test_document_key.py`: dez cenários novos de identidade, ticket, datas, conflitos e preservação financeira.
- `scripts/generate_data_dictionary.py`: linhagem oficial e tabela de conflitos.
- `README.md`, `docs/architecture.md`, `docs/business_rules.md`, `docs/model_notes.md`, `docs/model_contract.md`, `docs/data_dictionary.md`: contrato e regras atualizados.
- `docs/validation_report.md`, `docs/synthetic_run.md`, `docs/document_key_validation.md`: resultados e evidências da atualização.
- Artefatos sintéticos atualizados: banco DuckDB e `dist/customer_intelligence-0.1.0-py3-none-any.whl`.

Os módulos de aquisição, recompra, cohort, retenção e ticket já consomem o
identificador documental centralizado; passaram a utilizar a nova composição
sem implementar chaves paralelas. A consistência foi comprovada nos cenários
sintéticos válidos; cenários inconsistentes foram corretamente reprovados.
