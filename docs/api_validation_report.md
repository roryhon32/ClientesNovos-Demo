# Relatório de validação — Fase 2

Referência do snapshot sintético: **2026-10-22**. A implementação utiliza o projeto
existente, sem alterar fórmulas, classificação, chave documental ou pipeline.
Nenhuma base corporativa, unidade de rede, API externa ou arquivo original de
faturamento foi acessado. Os únicos acessos HTTP executados foram internos ao
TestClient e a um servidor temporário em loopback. Nenhum frontend foi criado.

## Inspeção inicial

Foram lidos README, regras de negócio, arquitetura, notas de modelos, contratos
analíticos, assinaturas de Analytics/Filters e persistência do pipeline. Os schemas
reais das seis tabelas foram consultados **somente no DuckDB sintético autorizado**.
Confirmados metadados da referência 2026-10-22, origem sintética, aquisição por
primeira data agregada e política especial de status. Foram reutilizados os
métodos de aquisição, crescimento, retenção e financeiro da Fase 1; consultas
específicas de paginação/histórico usam as mesmas medidas financeiras centralizadas.
O adaptador de população reaproveita `_clients_cte` de Analytics em um único
ponto interno; uma alteração futura dessa interface deve manter seus testes de
compatibilidade. Não houve refatoração da camada analítica existente.

Dependências observadas: FastAPI 0.139.2, Uvicorn 0.40.0, HTTPX 0.28.1, além das
dependências já utilizadas na Fase 1. Nenhuma instalação ou conexão externa foi
necessária. Foram adicionados extras opcionais no pyproject e configuração de
exemplo, sem credenciais.

## Testes executados

Comando: `python -m pytest -p no:cacheprovider`.

**175 testes aprovados em 69,36 segundos; zero falhas.**

- **114 testes anteriores preservados** integralmente.
- **61 testes novos da API** em `tests/api/test_api.py`.
- Um aviso de depreciação do ambiente Starlette/TestClient sobre HTTPX; não houve
  falha de contrato, dependência ou execução. Migração futura do cliente de testes
  poderá ser avaliada quando o ambiente atualizar suas dependências.

| Área | Evidência |
| --- | --- |
| Contratos | Todos os endpoints, OpenAPI, datas ISO, contagens, paginação e schemas numéricos de moeda |
| Financeiro | Impostos por diferença, margem por razão de somas, valores preservados, ticket por documento, devolução mantida e divisor zero NULL |
| Escopos | Quatro recortes de receita distintos; compra posterior em outra BU não gera aquisição nem altera a primeira compra |
| Clientes | Matriz/filial agrupadas pela raiz, dois itens na mesma nota, segunda compra documental e pesquisa/paginação estáveis |
| Retenção | 30/60/90/180 dias, denominadores maduros, imaturos separados, apenas uma compra e reativação |
| Histórico/cohort | Status no fechamento correto, meses sem faturamento, M0 separado e células futuras NULL |
| Entradas | Datas invertidas/ilegíveis, dimensão/ordenação inválidas, limites e tentativa de SQL injection tratados sem vazamento |
| Segurança | Conexão read-only, escrita recusada, leitura externa pelo motor recusada, hash do arquivo inalterado |
| Disponibilidade | Banco ausente sem criação/fallback, conexão conflitante, falha após inicialização e erro de consulta retornam erro controlado |
| Recursos | Timeout real interrompe consulta pesada, conexão fecha e resposta 504 é sanitizada |
| Concorrência | Oito requisições em quatro threads retornam resultados idênticos, com conexões independentes |
| Acesso local | Cliente remoto recusado, CORS explícito, docs desabilitáveis e ponto de extensão para autorização |
| Precisão | Decimal com 18 casas inteiras e seis fracionárias preservado como número JSON; NaN/infinito retornam NULL |

Um teste inicial identificou que erro do validador de período na dependência
Pydantic era tratado como falha de saída (500). A dependência de filtros passou
a traduzir a validação de entrada para RequestValidationError, retornando 422
sanitizado. A suíte atual confirma a correção. Foram também separados os modelos
financeiros de aquisição dos contadores/tickets transacionais, para não apresentar
contagens não calculadas como zero, e explicitados quatro escopos de receita.

## Servidor e performance

Uvicorn foi iniciado temporariamente em **127.0.0.1:18080**, com factory,
`--no-proxy-headers` e processo sem janela. Health retornou healthy/connected/
synthetic/read_only e Swagger retornou HTTP 200. O processo foi encerrado ao fim
do teste; nenhum serviço ficou disponibilizado publicamente ou rodando em segundo
plano. O comando operacional sugerido usa 127.0.0.1:8000.

`scripts/benchmark_api.py` executou três amostras por endpoint no banco de
100 clientes/267 itens. Medianas observadas ficaram entre aproximadamente
**41 e 85 ms**, incluindo conexão, consulta, validação e serialização pelo
TestClient local. Os valores completos, bytes e contagens estão em
[api_benchmark.md](api_benchmark.md). Não há metas artificiais nem extrapolação
para produção. A amostra não demonstra escalabilidade para milhões de itens.

## Arquivos criados e modificados

Criados:

- `src/customer_intelligence/api/__init__.py`
- `src/customer_intelligence/api/config.py`
- `src/customer_intelligence/api/database.py`
- `src/customer_intelligence/api/dependencies.py`
- `src/customer_intelligence/api/schemas.py`
- `src/customer_intelligence/api/serialization.py`
- `src/customer_intelligence/api/repository.py`
- `src/customer_intelligence/api/services.py`
- `src/customer_intelligence/api/main.py`
- `tests/api/test_api.py`
- `scripts/benchmark_api.py`
- `docs/api_contract.md`
- `docs/api_validation_report.md`
- `docs/api_benchmark.md`

Modificados: `pyproject.toml` (extras API/testes), `.env.example` e `README.md`.
Os módulos, SQL, modelos e testes da Fase 1 não foram modificados nesta fase.

## Pendências e limites conhecidos

- Retenção após marcos de 90/180 dias continua pendente da definição da janela;
  recompra acumulada nesses prazos está implementada e exposta.
- Produto/família em população de aquisição/retenção não têm atribuição comercial
  definida; esses cruzamentos retornam 422. São suportados no recorte financeiro.
- Moeda da origem não foi validada; o contrato não presume BRL ou converte valores.
- Status histórico é consultável em fechamentos mensais materializados e na
  referência do snapshot; outra data requer definição/reprocessamento próprio.
- Autenticação/autorização corporativa precisa ser implementada antes de ampliar
  o ambiente. A configuração atual recusa produção e clientes remotos; não há
  autenticação fictícia.
- Serialização monetária preserva Decimal como token numérico exato, mas o
  consumidor JavaScript precisa cuidar de sua precisão ao analisar o JSON.
- Memory limit é do DuckDB, não de todo o processo. A expansão de cohorts é
  limitada por volume; consultas amplas podem exigir filtros mais restritos.
- Execução de escrita do pipeline e leitura da API não deve compartilhar o mesmo
  arquivo ao mesmo tempo. A API não repara nem recria snapshots automaticamente.
