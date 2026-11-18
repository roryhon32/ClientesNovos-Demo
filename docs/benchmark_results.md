# Benchmark sintético

Referência: 2026-10-22; seed: 42. Python 3.13.14, Polars 1.43.0, DuckDB 1.5.5.

Execuções únicas, banco em memória, incluindo normalização, modelos e validação. Tempos observados neste ambiente; não constituem meta ou garantia de produção.

| Clientes gerados | Itens origem | Geração (s) | Pipeline (s) | Linhas cliente/mês |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 267 | 0.0133 | 0.9663 | 2197 |
| 1000 | 2592 | 0.1200 | 0.6142 | 22262 |
| 5000 | 12924 | 0.6380 | 1.4951 | 111062 |

Detalhamento de etapas: `data/synthetic/benchmark_results.json`.

Reproduzir: `python scripts/benchmark.py --sizes 100 1000 5000 --seed 42`.
