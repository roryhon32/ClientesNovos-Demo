"""Filtro de população por documentos válidos; cenários inteiramente gerados."""
from datetime import date, timedelta

import polars as pl
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from conftest import source_row
from customer_intelligence.api.config import APISettings
from customer_intelligence.api.dependencies import service
from customer_intelligence.api.main import create_app
from customer_intelligence.api.schemas import QueryFilters
from customer_intelligence.api.services import Services
from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.metrics import Filters
from customer_intelligence.pipeline import run_pipeline


COUNTS = {"00000001": 0, "00000002": 1, "00000003": 2,
          "00000004": 5, "00000005": 6}


def generated_rows():
    rows = []
    for root, count in COUNTS.items():
        for number in range(max(count, 1)):
            rows.append(source_row(root=root, document=f"{root}-{number}",
                emitted=date(2026, 1, 10) + timedelta(days=number),
                **{"Cód. Prod.": "SHARED", "Business Unit": f"BU {count}",
                   "Nome Vendedor": f"VENDEDOR {count}", "DEV - Quant.": "0",
                   "Status": "CANCELADO" if count == 0 else "FATURADO"}))
    # Mais itens e uma cópia literal da linha não aumentam a quantidade de notas.
    first = next(r for r in rows if r["RAIZ CNPJ"] == "00000002")
    rows.extend([dict(first, Item="2"), dict(first)])
    return rows


@pytest.fixture(scope="module")
def purchase_service():
    frame = pl.DataFrame(generated_rows()).cast(pl.String)
    with run_pipeline(SyntheticDataset(frame, label="synthetic-count-filter"),
                      Settings(reference_date=date(2026, 10, 22), fail_on_blocking_quality=False)) as result:
        # Duplicata intencional: registrada na qualidade, sem excluir financeiros.
        assert "duplicate_source_rows" in {issue.code for issue in result.quality.issues if issue.count}
        yield Services(result.connection)


@pytest.fixture
def purchase_client(purchase_service):
    app = create_app(APISettings(database_path="data/synthetic/unused-count-filter.duckdb"))
    app.dependency_overrides[service] = lambda: purchase_service
    # Sem lifespan: conexão gerada em memória, nunca banco externo.
    client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
    yield client
    client.close()


def data(client, path, **params):
    response = client.get(f"/api/v1/{path}", params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.parametrize("threshold", [0, 1, 5, 6])
def test_strict_threshold_counts_documents_and_all_customer_populations(purchase_client, purchase_service, threshold):
    expected = {root for root, count in COUNTS.items() if count > threshold}
    f = {"valid_purchases_gt": threshold}
    items = data(purchase_client, "customers", **f)["items"]
    assert {c["customer_id"] for c in items} == expected
    assert all(c["valid_purchases"] == COUNTS[c["customer_id"]] for c in items)
    assert data(purchase_client, "overview", **f)["acquired_customers"] == len(expected)
    assert sum(r["new_customers"] for r in data(purchase_client, "acquisition", **f)) == len(expected)
    retention = data(purchase_client, "retention", **f)
    assert all(w["eligible_customers"] == len(expected) for w in retention["windows"])
    assert sum(c["initial_customers"] for c in data(purchase_client, "cohorts", **f)) == len(expected)
    assert sum(s["customers"] for s in data(purchase_client, "lifecycle", **f)) == len(expected)
    # Transições usam a mesma seleção de clientes, preservando status histórico.
    actual = data(purchase_client, "lifecycle/transitions", **f)
    expected_transitions = purchase_service.repo.rows("""SELECT t.mes_referencia AS period,
        t.status_anterior AS previous_status,t.status_atual AS status,
        count(*) AS customers,bool_and(t.periodo_completo) AS mature
        FROM fato_transicoes t JOIN dim_clientes d USING(raiz_cnpj)
        WHERE coalesce(d.quantidade_compras_validas,0)>? GROUP BY ALL
        ORDER BY period,previous_status,status""", [threshold])
    assert actual == [{**row, "period": row["period"].isoformat()} for row in expected_transitions]


@pytest.mark.parametrize("threshold", [0, 1, 5, 6])
def test_financials_products_and_dependent_filters_use_same_population(purchase_client, purchase_service, threshold):
    expected = {root for root, count in COUNTS.items() if count > threshold}
    f = {"valid_purchases_gt": threshold}
    expected_finance = purchase_service.repo.rows("""SELECT sum(v.faturamento_contabil) AS accounting,
        sum(v.faturamento_liquido) AS net,sum(v.impostos) AS taxes,
        sum(v.margem_bruta_valor) AS margin FROM fato_vendas v JOIN dim_clientes d USING(raiz_cnpj)
        WHERE coalesce(d.quantidade_compras_validas,0)>?""", [threshold])[0]
    finance = data(purchase_client, "finance", **f)
    assert finance["clientes_identificados"] == len(expected)
    for field, alias in [("faturamento_contabil", "accounting"), ("faturamento_liquido", "net"),
                         ("impostos", "taxes"), ("margem_bruta_valor", "margin")]:
        assert finance[field] == expected_finance[alias]
    profits = data(purchase_client, "profitability", group_by="customer", **f)
    assert {p["dimension"] for p in profits} == expected
    sellers = data(purchase_client, "filters", dimension="seller", **f)["items"]
    assert {s["value"] for s in sellers} == {f"VENDEDOR {COUNTS[root]}" for root in expected}
    products = data(purchase_client, "products/repurchase", **f)["items"]
    assert [p["customers"] for p in products] == ([len(expected)] if expected else [])


def test_threshold_is_snapshot_total_even_in_single_day_product_filter(purchase_client):
    f = {"valid_purchases_gt": 5, "start_date": "2026-01-12", "end_date": "2026-01-12",
         "business_unit": "BU 6", "product": "SHARED", "family": "FAMILIA SINTETICA"}
    finance = data(purchase_client, "finance", **f)
    assert finance["clientes_identificados"] == finance["documentos_distintos"] == 1
    items = data(purchase_client, "customers/00000005/items", **f)["items"]
    assert len(items) == 1 and items[0]["faturamento_liquido"] == finance["faturamento_liquido"]
    behavior = data(purchase_client, "customers/00000005/behavior", **f)
    assert behavior["summary"]["valid_documents"] == 1
    assert behavior["first_products"][0]["date"] == "2026-01-10"
    assert data(purchase_client, "products/repurchase", **f)["items"][0]["customers"] == 1
    # Não satisfaz >5, embora a nota específica exista e seja válida.
    excluded = {"valid_purchases_gt": 5}
    assert data(purchase_client, "customers/00000004/items", **excluded)["items"] == []
    behavior = data(purchase_client, "customers/00000004/behavior", **excluded)
    assert behavior["summary"]["valid_documents"] == 0
    assert behavior["first_products"] == behavior["products"] == []


def test_missing_counts_are_zero_and_model_validation(pipeline_runner):
    s = Services(pipeline_runner([source_row()]).connection)
    s.repo.conn.execute("UPDATE dim_clientes SET quantidade_compras_validas=NULL")
    f = QueryFilters(valid_purchases_gt=0)
    assert s.repo.customer_page(f, 1, 25, "customer_id", "asc")["items"] == []
    assert s.a.financial_summary(f.analytical())["clientes_identificados"][0] == 0
    for model in (Filters, QueryFilters):
        for invalid in (-1, 1.5, 2147483648):
            with pytest.raises(ValidationError):
                model(valid_purchases_gt=invalid)


@pytest.mark.parametrize("invalid", ["-1", "1.5", "NaN", "true", "2147483648", "' OR 1=1 --"])
def test_threshold_http_validation(purchase_client, invalid):
    r = purchase_client.get("/api/v1/customers", params={"valid_purchases_gt": invalid})
    assert r.status_code == 422
