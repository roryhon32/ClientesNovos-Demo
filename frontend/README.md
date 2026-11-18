# Customer Intelligence — interface local

React, TypeScript, TanStack Query e ECharts sobre a API FastAPI/DuckDB existente.
Mantém a identidade visual escura e utiliza somente o snapshot sintético autorizado.

## Iniciar

Na raiz do projeto, em um terminal PowerShell:

```powershell
$env:PYTHONPATH = 'src'
$env:CUSTOMER_API_DATABASE_PATH = 'data/synthetic/customer_intelligence.duckdb'
$env:CUSTOMER_API_DATA_MODE = 'synthetic'
$env:CUSTOMER_API_READ_ONLY = 'true'
$env:CUSTOMER_API_CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
python -m uvicorn customer_intelligence.api.main:create_app --factory --host 127.0.0.1 --port 8010 --no-proxy-headers
```

Em outro terminal, com as dependências já instaladas:

```powershell
cd frontend
$env:VITE_BACKEND_TARGET = 'http://127.0.0.1:8010'
npm run dev -- --configLoader native --host 127.0.0.1 --port 5173 --strictPort
```

Acesse **http://127.0.0.1:5173**. Para servir o build local, use
`npm run preview -- --configLoader native --host 127.0.0.1 --port 5173 --strictPort`
com a mesma variável do proxy.

## Páginas

- `/overview`: aquisição, indicadores, presença transacional por BU e clientes.
- `/acquisition`: entrada de clientes e primeiras compras, séries mensais e dimensões.
- `/customers`: Cliente REAL principal, Nome Cliente secundário, busca e ordenação,
  margens oficiais e dossiê com resumo histórico, itens e comportamento de compra.
- `/products`: recompra do mesmo produto em datas diferentes, ranking por clientes
  únicos, elegibilidade, busca, paginação e observação mínima opcional.
- `/retention`: janelas de recompra e matriz de safras, com base M0, meses abertos
  e futuros separados; retenção após 90/180 dias continua pendente de janela.
- `/profitability`: contábil, líquido, impostos e margem oficial por dimensão.
- `/lifecycle`: carteira no fechamento selecionado e transições do período.

Os filtros globais persistem na navegação e podem ser combinados nos gráficos,
removidos por nova seleção ou pelos chips. Produto/família, buscas, paginação,
ordenação e maturidade são exploração local. As tabelas possuem rolagem própria
com barras sincronizadas; gráficos têm alternativas de seleção por teclado.

## Verificação

```powershell
node node_modules/vitest/vitest.mjs run --configLoader native --pool threads --maxWorkers 1
npm run build -- --configLoader native
```

Veja [regras das métricas](../docs/behavior_metrics.md),
[escopos, arquivos e validação](../docs/customer_behavior_validation.md) e
[contrato da API](../docs/api_contract.md). Não houve importação de dados reais.
