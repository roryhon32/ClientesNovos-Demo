"""Regressões do detalhe transacional, exclusivamente com dados gerados."""
from datetime import date
from decimal import Decimal
import json
from uuid import uuid4

from fastapi.testclient import TestClient
import polars as pl
import pytest

from customer_intelligence.api.config import APISettings
from customer_intelligence.api.database import connection
from customer_intelligence.api.main import create_app
from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.pipeline import SYNTHETIC_ROOT, run_pipeline
from conftest import source_row


@pytest.fixture(scope="module")
def item_database():
    folder = SYNTHETIC_ROOT / ("customer-items-tests-" + uuid4().hex)
    target = folder / "generated.duckdb"
    rows = [
        source_row(**{"Nome Cliente": "CLIENTE MATRIZ", "Cliente REAL": "GRUPO SINTETICO",
                      "Valor Contábil": "1000.123456", "Fat. Líquido": "850.123456",
                      "Margem Bruta (R$)": "255.123456", "FAT - Quant.": "2.5", "LIQ - Quant.": "2.25"}),
        source_row(item="2", **{"Nome Cliente": "CLIENTE MATRIZ", "Cliente REAL": "GRUPO SINTETICO",
                               "Desc. Produto": "SEGUNDO PRODUTO SINTETICO", "FAT - Quant.": "3",
                               "Valor Contábil": "500", "Fat. Líquido": "425", "Margem Bruta (R$)": "42.5"}),
        source_row(document="RETURN", branch="0002", emitted=date(2026, 2, 10), **{
            "Nome Cliente": "CLIENTE FILIAL", "Cliente REAL": "GRUPO FILIAL SINTETICO",
            "Status": "DEVOLVIDO", "Business Unit": "BU B", "FAT - Quant.": "-1", "LIQ - Quant.": "-1",
            "Valor Contábil": "-100", "Fat. Líquido": "-85", "Margem Bruta (R$)": "-25.5"}),
        source_row(document="FUTURE", emitted=date(2027, 1, 1),
                   **{"Nome Cliente": "CLIENTE FUTURO", "Cliente REAL": "GRUPO FUTURO"}),
        source_row(document="INVALID-DATE", emitted="data inválida",
                   **{"Nome Cliente": "CLIENTE MATRIZ", "Cliente REAL": "GRUPO SINTETICO"}),
        source_row(root="00000002", **{"Valor Contábil": "200", "Fat. Líquido": "100", "Margem Bruta (R$)": "50"}),
        source_row(root="00000003", **{"Fat. Líquido": "0", "Margem Bruta (R$)": "10"}),
        source_row(root="00000004", **{"Valor Contábil": None, "Fat. Líquido": None, "Margem Bruta (R$)": None}),
    ]
    with run_pipeline(SyntheticDataset(pl.DataFrame(rows).cast(pl.String)),
                      Settings(reference_date=date(2026, 10, 22)), target):
        pass
    yield target
    for file in folder.iterdir():
        file.unlink()
    folder.rmdir()


@pytest.fixture
def item_client(item_database):
    with TestClient(create_app(APISettings(database_path=str(item_database))),
                    base_url="http://localhost", client=("127.0.0.1", 50000),
                    raise_server_exceptions=False) as client:
        yield client


def test_items_preserve_documents_and_product_dimensions(item_client):
    r = item_client.get("/api/v1/customers/00000001/items")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["pagination"] == {"page": 1, "page_size": 25, "total_items": 3, "total_pages": 1}
    items = data["items"]
    assert [x["document_number"] for x in items] == ["RETURN", "SYN-001", "SYN-001"]
    assert len({x["identificador_item"] for x in items}) == 3
    assert len({x["identificador_documento"] for x in items}) == 2
    first = items[1]
    assert first["codigo_produto"] == "SYN-P1"
    assert first["descricao_produto"] == "PRODUTO SINTETICO"
    assert first["branch"] == "0001" and first["company"] == "EMPRESA SINTETICA"
    assert first["customer_code"] == "SYN-00000001-0001" and first["item"] == "1"
    assert first["nome_cliente"] == "CLIENTE MATRIZ" and first["cliente_real"] == "GRUPO SINTETICO"
    assert items[0]["nome_cliente"] == "CLIENTE FILIAL" and items[0]["cliente_real"] == "GRUPO FILIAL SINTETICO"
    assert first["quantidade_faturada"] == 2.5 and first["quantidade_liquida"] == 2.25
    assert first["business_unit"] == "BU SINTETICA A"
    assert first["familia"] == "FAMILIA SINTETICA"
    assert first["subfamilia"] == "SUBFAMILIA SINTETICA"
    assert first["vendedor"] == "VENDEDOR SINTETICO A"
    assert first["canal_venda"] == "DIRETO SINTETICO"
    assert first["estado"] == "SP" and first["municipio"] == "MUNICIPIO SINTETICO"
    assert items[0]["quantidade_faturada"] == -1 and not items[0]["compra_valida"]
    assert r.json()["meta"]["period_type"] == "transaction_to_snapshot"


def test_item_financials_reconcile_exactly_without_join_multiplication(item_client, item_database):
    data = json.loads(item_client.get("/api/v1/customers/00000001/items").text, parse_float=Decimal)["data"]
    with connection(APISettings(database_path=str(item_database))) as conn:
        expected = conn.execute("""SELECT count(*),sum(faturamento_contabil),sum(faturamento_liquido),
            sum(impostos),sum(margem_bruta_valor) FROM fato_vendas
            WHERE raiz_cnpj='00000001' AND data_emissao<=DATE '2026-10-22'""").fetchone()
    assert len(data["items"]) == expected[0]
    for field, total in zip(("faturamento_contabil", "faturamento_liquido", "impostos", "margem_bruta_valor"), expected[1:]):
        assert sum(x[field] for x in data["items"]) == total
    first = next(x for x in data["items"] if x["item"] == "1" and x["document_number"] == "SYN-001")
    assert first["faturamento_contabil"] == Decimal("1000.123456")
    assert first["impostos"] == Decimal("150")
    assert float(first["margem_bruta_percentual"]) == pytest.approx(100 * float(first["margem_bruta_valor"] / first["faturamento_liquido"]))


def test_item_filters_search_and_pagination(item_client):
    url = "/api/v1/customers/00000001/items"
    first = item_client.get(url, params={"page_size": 1}).json()["data"]
    second = item_client.get(url, params={"page_size": 1, "page": 2}).json()["data"]
    assert first["pagination"]["total_pages"] == 3
    assert first["items"][0]["identificador_item"] != second["items"][0]["identificador_item"]
    assert item_client.get(url, params={"page": 99}).json()["data"]["items"] == []
    for search, count in (("syn-p2", 1), ("segundo produto", 1), ("SYN-001", 2), ("' OR 1=1--", 0), ("%", 0)):
        result = item_client.get(url, params={"search": search})
        assert result.status_code == 200, result.text
        assert result.json()["data"]["pagination"]["total_items"] == count
    result = item_client.get(url, params={"start_date": "2026-02-01", "end_date": "2026-02-28", "business_unit": "BU B"})
    assert result.json()["data"]["pagination"]["total_items"] == 1
    for bu in ("missing", "' OR 1=1; DROP TABLE fato_vendas;--"):
        assert item_client.get(url, params={"business_unit": bu}).json()["data"]["items"] == []


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 101}, {"page_size": 0},
    {"start_date": "invalid"}, {"start_date": "2026-02-01", "end_date": "2026-01-01"},
    {"search": "x" * 101}, {"business_unit": "x" * 201}])
def test_invalid_item_filters_are_rejected(item_client, params):
    r = item_client.get("/api/v1/customers/00000001/items", params=params)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_item_customer_identity_and_missing_financials(item_client):
    assert item_client.get("/api/v1/customers/99999999/items").status_code == 404
    assert item_client.get("/api/v1/customers/not-a-root/items").status_code == 422
    row = item_client.get("/api/v1/customers/00000004/items").json()["data"]["items"][0]
    assert row["cliente_real"] is None
    for field in ("faturamento_contabil", "faturamento_liquido", "impostos", "margem_bruta_valor", "margem_bruta_percentual"):
        assert row[field] is None


def test_customer_name_sets_search_and_financial_reconciliation(item_client):
    listed = item_client.get("/api/v1/customers", params={"search": "grupo sintetico"}).json()["data"]
    assert listed["pagination"]["total_items"] == 1
    row = listed["items"][0]
    assert row["customer_id"] == "00000001"
    assert row["name"] == "CLIENTE FILIAL"
    assert row["customer_names"] == ["CLIENTE FILIAL", "CLIENTE MATRIZ"]
    assert row["real_customer_names"] == ["GRUPO FILIAL SINTETICO", "GRUPO SINTETICO"]
    detail = item_client.get("/api/v1/customers/00000001").json()["data"]["customer"]
    assert detail["customer_names"] == row["customer_names"]
    assert detail["real_customer_names"] == row["real_customer_names"]
    assert detail["faturamento_contabil"] == pytest.approx(1400.123456)
    assert detail["faturamento_liquido"] == pytest.approx(1190.123456)
    assert detail["margem_bruta_valor"] == pytest.approx(272.123456)
    assert detail["documentos_distintos"] == 2
    for query in ("CLIENTE MATRIZ", "grupo filial", "00000001"):
        assert item_client.get("/api/v1/customers", params={"search": query}).json()["data"]["pagination"]["total_items"] == 1
    for query in ("CLIENTE FUTURO", "GRUPO FUTURO", "' OR 1=1--", "%"):
        assert item_client.get("/api/v1/customers", params={"search": query}).json()["data"]["items"] == []
    missing = item_client.get("/api/v1/customers/00000002").json()["data"]["customer"]
    assert missing["real_customer_names"] == []
    assert missing["customer_names"] == ["CLIENTE SINTETICO 00000002"]


def test_customer_label_horizon_matches_dimension(pipeline_runner):
    from customer_intelligence.api.repository import Repository
    from customer_intelligence.api.schemas import QueryFilters

    result = pipeline_runner([
        source_row(document="CURRENT", **{"Nome Cliente": "ATUAL", "Cliente REAL": "REAL ATUAL"}),
        source_row(document="UNKNOWN", emitted="inválida", **{"Nome Cliente": "SEM DATA", "Cliente REAL": "REAL SEM DATA"}),
        source_row(document="OLD", emitted=date(2019, 1, 1), **{"Nome Cliente": "ANTIGO", "Cliente REAL": "REAL ANTIGO"}),
        source_row(document="FUTURE", emitted=date(2027, 1, 1), **{"Nome Cliente": "FUTURO", "Cliente REAL": "REAL FUTURO"}),
        source_row(root="00000002", **{"Nome Cliente": None, "Cliente REAL": None}),
    ])
    repo = Repository(result.connection)
    rows = repo.customer_page(QueryFilters(), 1, 25, "customer_id", "asc")["items"]
    assert rows[0]["customer_names"] == ["ATUAL", "SEM DATA"]
    assert rows[0]["real_customer_names"] == ["REAL ATUAL", "REAL SEM DATA"]
    assert rows[1]["customer_names"] == [] and rows[1]["real_customer_names"] == []
    assert repo.customer_page(QueryFilters(), 1, 25, "customer_id", "asc", search="REAL ANTIGO")["items"] == []
    assert repo.customer_page(QueryFilters(), 1, 25, "customer_id", "asc", search="REAL SEM DATA")["pagination"]["total_items"] == 1


def test_customer_margin_percent_and_revenue_sort(item_client):
    desc = item_client.get("/api/v1/customers", params={"sort_by": "gross_margin_pct", "sort_order": "desc"})
    assert desc.status_code == 200, desc.text
    rows = desc.json()["data"]["items"]
    assert [r["customer_id"] for r in rows[:2]] == ["00000002", "00000001"]
    assert all(r["margem_bruta_percentual"] is None for r in rows[2:])
    asc = item_client.get("/api/v1/customers", params={"sort_by": "gross_margin_pct", "sort_order": "asc"}).json()["data"]["items"]
    assert [r["customer_id"] for r in asc[:2]] == ["00000001", "00000002"]
    revenue = item_client.get("/api/v1/customers", params={"sort_by": "accounting_revenue", "sort_order": "desc"}).json()["data"]["items"]
    assert revenue[0]["customer_id"] == "00000001"


def test_item_max_rows_limit_and_openapi_contract(item_database):
    with TestClient(create_app(APISettings(database_path=str(item_database), max_rows=1)),
                    base_url="http://localhost", client=("127.0.0.1", 50000)) as client:
        data = client.get("/api/v1/customers/00000001/items").json()["data"]
        assert len(data["items"]) == 1
        assert data["pagination"]["page_size"] == 1 and data["pagination"]["total_pages"] == 3
        schema = client.get("/openapi.json").json()
        assert "/api/v1/customers/{customer_id}/items" in schema["paths"]
        assert "CustomerItem" in schema["components"]["schemas"]
