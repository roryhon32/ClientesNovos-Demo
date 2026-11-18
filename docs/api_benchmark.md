# Benchmark da API sintética

3 execuções por endpoint via TestClient local; mediana inclui conexão, consulta, validação e JSON.
Sem isolamento de carga, sem metas ou garantia de produção. Banco sintético de 100 clientes / 267 itens.

| Endpoint | Mediana (s) | Linhas superiores | Bytes JSON |
| --- | ---: | ---: | ---: |
| overview | 0.080538 | 1 | 1484 |
| acquisition | 0.085038 | 82 | 14062 |
| customers | 0.061659 | 25 | 15823 |
| retention | 0.062453 | 1 | 1051 |
| cohorts?max_months=3 | 0.065252 | 13 | 10193 |
| profitability | 0.044526 | 4 | 1742 |
| lifecycle | 0.042891 | 5 | 640 |
| filters | 0.041238 | 3 | 598 |

Reproduzir: `python scripts/benchmark_api.py --database data/synthetic/customer_intelligence.duckdb --repeats 3`.
A contagem de linhas considera o nível superior; cohorts contêm células de acompanhamento dentro de cada safra.
