"""Measure the full in-memory synthetic pipeline at configurable dataset sizes."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import platform
from time import perf_counter

import duckdb
import polars as pl

from customer_intelligence.config.settings import Settings
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.synthetic import synthetic_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", type=int, nargs="+", default=[100, 1000, 5000])
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    reference = date(2026, 10, 22)
    records = []
    for size in args.sizes:
        started = perf_counter()
        dataset = synthetic_dataset(args.seed, size, reference)
        generated = perf_counter() - started
        started = perf_counter()
        result = run_pipeline(dataset, Settings(
            reference_date=reference, acquisition_policy="first_day_bundle",
            special_status_policy="preserve_without_purchase",
        ))
        elapsed = perf_counter() - started
        counts = {
            name: result.connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            for name in (
                "dim_clientes", "fato_vendas", "fato_aquisicao",
                "fato_clientes_mensal", "fato_cohort", "fato_transicoes",
            )
        }
        records.append({
            "customers_requested": size, "source_items": dataset.frame.height,
            "generation_seconds": generated, "pipeline_seconds": elapsed,
            "stages_seconds": result.timings, "table_rows": counts,
        })
        result.connection.close()
        print(f"customers={size} items={dataset.frame.height} pipeline_seconds={elapsed:.4f}")
    root = Path(__file__).resolve().parents[1]
    output_dir = root / "data" / "synthetic"
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "dataset": "entirely generated; no real input", "seed": args.seed,
        "reference_date": reference.isoformat(), "python": platform.python_version(),
        "platform": platform.platform(), "polars": pl.__version__,
        "duckdb": duckdb.__version__, "runs": records,
    }
    (output_dir / "benchmark_results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = [
        "# Benchmark sintético", "",
        f"Referência: {reference}; seed: {args.seed}. Python {platform.python_version()}, "
        f"Polars {pl.__version__}, DuckDB {duckdb.__version__}.", "",
        "Execuções únicas, banco em memória, incluindo normalização, modelos e validação. "
        "Tempos observados neste ambiente; não constituem meta ou garantia de produção.", "",
        "| Clientes gerados | Itens origem | Geração (s) | Pipeline (s) | Linhas cliente/mês |",
        "| ---: | ---: | ---: | ---: | ---: |",
    ]
    for record in records:
        lines.append(
            f"| {record['customers_requested']} | {record['source_items']} | "
            f"{record['generation_seconds']:.4f} | {record['pipeline_seconds']:.4f} | "
            f"{record['table_rows']['fato_clientes_mensal']} |"
        )
    lines += ["", "Detalhamento de etapas: `data/synthetic/benchmark_results.json`.", "",
              "Reproduzir: `python scripts/benchmark.py --sizes 100 1000 5000 --seed 42`.", ""]
    docs = root / "docs"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "benchmark_results.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
