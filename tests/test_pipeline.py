from datetime import date
from pathlib import Path
from uuid import uuid4

import duckdb
import polars as pl
import pytest

from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.pipeline import SYNTHETIC_ROOT, run_pipeline
from customer_intelligence.validation.quality_checks import QualityError

from conftest import source_row


def test_rerun_is_idempotent_and_failed_quality_rolls_back_generated_database():
    settings = Settings(reference_date=date(2026, 10, 22), acquisition_policy="first_day_bundle", special_status_policy="preserve_without_purchase")
    dataset = SyntheticDataset(pl.DataFrame([source_row(), source_row(item="2")]))
    SYNTHETIC_ROOT.mkdir(parents=True, exist_ok=True)
    # Ordinary mkdir inherits the workspace ACL on Windows restricted hosts.
    directory = SYNTHETIC_ROOT / f"pytest-generated-{uuid4().hex}"
    directory.mkdir()
    target = directory / "generated.duckdb"
    try:
        for _ in range(2):
            with run_pipeline(dataset, settings, target) as result:
                assert result.connection.execute("SELECT COUNT(*) FROM fato_vendas").fetchone()[0] == 2
                assert result.connection.execute("SELECT quantidade_compras_validas FROM dim_clientes").fetchone()[0] == 1
        invalid = SyntheticDataset(pl.DataFrame([source_row(), source_row()]))
        with pytest.raises(QualityError):
            run_pipeline(invalid, settings, target)
        with duckdb.connect(str(target), read_only=True) as connection:
            assert connection.execute("SELECT COUNT(*) FROM fato_vendas").fetchone()[0] == 2
            assert connection.execute("SELECT COUNT(DISTINCT source_fingerprint) FROM fato_vendas").fetchone()[0] == 2
    finally:
        assert directory.resolve().is_relative_to(SYNTHETIC_ROOT.resolve())
        for generated in (target, target.with_suffix(".synthetic.toml"), Path(str(target) + ".wal")):
            generated.unlink(missing_ok=True)
        directory.rmdir()
