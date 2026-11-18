from datetime import date
from decimal import Decimal

import pytest

from conftest import source_row
from customer_intelligence.api.behavior import customer_behavior, product_repurchase
from customer_intelligence.api.repository import Repository
from customer_intelligence.api.schemas import QueryFilters
from customer_intelligence.api.services import Services
from customer_intelligence.metrics import Analytics, Filters


def company_rows():
    def row(root, emitted, document, company="COMPANY A", item="1", **changes):
        values = {"Empresa": company, "Valor Contábil": "100", "Fat. Líquido": "80",
                  "Margem Bruta (R$)": "20", "Cód. Prod.": "PROD-SYN", **changes}
        return source_row(root=root, emitted=emitted, document=document, item=item, **values)
    return [
        row("00000001", date(2024, 1, 1), "OLD"),
        row("00000001", date(2026, 10, 1), "OLD-REPEAT"),
        row("00000002", date(2026, 9, 30), "OTHER-FIRST"),
        row("00000002", date(2026, 10, 1), "OTHER-COMPANY", "COMPANY B"),
        row("00000003", date(2026, 10, 1), "NEW-MULTI"),
        row("00000003", date(2026, 10, 1), "NEW-MULTI", item="2"),
        row("00000004", date(2026, 10, 22), "NEW-END", "COMPANY B"),
        row("00000005", date(2026, 10, 20), "BUNDLE-A"),
        row("00000005", date(2026, 10, 20), "BUNDLE-B", "COMPANY B", **{"Fat. Líquido": "500"}),
        row("00000006", date(2026, 10, 23), "FUTURE"),
        row("00000007", date(2026, 10, 20), "CANCELLED", Status="CANCELADO"),
        row("00000008", date(2026, 10, 10), "RETURN", "COMPANY B", **{"DEV - Quant.": "1"}),
    ]


@pytest.fixture
def company_service(pipeline_runner):
    result = pipeline_runner(company_rows())
    return Services(result.connection)


def october(company=None, **changes):
    return QueryFilters(start_date=date(2026, 10, 1), end_date=date(2026, 10, 22), company=company, **changes)


@pytest.mark.parametrize("company,expected", [(None, 3), ("COMPANY A", 2), ("COMPANY B", 2), ("ABSENT", 0)])
def test_new_customers_are_first_purchases_in_inclusive_period(company_service, company, expected):
    filters = october(company)
    overview = company_service.overview(filters)["data"]
    points = company_service.acquisition(filters)["data"]
    assert overview["acquired_customers"] == expected
    assert sum(point["new_customers"] for point in points) == expected


def test_current_classification_does_not_define_new_customer_count(company_service):
    # Simula rótulos atuais inconsistentes sem alterar as datas históricas.
    company_service.repo.conn.execute("UPDATE dim_clientes SET status_atual='INATIVO'")
    assert company_service.overview(october())["data"]["acquired_customers"] == 3
    assert company_service.overview(october("COMPANY A"))["data"]["acquired_customers"] == 2


def test_later_company_purchase_does_not_reacquire_existing_customer(company_service):
    cte, params = company_service.repo.population(october("COMPANY B"), acquired=True)
    rows = company_service.repo.rows(f"WITH {cte} SELECT raiz_cnpj FROM selected_clients ORDER BY raiz_cnpj", params)
    assert [row["raiz_cnpj"] for row in rows] == ["00000004", "00000005"]


@pytest.mark.parametrize("company", ["COMPANY A", "COMPANY B"])
def test_company_finance_and_items_reconcile_to_source(company_service, company):
    filters = october(company)
    expected = sum(Decimal(row["Fat. Líquido"]) for row in company_rows()
                   if row["Empresa"] == company and "2026-10-01" <= row["Emissão"] <= "2026-10-22")
    finance = company_service.a.financial_summary(filters.analytical()).to_dicts()[0]
    grouped = company_service.repo.profitability(filters, "business_unit", 100)
    assert finance["faturamento_liquido"] == expected
    assert sum(row["faturamento_liquido"] for row in grouped) == expected
    items = company_service.repo.customer_items("00000005", filters, 1, 25)["items"]
    assert len(items) == 1
    assert items[0]["company"] == company
    behavior = customer_behavior(company_service, filters, "00000005")["data"]
    assert behavior["summary"]["valid_documents"] == 1
    assert behavior["summary"]["faturamento_liquido"] == (Decimal("80") if company == "COMPANY A" else Decimal("500"))
    assert len(behavior["first_products"]) == 1
    products = product_repurchase(company_service, filters)["data"]["items"]
    assert products[0]["customers"] == 3


@pytest.mark.parametrize("company,expected", [("COMPANY A", "240"), ("COMPANY B", "580")])
def test_first_day_financials_exclude_other_companies(company_service, company, expected):
    row = company_service.a.acquisition(october(company).analytical(), group_by=()).to_dicts()[0]
    assert row["faturamento_liquido_primeira_compra"] == Decimal(expected)
    assert company_service.overview(october(company))["data"]["acquired_customer_period_revenue"]["faturamento_liquido"] == Decimal(expected)


def test_company_values_and_literal_filter_do_not_multiply_or_inject(company_service):
    options = company_service.repo.filter_values(QueryFilters(), "company", None, 1, 25)
    assert [item["value"] for item in options["items"]] == ["COMPANY A", "COMPANY B"]
    filters = october("x' OR 1=1; DROP TABLE fato_vendas;--")
    assert company_service.overview(filters)["data"]["acquired_customers"] == 0
    assert company_service.a.financial_summary(filters.analytical())["quantidade_itens"].item() == 0
    assert company_service.repo.rows("SELECT count(*) n FROM fato_vendas")[0]["n"] == len(company_rows())


def test_company_population_includes_observed_customers_without_purchase(company_service):
    result = company_service.repo.customer_page(QueryFilters(company="COMPANY A"), 1, 25, "customer_id", "asc")
    ids = {item["customer_id"] for item in result["items"]}
    assert "00000007" in ids
    assert "00000006" not in ids
    assert "00000004" not in ids


def test_company_http_contract_and_filter_options(company_service, monkeypatch):
    from contextlib import contextmanager
    from fastapi.testclient import TestClient
    from customer_intelligence.api import main, dependencies
    from customer_intelligence.api.config import APISettings

    @contextmanager
    def connection(_settings):
        yield company_service.repo.conn

    monkeypatch.setattr(main, "connection", connection)
    monkeypatch.setattr(dependencies, "connection", connection)
    app = main.create_app(APISettings(database_path="not-opened-by-test.duckdb"))
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000)) as client:
        params = {"company": "COMPANY B", "start_date": "2026-10-01", "end_date": "2026-10-22"}
        response = client.get("/api/v1/overview", params=params)
        assert response.status_code == 200, response.text
        assert response.json()["data"]["acquired_customers"] == 2
        for endpoint in ["acquisition", "customers", "finance", "profitability", "retention", "cohorts", "products/repurchase", "customers/00000005/behavior", "customers/00000005/items", "lifecycle/transitions"]:
            response = client.get("/api/v1/" + endpoint, params=params)
            assert response.status_code == 200, (endpoint, response.text)
        response = client.get("/api/v1/filters", params={"dimension": "company"})
        assert response.status_code == 200
        assert len(response.json()["data"]["items"]) == 2
        assert client.get("/api/v1/overview", params={"company": "A" * 201}).status_code == 422
