"""Create a demonstrably generated source; no corporate input is accepted."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from customer_intelligence.synthetic import synthetic_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--customers", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--reference-date", type=date.fromisoformat, default=date(2026, 10, 22))
    parser.add_argument("--filename", default="source_generated.parquet")
    args = parser.parse_args()
    if Path(args.filename).name != args.filename or not args.filename.endswith(".parquet"):
        parser.error("filename must be a simple .parquet filename")
    output_dir = Path(__file__).resolve().parents[1] / "data" / "synthetic"
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset = synthetic_dataset(args.seed, args.customers, args.reference_date)
    output = output_dir / args.filename
    dataset.frame.write_parquet(output)
    print(f"Generated {dataset.frame.height} synthetic items: {output}")


if __name__ == "__main__":
    main()
