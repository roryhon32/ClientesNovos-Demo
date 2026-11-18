"""Cenários exclusivamente sintéticos para comportamento e fidelização."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
import polars as pl
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import source_row
from customer_intelligence.api.behavior import customer_behavior, product_repurchase, router
from customer_intelligence.api.dependencies import service
from customer_intelligence.api.main import create_app
from customer_intelligence.api.config import APISettings
from customer_intelligence.api.behavior_schemas import CustomerBehavior, ProductRepurchasePage
from customer_intelligence.api.schemas import QueryFilters, Result
from customer_intelligence.api.services import Services
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.config.settings import Settings


@pytest.fixture(scope="module")
def behavior_service():
    rows = [
        source_row(document="A", **{"Cód. Prod.": "P1", "Business Unit": "BU A"}),
        source_row(document="A", item="2", **{"Cód. Prod.": "P1", "Business Unit": "BU A"}),
        source_row(document="B", **{"Cód. Prod.": "P1", "Business Unit": "BU A"}),
        source_row(document="C", emitted=date(2026, 2, 10), **{"Cód. Prod.": "P2", "Business Unit": "BU B"}),
        source_row(document="D", emitted=date(2026, 3, 10), **{"Cód. Prod.": "P1", "Business Unit": "BU B"}),
        source_row(root="00000002", document="E", emitted=date(2026, 10, 20), **{"Cód. Prod.": "P1"}),
        source_row(document="RETURN", emitted=date(2026, 3, 11), **{"Cód. Prod.": "P1", "Status": "DEVOLVIDO", "FAT - Quant.": "-1", "LIQ - Quant.": "-1", "Valor Contábil": "-1000", "Fat. Líquido": "-850", "Margem Bruta (R$)": "-255"}),
        source_row(document="FUTURE", emitted=date(2027, 1, 1), **{"Cód. Prod.": "P3"}),
    ]
    with run_pipeline(SyntheticDataset(pl.DataFrame(rows).cast(pl.String)), Settings(reference_date=date(2026, 10, 22))) as result:
        yield Services(result.connection)


def test_distinct_documents_vs_distinct_days_and_financials(behavior_service):
    result = customer_behavior(behavior_service, QueryFilters(), "00000001")
    Result[CustomerBehavior].model_validate(result)
    data = result["data"]
    assert data["summary"]["valid_documents"] == 4
    assert data["summary"]["faturamento_liquido"] == Decimal("3400")
    assert data["summary"]["impostos"] == Decimal("600")
    assert data["summary"]["margem_bruta_valor"] == Decimal("1020")
    p1 = next(p for p in data["products"] if p["product_id"] == "P1")
    assert p1["documents"] == 3
    assert p1["occasions"] == 2
    assert p1["mean_days_between_purchases"] == 59
    assert p1["quantity"] == 4
    assert p1["repurchased"]
    assert data["summary"]["general_repurchase"]
    assert data["summary"]["same_bu_repurchase"]
    assert data["summary"]["same_product_repurchase"]
    assert data["first_products"][0]["documents"] == 2


def test_same_day_notes_not_product_repurchase(behavior_service):
    f = QueryFilters(start_date=date(2026, 1, 10), end_date=date(2026, 1, 10))
    data = customer_behavior(behavior_service, f, "00000001")["data"]
    assert data["summary"]["general_repurchase"]
    assert data["summary"]["same_bu_repurchase"]
    assert not data["summary"]["same_product_repurchase"]
    assert data["products"][0]["documents"] == 2
    assert data["products"][0]["occasions"] == 1
    assert data["products"][0]["mean_days_between_purchases"] is None


def test_ranking_unique_customers_and_maturity(behavior_service):
    result = product_repurchase(behavior_service, QueryFilters())
    Result[ProductRepurchasePage].model_validate(result)
    p1 = next(p for p in result["data"]["items"] if p["product_id"] == "P1")
    assert p1["customers"] == 2
    assert p1["repurchased_customers"] == 1
    assert p1["repurchase_rate_pct"] == 50
    assert p1["minimum_observation_days"] == 2
    matured = product_repurchase(behavior_service, QueryFilters(), min_observation_days=3)["data"]
    p1 = next(p for p in matured["items"] if p["product_id"] == "P1")
    assert p1["excluded_recent_customers"] == 1
    assert p1["eligible_customers"] == 1
    assert p1["repurchase_rate_pct"] == 100
    assert "P3" not in [p["product_id"] for p in matured["items"]]


def test_all_immature_null_rate(behavior_service):
    data = product_repurchase(behavior_service, QueryFilters(), min_observation_days=1000)["data"]
    assert all(p["eligible_customers"] == 0 and p["repurchase_rate_pct"] is None for p in data["items"])


def test_combined_filters_do_not_redefine_first_purchase(behavior_service):
    f = QueryFilters(start_date=date(2026, 3, 1), end_date=date(2026, 3, 31), business_unit="BU B", product="P1")
    d = customer_behavior(behavior_service, f, "00000001")["data"]
    assert d["summary"]["valid_documents"] == 1
    assert d["summary"]["faturamento_liquido"] == 850
    assert d["first_products"][0]["date"] == date(2026, 1, 10)
    assert d["first_products"][0]["business_units"] == ["BU A"]
    assert d["products"][0]["occasions"] == 1
    r = product_repurchase(behavior_service, f)["data"]["items"]
    assert len(r) == 1 and r[0]["repurchase_rate_pct"] == 0


def test_mix_equal_days_and_no_definitive_abandonment(behavior_service):
    f = QueryFilters(start_date=date(2026, 3, 1), end_date=date(2026, 3, 31))
    d = customer_behavior(behavior_service, f, "00000001")["data"]["mix"]
    assert d["previous_start"] == date(2026, 1, 29)
    assert d["previous_end"] == date(2026, 2, 28)
    assert d["not_observed_in_period"] == ["P2"]
    assert d["resumed_products"] == ["P1"]
    assert d["new_in_period"] == []
    assert d["current_top_product_share_pct"] == 100
    auto = customer_behavior(behavior_service, QueryFilters(), "00000001")["data"]["mix"]
    assert auto["current_start"] == date(2026, 9, 1)
    assert auto["current_end"] == date(2026, 9, 30)


def test_empty_search_and_injection(behavior_service):
    assert product_repurchase(behavior_service, QueryFilters(product="' OR 1=1 --"))["data"]["items"] == []
    assert product_repurchase(behavior_service, QueryFilters(), search="' OR 1=1 --")["data"]["items"] == []
    with pytest.raises(ValueError):
        product_repurchase(behavior_service, QueryFilters(), sort_by="product_id; DROP TABLE fato_vendas")
    d = customer_behavior(behavior_service, QueryFilters(business_unit="missing"), "00000001")["data"]
    Result[CustomerBehavior].model_validate({"meta": behavior_service.meta(QueryFilters(), "a", "b", "c"), "data": d})
    assert d["summary"]["valid_documents"] == 0
    assert d["summary"]["faturamento_liquido"] is None
    assert d["summary"]["predominant_business_units"] == []


def test_ties_first_day_and_null_finance(pipeline_runner):
    rows = [source_row(document="A", **{"Cód. Prod.": "P1", "Business Unit": "A"}),
            source_row(document="B", **{"Cód. Prod.": "P2", "Business Unit": "B"})]
    s = Services(pipeline_runner(rows).connection)
    d = customer_behavior(s, QueryFilters(), "00000001")["data"]
    assert d["summary"]["predominant_business_units"] == ["A", "B"]
    assert len(d["first_products"]) == 2
    assert len(d["top_products_quantity"]) == len(d["top_products_revenue"]) == 2
    assert d["summary"]["faturamento_liquido"] == 1700
    assert sum(b["net_share_pct"] for b in d["business_units"]) == 100
    # Null monetário é preservado em vez de transformar incompletude em zero.
    s.repo.conn.execute("UPDATE fato_vendas SET faturamento_liquido=NULL WHERE codigo_produto='P1'")
    d = customer_behavior(s, QueryFilters(), "00000001")["data"]
    assert d["summary"]["faturamento_liquido"] is None
    assert d["summary"]["impostos"] is None
    assert d["summary"]["predominant_business_units"] == []
    assert all(b["net_share_pct"] is None for b in d["business_units"])
    assert d["top_products_revenue"] == []


def test_document_components_avoid_collisions(pipeline_runner):
    rows = [source_row(), source_row(branch="0002"),
            source_row(**{"Empresa": "OUTRA"}), source_row(**{"Cód. Cliente": "OUTRO CODIGO"})]
    s = Services(pipeline_runner(rows).connection)
    d = customer_behavior(s, QueryFilters(), "00000001")["data"]
    assert d["summary"]["valid_documents"] == 4
    assert d["products"][0]["occasions"] == 1


def test_ranking_pagination_and_bounds(behavior_service):
    first = product_repurchase(behavior_service, QueryFilters(), page_size=1)["data"]
    second = product_repurchase(behavior_service, QueryFilters(), page=2, page_size=1)["data"]
    assert first["pagination"]["total_items"] == 2
    assert first["items"][0]["product_id"] != second["items"][0]["product_id"]
    assert len(product_repurchase(behavior_service, QueryFilters(), search="P2")["data"]["items"]) == 1


def test_routes_validation_and_serialization(behavior_service):
    app = FastAPI()
    app.state.settings = SimpleNamespace(data_mode="synthetic")
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[service] = lambda: behavior_service
    with TestClient(app) as client:
        r = client.get("/api/v1/customers/00000001/behavior")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["summary"]["faturamento_liquido"] == 3400
        assert client.get("/api/v1/customers/invalid/behavior").status_code == 422
        assert client.get("/api/v1/customers/99999999/behavior").status_code == 404
        for params in ({"page_size": 201}, {"page": 0}, {"sort_by": "DROP TABLE"},
                       {"min_observation_days": -1}, {"start_date": "2026-02-01", "end_date": "2026-01-01"}):
            assert client.get("/api/v1/products/repurchase", params=params).status_code == 422
        r = client.get("/api/v1/products/repurchase", params={"business_unit": "BU A", "product": "P1"})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["items"][0]["repurchased_customers"] == 0


def test_finance_endpoint_combines_family_product_bu_and_dates(behavior_service):
    app = create_app(APISettings(database_path="data/synthetic/unused-override.duckdb"))
    app.dependency_overrides[service] = lambda: behavior_service
    # Sem lifespan: conexão é fixture inteiramente sintética, nunca banco externo.
    client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
    try:
        r = client.get("/api/v1/finance", params={"start_date": "2026-03-01", "end_date": "2026-03-31",
                        "business_unit": "BU B", "family": "FAMILIA SINTETICA", "product": "P1"})
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["faturamento_contabil"] == 1000
        assert d["faturamento_liquido"] == d["ticket_medio_liquido"] == 850
        assert d["documentos_distintos"] == 1
        assert d["impostos"] == 150
        assert d["margem_bruta_valor"] == 255
        assert r.json()["meta"]["period_type"] == "transaction"
        assert client.get("/api/v1/finance", params={"family": "unknown", "product": "P1"}).json()["data"]["documentos_distintos"] == 0
    finally:
        client.close()


def test_large_nested_results_are_rejected_without_silent_truncation(behavior_service):
    restricted = Services(behavior_service.repo.conn, max_rows=1)
    with pytest.raises(ValueError, match="limite"):
        customer_behavior(restricted, QueryFilters(), "00000001")
    ranked = product_repurchase(restricted, QueryFilters(), page_size=50)["data"]
    assert ranked["pagination"]["page_size"] == 1
    assert len(ranked["items"]) == 1
    assert ranked["pagination"]["total_items"] == 2


def test_customer_items_apply_all_shared_filters_consistently(behavior_service):
    app = create_app(APISettings(database_path="data/synthetic/unused-override.duckdb"))
    app.dependency_overrides[service] = lambda: behavior_service
    client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
    dimension = behavior_service.repo.rows("SELECT status_atual,safra_aquisicao FROM dim_clientes WHERE raiz_cnpj='00000001'")[0]
    filters = {"start_date": "2026-03-01", "end_date": "2026-03-31",
               "business_unit": "BU B", "family": "FAMILIA SINTETICA", "product": "P1",
               "seller": "VENDEDOR SINTETICO A", "state": "SP", "city": "MUNICIPIO SINTETICO",
               "sales_channel": "DIRETO SINTETICO", "customer_status": dimension["status_atual"],
               "acquisition_cohort": dimension["safra_aquisicao"]}
    try:
        url = "/api/v1/customers/00000001/items"
        r = client.get(url, params=filters)
        assert r.status_code == 200, r.text
        assert r.json()["data"]["pagination"]["total_items"] == 1
        item = r.json()["data"]["items"][0]
        assert item["codigo_produto"] == "P1" and item["business_unit"] == "BU B"
        finance = client.get("/api/v1/finance", params=filters).json()["data"]
        assert item["faturamento_liquido"] == finance["faturamento_liquido"] == 850
        behavior = client.get("/api/v1/customers/00000001/behavior", params=filters).json()["data"]
        assert behavior["summary"]["faturamento_liquido"] == item["faturamento_liquido"]
        # Cada filtro altera realmente a consulta; nenhum parâmetro é ignorado.
        for key in ("seller", "state", "city", "sales_channel", "family", "product", "customer_status", "acquisition_cohort"):
            absent = "2026-02" if key == "acquisition_cohort" else "' OR 1=1 --"
            response = client.get(url, params={**filters, key: absent})
            assert response.status_code == 200, response.text
            assert response.json()["data"]["items"] == [], key
        assert client.get(url, params={"acquisition_cohort": "invalid"}).status_code == 422
    finally:
        client.close()


def test_pre_history_money_preserved_without_inventing_purchases(pipeline_runner):
    rows = [source_row(document="BEFORE", emitted=date(2019, 12, 31), **{"Cód. Prod.": "OLD"}),
            source_row(document="CURRENT", **{"Cód. Prod.": "CURRENT"})]
    s = Services(pipeline_runner(rows).connection)
    f = QueryFilters()
    data = customer_behavior(s, f, "00000001")["data"]
    finance = s.a.financial_summary(f.analytical()).to_dicts()[0]
    items = s.repo.customer_items("00000001", f, 1, 25)["items"]
    assert len(items) == 2
    for field in ("faturamento_contabil", "faturamento_liquido", "impostos", "margem_bruta_valor"):
        assert data["summary"][field] == finance[field] == sum(item[field] for item in items)
    assert data["summary"]["valid_documents"] == 1
    assert not data["summary"]["general_repurchase"]
    assert [p["product_id"] for p in data["first_products"]] == ["CURRENT"]
    old = next(p for p in data["products"] if p["product_id"] == "OLD")
    assert old["faturamento_liquido"] == 850
    assert old["documents"] == old["occasions"] == 0
