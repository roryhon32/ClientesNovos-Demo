import json
import logging
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Iterator

import duckdb
import polars as pl

from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset, read_synthetic
from customer_intelligence.models import build_models
from customer_intelligence.sales import build_sales
from customer_intelligence.transformations.normalization import normalize
from customer_intelligence.transformations.valid_sales import valid_purchase_expression
from customer_intelligence.validation.quality_checks import QualityError, QualityReport, persist_quality, quality_report, reconcile_models

LOGGER = logging.getLogger("customer_intelligence")
# Artefatos pertencem ao diretório de execução, inclusive no pacote instalado.
SYNTHETIC_ROOT = Path.cwd().resolve() / "data" / "synthetic"


@dataclass
class PipelineResult:
    connection: duckdb.DuckDBPyConnection
    quality: QualityReport
    timings: dict[str, float]

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "PipelineResult":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


@contextmanager
def _timed(timings: dict[str, float], stage: str) -> Iterator[None]:
    started = perf_counter()
    yield
    timings[stage] = perf_counter() - started
    LOGGER.info(json.dumps({"event": "stage_complete", "stage": stage, "seconds": timings[stage]}))


def _database_target(database_path: str | Path) -> str:
    if str(database_path) == ":memory:":
        return ":memory:"
    target = Path(database_path).resolve()
    root = SYNTHETIC_ROOT.resolve()
    if not target.is_relative_to(root) or target.suffix != ".duckdb":
        raise ValueError(f"Banco deve estar sob {root} e ter extensão .duckdb")
    marker = target.with_suffix(".synthetic.toml")
    if not marker.resolve().is_relative_to(root):
        raise ValueError("Marcador sintético fora do workspace autorizado")
    if target.exists() and (not marker.exists() or marker.read_text(encoding="utf-8") != 'synthetic = true\n'):
        raise ValueError("Banco existente sem procedência sintética: acesso recusado")
    target.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text('synthetic = true\n', encoding="utf-8")
    return str(target)


def run_pipeline(dataset: SyntheticDataset, settings: Settings, database_path: str | Path = ":memory:") -> PipelineResult:
    timings: dict[str, float] = {}
    with _timed(timings, "ingestion_normalization"):
        source = read_synthetic(dataset)
        normalized = normalize(source).with_columns(valid_purchase_expression(settings.reference_date).alias("criterio_compra_valida"))
    conn = duckdb.connect(_database_target(database_path))
    try:
        conn.execute("BEGIN TRANSACTION")
        with _timed(timings, "staging_sales"):
            raw = source.with_columns(pl.struct(pl.all()).struct.json_encode().alias("_source_payload")).with_row_index("_source_row")
            conn.register("_source", raw.to_arrow())
            conn.register("_normalized", normalized.to_arrow())
            conn.execute("CREATE OR REPLACE TABLE transacoes_origem AS SELECT * EXCLUDE(_source_row, _source_payload) FROM _source")
            conn.execute("CREATE OR REPLACE TABLE stg_transacoes AS SELECT n.*, sha256(r._source_payload) AS source_fingerprint FROM _normalized n JOIN _source r ON n.source_row_id=r._source_row")
            conn.execute("CREATE OR REPLACE TABLE pipeline_metadata (reference_date DATE, history_start DATE, synthetic BOOLEAN, seed BIGINT, acquisition_policy VARCHAR, special_status_policy VARCHAR)")
            conn.execute("INSERT INTO pipeline_metadata VALUES (?, ?, true, ?, ?, ?)", [settings.reference_date, settings.history_start, dataset.seed, settings.acquisition_policy, settings.special_status_policy])
            build_sales(conn, settings)
        with _timed(timings, "quality"):
            report = quality_report(conn)
            if settings.fail_on_blocking_quality and not report.passed:
                raise QualityError(report)
        with _timed(timings, "dimensional_models"):
            build_models(conn, settings)
        with _timed(timings, "reconciliation"):
            reconcile_models(conn)
            persist_quality(conn, report)
        conn.execute("COMMIT")
        conn.unregister("_source")
        conn.unregister("_normalized")
        return PipelineResult(conn, report, timings)
    except Exception:
        conn.execute("ROLLBACK")
        conn.close()
        raise
