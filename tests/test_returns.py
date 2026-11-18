"""Regressões inteiramente geradas: DEV positivo nunca é compra válida."""
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from conftest import query, source_row
from customer_intelligence.api.behavior import customer_behavior, product_repurchase
from customer_intelligence.api.config import APISettings
from customer_intelligence.api.dependencies import service
from customer_intelligence.api.main import create_app
from customer_intelligence.api.schemas import QueryFilters
from customer_intelligence.api.services import Services


@pytest.mark.parametrize("quantity", ["1", "0.000001", "2.5"])
def test_positive_return_quantity_cannot_acquire_or_classify_customer(pipeline_runner, quantity):
    result = pipeline_runner([source_row(emitted=date(2026, 9, 1), **{
        "DEV - Quant.": quantity, "Status": "FATURADO", "FAT - Quant.": "5",
    })])
    row = query(result, "SELECT compra_valida,quantidade_devolvida FROM fato_vendas")[0]
    assert row == {"compra_valida": False, "quantidade_devolvida": Decimal(quantity)}
    assert query(result, "SELECT status_atual,quantidade_compras_validas,data_primeira_compra FROM dim_clientes") == [
        {"status_atual": "SEM FATURAMENTO", "quantidade_compras_validas": 0, "data_primeira_compra": None}]
    assert query(result, "SELECT count(*) n FROM fato_aquisicao")[0]["n"] == 0
    assert query(result, "SELECT count(*) n FROM compras_validas")[0]["n"] == 0
    financial = query(result, "SELECT faturamento_contabil,faturamento_liquido,impostos,margem_bruta_valor FROM fato_vendas")[0]
    assert financial == {"faturamento_contabil": Decimal(1000), "faturamento_liquido": Decimal(850),
                         "impostos": Decimal(150), "margem_bruta_valor": Decimal(255)}


def test_return_does_not_reactivate_or_reset_last_purchase(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2020, 1, 10), document="SALE", **{"DEV - Quant.": "0"}),
        source_row(emitted=date(2026, 9, 1), document="RETURN", **{"DEV - Quant.": "1"}),
    ])
    customer = query(result, "SELECT status_atual,data_ultima_compra,data_segunda_compra,quantidade_compras_validas,recompra_90d FROM dim_clientes")[0]
    assert customer == {"status_atual": "INATIVO", "data_ultima_compra": date(2020, 1, 10),
                        "data_segunda_compra": None, "quantidade_compras_validas": 1, "recompra_90d": False}
    month = query(result, "SELECT status_historico,quantidade_notas_mes,faturamento_liquido_mes FROM fato_clientes_mensal WHERE mes_referencia=DATE '2026-09-01'")[0]
    assert month == {"status_historico": "INATIVO", "quantidade_notas_mes": 0, "faturamento_liquido_mes": Decimal(850)}
    assert query(result, "SELECT count(*) n FROM fato_transicoes WHERE mes_referencia=DATE '2026-09-01' AND status_atual='RECORRENTE'")[0]["n"] == 0
    cohort = query(result, "SELECT clientes_retidos FROM fato_cohort WHERE safra_aquisicao='2020-01' AND meses_desde_aquisicao=80")[0]
    assert cohort["clientes_retidos"] == 0


def test_return_cannot_be_second_purchase_or_product_repeat(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 9, 1), document="SALE", **{"DEV - Quant.": "0"}),
        source_row(emitted=date(2026, 10, 1), document="RETURN", **{"DEV - Quant.": "1"}),
    ])
    services = Services(result.connection)
    behavior = customer_behavior(services, QueryFilters(), "00000001")["data"]
    assert behavior["summary"]["valid_documents"] == 1
    for name in ("general_repurchase", "same_bu_repurchase", "same_product_repurchase"):
        assert behavior["summary"][name] is False
    assert behavior["products"][0]["occasions"] == 1
    ranked = product_repurchase(services, QueryFilters())["data"]["items"][0]
    assert ranked["customers"] == 1 and ranked["repurchased_customers"] == 0
    assert ranked["repurchase_rate_pct"] == 0
    # RECORRENTE continua sendo recência do cliente, sem transformar a devolução em compra.
    assert query(result, "SELECT status_atual FROM dim_clientes")[0]["status_atual"] == "RECORRENTE"
    assert behavior["summary"]["faturamento_liquido"] == Decimal(1700)


def test_return_before_real_sale_does_not_redefine_first_products(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 1, 10), document="RETURN", **{"DEV - Quant.": "1", "Cód. Prod.": "RETURN-PRODUCT"}),
        source_row(emitted=date(2026, 9, 1), document="SALE", **{"DEV - Quant.": "0", "Cód. Prod.": "SALE-PRODUCT"}),
    ])
    assert query(result, "SELECT data_primeira_compra FROM dim_clientes")[0]["data_primeira_compra"] == date(2026, 9, 1)
    products = customer_behavior(Services(result.connection), QueryFilters(), "00000001")["data"]["first_products"]
    assert [product["product_id"] for product in products] == ["SALE-PRODUCT"]


@pytest.mark.parametrize("quantity,valid,warning", [(None, True, 0), ("0", True, 0), ("ilegível", False, 1), ("0.0000001", False, 1)])
def test_optional_and_unreadable_return_quantity_are_explicit(pipeline_runner, quantity, valid, warning):
    result = pipeline_runner([source_row(**{"DEV - Quant.": quantity})])
    assert query(result, "SELECT compra_valida FROM fato_vendas")[0]["compra_valida"] is valid
    assert result.quality.counts["invalid_return_quantity"] == warning
    assert query(result, "SELECT count(*) n,sum(faturamento_contabil) gross FROM fato_vendas") == [{"n": 1, "gross": Decimal(1000)}]


def test_customer_items_api_exposes_return_without_counting_purchase(pipeline_runner):
    result = pipeline_runner([source_row(**{"DEV - Quant.": "1"})])
    app = create_app(APISettings(database_path="data/synthetic/not-opened-test.duckdb"))
    app.dependency_overrides[service] = lambda: Services(result.connection)
    # A fixture fornece o banco em memória; não executar lifespan com caminho externo.
    client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
    try:
        response = client.get("/api/v1/customers/00000001/items")
        assert response.status_code == 200, response.text
        row = response.json()["data"]["items"][0]
        assert row["quantidade_devolvida"] == 1 and row["compra_valida"] is False
        assert row["faturamento_liquido"] == 850
    finally:
        client.close()
