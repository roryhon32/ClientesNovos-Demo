# Customer Intelligence — Engenharia de dados e API analítica

Camada de engenharia e análise B2B em Python 3.12+, Polars e DuckDB, API FastAPI e interface React local. As validações utilizam dados inteiramente sintéticos de 2020–2026.

As melhorias de comportamento de compra, ranking de produtos, filtros
compartilhados e UX estão descritas no [relatório de implementação](docs/customer_behavior_validation.md)
e nas [definições das métricas](docs/behavior_metrics.md).

## Executar

As dependências são declaradas no `pyproject.toml`. Com uv disponível:

```powershell
uv sync --extra dev
uv run pytest
uv run python scripts/run_synthetic_pipeline.py --customers 100 --reference-date 2026-10-22 --persist
```

Neste ambiente, uv não está instalado e as dependências Python já estão disponíveis. A execução local dispensa instalação e acesso à rede:

```powershell
$env:PYTHONPATH = 'src'
python -m pytest
python scripts/run_synthetic_pipeline.py --customers 100 --reference-date 2026-10-22 --persist
python scripts/benchmark.py --sizes 100 1000 5000 --seed 42
```

Alternativamente, instale o pacote com `python -m pip install -e ".[dev]"`. O pacote inclui os templates SQL. O comando pode obter dependências se elas ainda não estiverem instaladas.

`--persist` grava somente `data/synthetic/customer_intelligence.duckdb`. Sem essa opção, usa banco em memória. A execução substitui atomicamente as tabelas; falha de qualidade reverte a transação. O programa recusa banco fora da pasta sintética ou banco existente sem marcador de procedência criado pelo próprio pipeline. Nenhum comando aceita caminho para base de entrada.

## Consultar

A consulta em Python abaixo continua disponível. Para HTTP, consulte a seção da API ao final.

```python
from datetime import date
from customer_intelligence.config.settings import Settings
from customer_intelligence.synthetic import synthetic_dataset
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.metrics import Analytics, Filters

with run_pipeline(synthetic_dataset(seed=42), Settings(reference_date=date(2026, 10, 22))) as result:
    analytics = Analytics(result.connection)
    receita = analytics.financial_summary(
        Filters(year=2026, business_unit="BU SINTETICA A"),
        group_by=("mes_referencia", "business_unit"),
    )
    aquisicao = analytics.acquisition()
    cohort = analytics.retention()
    qualidade = analytics.acquisition_quality()
```

Os filtros de financeiro selecionam transações; os de aquisição, recompra e cohort selecionam a população pela data/atributos de aquisição. Valores usam parâmetros SQL e dimensões passam por lista permitida. A futura API poderá devolver somente essas agregações.

## Regras centrais

- Impostos = Valor Contábil − Fat. Líquido.
- Margem Bruta (R$) vem diretamente da origem; MB% = soma da margem / soma do líquido × 100.
- Percentuais são recalculados no agrupamento; divisor zero ou nulo retorna NULL.
- Ausência monetária não vira zero: um agrupamento incompleto retorna NULL na medida afetada.
- Raiz CNPJ identifica a matriz e as filiais. CNPJ/CPF, CNPJ ajustado e raiz são confrontados; inconsistências permanecem auditáveis.
- Compra/recompra conta documentos distintos; os itens permanecem no fato financeiro, incluindo devoluções.
- Status histórico considera somente compras até o fechamento do mês, ou a data de referência no mês aberto.
- Aquisição soma todas as notas válidas da primeira data. Atribuições múltiplas são conjuntos; nenhum vendedor/BU é escolhido arbitrariamente.
- SEM CLASSIFICAÇÃO é preservado sem compra válida quando for o único status de origem informado.
- Janelas imaturas ficam explicitamente incompletas. Retenção mensal e recompra acumulada têm denominadores separados.

## Entregas e limites

As seis estruturas principais são `dim_clientes`, `fato_vendas`, `fato_clientes_mensal`, `fato_aquisicao`, `fato_cohort` e `fato_transicoes`. Origem, staging, compras documentais, metadados e auditoria complementam os modelos.

A chave documental oficial é exclusivamente **Filial + Num. Docto. + Cód. Cliente + Empresa**, conforme confirmação do responsável. Série, emissão, item e NF + Prod. não participam da identidade da nota. A aquisição significa primeira compra observada desde o início do histórico disponível. Retenção após 90/180 dias permanece pendente da definição da janela, conforme solicitado; recompra em 30/60/90/180 dias está implementada. Não há score com pesos arbitrários.

Consulte [arquitetura](docs/architecture.md), [dicionário](docs/data_dictionary.md), [regras](docs/business_rules.md), [consultas](docs/analytics_notes.md), [validação](docs/validation_report.md) e [benchmarks](docs/benchmark_results.md).

## API local — Fase 2

Dependências opcionais: `python -m pip install -e ".[api,dev]"`, ou `uv sync --extra api --extra dev` quando uv estiver disponível. Neste ambiente FastAPI, Uvicorn e HTTPX já estão instalados; nenhuma instalação ou conexão externa foi necessária.

Execute na raiz do projeto, após gerar explicitamente o banco sintético pelo comando da Fase 1:

```powershell
$env:PYTHONPATH = 'src'
$env:CUSTOMER_API_DATABASE_PATH = 'data/synthetic/customer_intelligence.duckdb'
$env:CUSTOMER_API_DATA_MODE = 'synthetic'
$env:CUSTOMER_API_READ_ONLY = 'true'
python -m uvicorn customer_intelligence.api.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Swagger: **http://127.0.0.1:8000/docs**. OpenAPI: `/openapi.json`. Health/prontidão: `/api/v1/health` e `/api/v1/ready`.

O caminho é obrigatório, limitado à pasta sintética autorizada e verificado antes da conexão. A API não cria banco nem executa o pipeline. Banco ausente, marcador inválido, snapshot reprovado ou modelos ausentes impedem a inicialização. Cada requisição recebe conexão DuckDB somente leitura, fechada antes do envio da resposta. A API recusa clientes remotos e modos de produção; mantenha o bind local e desabilite proxy headers, sem proxy público ou túnel.

CORS fica desabilitado por padrão. Para uma origem local autorizada, defina explicitamente `CUSTOMER_API_CORS_ORIGINS=http://localhost:5173`. Configurações e limites estão em `.env.example`; o arquivo não é carregado automaticamente.

```powershell
python -m pytest -p no:cacheprovider
python scripts/benchmark_api.py --database data/synthetic/customer_intelligence.duckdb --repeats 3
```

Consulte o [contrato da API](docs/api_contract.md), o [relatório de validação](docs/api_validation_report.md) e as [medições](docs/api_benchmark.md). A moeda ainda não está validada e a retenção após 90/180 dias permanece pendente; a recompra acumulada nessas janelas está disponível. Autenticação corporativa será necessária antes de qualquer futura ampliação do ambiente sintético local.

## Frontend Premium — Fase 3

Interface analítica SaaS construída em **React 19, TypeScript, Vite, Tailwind CSS, GSAP, Apache ECharts, Lucide React e TanStack Query**, seguindo a identidade visual premium escura com toques neon verde-água (`#19D3CB`), ciano (`#37BBD1`), verde favorável (`#3CE5A6`) e coral desfavorável (`#FF6478`).

### Inicialização local integrada

**Terminal 1 — API Backend (FastAPI + DuckDB):**

```powershell
$env:PYTHONPATH = 'src'
$env:CUSTOMER_API_DATABASE_PATH = 'data/synthetic/customer_intelligence.duckdb'
$env:CUSTOMER_API_DATA_MODE = 'synthetic'
$env:CUSTOMER_API_READ_ONLY = 'true'
$env:CUSTOMER_API_CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
python -m uvicorn customer_intelligence.api.main:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers
```

**Terminal 2 — Frontend (Vite):**

```powershell
cd frontend
npm install
npm run dev
```

Acesse no navegador: **http://127.0.0.1:5173** (com proxy transparente para a API em `/api/v1`).

### Testes e Build do Frontend

```powershell
cd frontend
npm test          # Executa a suíte de testes Vitest
npm run build     # Compila a versão de produção (TypeScript + Vite)
```

### Páginas implementadas

- `/overview` — **Visão Geral**: 4 KPIs analíticos, evolução de novos clientes, distribuição por BU, principais novos clientes e destaque contextual do período.
- `/acquisition` — **Novos Clientes**: Séries temporais mensais, alternador de métricas (clientes, receita e margem da 1ª compra) e distribuição por BU e vendedor.
- `/customers` — **Clientes**: Busca por Nome Cliente, Cliente REAL ou raiz, margens em reais e percentuais com ordenação separada, paginação e dossiê com nomes preservados, histórico e aba de produtos/notas (quantidades, BU, vendedor, canal, valores, pesquisa e período de emissão).
- `/retention` — **Retenção e Cohort**: Matriz de safras em heatmap ECharts (M0 a M+12) respeitando maturação, cartões de janelas de recompra (30d, 60d, 90d, 180d) e métricas de tempo até recompra.
- `/profitability` — **Rentabilidade**: Decomposição oficial de faturamento líquido, contábil, impostos e margem bruta (R$ e MB%), com alternador de dimensões (BU, vendedor, canal, estado, família, cliente).
- `/lifecycle` — **Ciclo de Vida**: Fotografia cadastral dos status (NOVO, RECORRENTE, EM RISCO, INATIVO, SEM FATURAMENTO, SEM CLASSIFICAÇÃO) e gráfico de transições históricas entre fechamentos mensais.

### Correções de retenção e exploração de clientes

A matriz separa base de aquisição, meses abertos e futuros, com tabela acessível de apoio. Falhas na matriz e nos indicadores de recompra são tratadas separadamente. O backend aceita histórico de 82 safras até M+84 dentro dos limites documentados. Veja [o relatório das melhorias](docs/customer_exploration_validation.md).

Após atualizar o código, reinicie a API para disponibilizar o endpoint de itens e a nova ordenação; atualize também a página no navegador. O Excel corporativo teve somente o cabeçalho conferido sob autorização: não houve importação de linhas de faturamento.

