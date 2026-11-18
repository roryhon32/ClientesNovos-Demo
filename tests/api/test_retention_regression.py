"""Retention regressions using generated data only, including a full 2020–2026 history."""
from datetime import date
from uuid import uuid4

import duckdb
from fastapi.testclient import TestClient
import polars as pl
import pytest

from conftest import source_row
from customer_intelligence.api.config import APISettings
from customer_intelligence.api.main import create_app
from customer_intelligence.api.schemas import QueryFilters
from customer_intelligence.api.services import Services
from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.pipeline import SYNTHETIC_ROOT, run_pipeline


@pytest.fixture(scope="module")
def retention_database():
    folder = SYNTHETIC_ROOT / ("retention-regression-" + uuid4().hex)
    folder.mkdir(parents=True)
    target = folder / "generated.duckdb"
    months = [date(year, month, 10) for year in range(2020, 2027)
              for month in range(1, 13) if (year, month) <= (2026, 10)]
    rows = [source_row(root=f"{index:08d}", emitted=month)
            for index, month in enumerate(months, start=1)]
    rows += [source_row(emitted=date(2020, 1, 10), item="2"),
             source_row(emitted=date(2020, 3, 10), document="SECOND")]
    try:
        with run_pipeline(SyntheticDataset(pl.DataFrame(rows).cast(pl.String)),
                          Settings(reference_date=date(2026, 10, 22)), target):
            pass
        yield target
    finally:
        for file in folder.iterdir():
            file.unlink()
        folder.rmdir()


def retention_client(database, max_rows=1000):
    return TestClient(create_app(APISettings(database_path=str(database), max_rows=max_rows)),
                      base_url="http://localhost", client=("127.0.0.1", 50000),
                      raise_server_exceptions=False)


@pytest.mark.parametrize("months", [None, 12, 24, 84])
def test_full_history_cohort_matrix_fits_default_row_limit(retention_database, months):
    with retention_client(retention_database) as client:
        response = client.get("/api/v1/cohorts", params={} if months is None else {"max_months": months})
    assert response.status_code == 200, response.text
    cohorts = response.json()["data"]
    assert len(cohorts) == 82
    assert [row["cohort"] for row in cohorts] == sorted(row["cohort"] for row in cohorts)
    assert all(len(row["periods"]) == (12 if months is None else months) + 1 for row in cohorts)
    oldest, newest = cohorts[0], cohorts[-1]
    assert oldest["initial_customers"] == newest["initial_customers"] == 1
    assert oldest["periods"][0]["retention_pct"] is None  # Acquisition is not retention.
    assert oldest["periods"][1]["retained_customers"] == 0
    assert oldest["periods"][2]["retained_customers"] == 1
    assert newest["periods"][0]["retained_customers"] is None
    assert newest["periods"][0]["mature"] is False
    assert newest["periods"][1]["retention_pct"] is None
    assert newest["periods"][1]["eligible_customers"] is None
    assert newest["periods"][1]["net_revenue"] is None


def test_cohort_limit_counts_returned_cohort_rows(retention_database):
    with retention_client(retention_database, max_rows=82) as client:
        assert client.get("/api/v1/cohorts", params={"max_months": 84}).status_code == 200
    with retention_client(retention_database, max_rows=81) as client:
        assert client.get("/api/v1/cohorts").status_code == 422


def test_repurchase_keeps_documents_and_maturity_semantics(retention_database):
    with retention_client(retention_database) as client:
        response = client.get("/api/v1/retention", params={"acquisition_cohort": "2020-01"})
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["mean_days_to_second_purchase"] == 60
    windows = {window["days"]: window for window in result["windows"]}
    assert windows[30]["repurchased_customers"] == 0  # Two items are one document.
    assert windows[60]["repurchased_customers"] == 1
    assert windows[60]["rate_pct"] == 100
    assert windows[60]["eligible_customers"] == 1


@pytest.mark.parametrize("endpoint", ["retention", "cohorts"])
def test_empty_retention_selection_is_valid(retention_database, endpoint):
    with retention_client(retention_database) as client:
        response = client.get(f"/api/v1/{endpoint}", params={"business_unit": "ABSENT_SYNTHETIC_BU"})
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    if endpoint == "cohorts":
        assert result == []
    else:
        assert all(window["eligible_customers"] == 0 and window["rate_pct"] is None
                   for window in result["windows"])


@pytest.mark.parametrize("endpoint", ["retention", "cohorts"])
@pytest.mark.parametrize("filter_name", ["product", "family"])
def test_unvalidated_product_acquisition_attribution_stays_rejected(retention_database, endpoint, filter_name):
    with retention_client(retention_database) as client:
        response = client.get(f"/api/v1/{endpoint}", params={filter_name: "SYNTHETIC_VALUE"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("count,allowed", [(125, True), (126, False)])
def test_matrix_cell_limit_is_independent_of_configured_row_limit(monkeypatch, count, allowed):
    # Generate aggregate rows to exercise the exact 10,000-cell boundary without
    # building years of irrelevant transactions or weakening the API row limit.
    rows = [{"safra_aquisicao": f"{2000 + i // 12:04d}-{1 + i % 12:02d}",
             "meses_desde_aquisicao": 0, "clientes_observados": 1,
             "clientes_elegiveis": 1, "clientes_retidos": None,
             "taxa_retencao": None, "clientes_adquiridos": 1,
             "periodo_completo": True, "faturamento_liquido_periodo": 850,
             "margem_bruta_valor_periodo": 255} for i in range(count)]
    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE pipeline_metadata AS SELECT DATE '2026-10-22' reference_date, DATE '2020-01-01' history_start")
        service = Services(conn, max_rows=10000)
        monkeypatch.setattr(service.a, "retention", lambda _: pl.DataFrame(rows))
        if allowed:
            data = service.cohorts(QueryFilters(), 79)["data"]
            assert sum(len(group["periods"]) for group in data) == 10000
        else:
            with pytest.raises(ValueError, match="Matriz excede o limite"):
                service.cohorts(QueryFilters(), 79)
