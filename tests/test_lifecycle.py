from datetime import date, timedelta

import pytest

from conftest import REFERENCE, query, source_row


@pytest.mark.parametrize("days,status", [(179, "RECORRENTE"), (180, "EM RISCO"), (364, "EM RISCO"), (365, "INATIVO")])
def test_exact_lifecycle_boundaries(pipeline_runner, days, status):
    result = pipeline_runner([source_row(emitted=REFERENCE - timedelta(days=days))])
    customer = query(result, "SELECT status_atual, dias_desde_ultima_compra FROM dim_clientes")[0]
    assert customer == {"status_atual": status, "dias_desde_ultima_compra": days}


def test_current_month_is_new_and_clipped_to_processing_date(pipeline_runner):
    result = pipeline_runner([source_row(emitted=date(2026, 10, 21))])
    assert query(result, "SELECT status_atual FROM dim_clientes")[0]["status_atual"] == "NOVO"
    monthly = query(result, "SELECT status_historico, dias_sem_compra FROM fato_clientes_mensal")[0]
    assert monthly == {"status_historico": "NOVO", "dias_sem_compra": 1}


def test_future_purchase_cannot_change_historical_classification(pipeline_runner):
    old = source_row(emitted=date(2026, 1, 10))
    future = source_row(emitted=date(2026, 11, 10), document="SYN-FUTURE")
    baseline = pipeline_runner([old])
    with_future = pipeline_runner([old, future])
    sql = "SELECT raiz_cnpj, mes_referencia, status_historico, data_ultima_compra_ate_mes, quantidade_compras_acumuladas FROM fato_clientes_mensal ORDER BY mes_referencia"
    assert query(baseline, sql) == query(with_future, sql)
    assert query(with_future, "SELECT compra_valida FROM fato_vendas WHERE data_emissao > DATE '2026-10-22'")[0]["compra_valida"] is False


def test_historical_status_is_as_of_each_month(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 1, 10)),
        source_row(emitted=date(2026, 10, 10), document="SYN-REACTIVATED"),
    ])
    statuses = {row["mes_referencia"]: row["status_historico"] for row in query(result, "SELECT mes_referencia,status_historico FROM fato_clientes_mensal")}
    assert statuses[date(2026, 1, 1)] == "NOVO"
    assert statuses[date(2026, 2, 1)] == "RECORRENTE"
    assert statuses[date(2026, 7, 1)] == "EM RISCO"
    assert statuses[date(2026, 10, 1)] == "RECORRENTE"


def test_inactive_customer_can_reactivate_without_becoming_new(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2020, 1, 10)),
        source_row(emitted=date(2026, 10, 10), document="SYN-REACTIVATED"),
    ])
    assert query(result, "SELECT status_atual FROM dim_clientes")[0]["status_atual"] == "RECORRENTE"
    transition = query(result, "SELECT status_anterior,status_atual FROM fato_transicoes WHERE mes_referencia=DATE '2026-10-01'")[0]
    assert transition == {"status_anterior": "INATIVO", "status_atual": "RECORRENTE"}
    assert query(result, "SELECT COUNT(*) n FROM fato_aquisicao")[0]["n"] == 1


def test_identified_customer_without_valid_sales_is_not_acquired(pipeline_runner):
    result = pipeline_runner([source_row(**{"Status": "CANCELADO"})])
    assert query(result, "SELECT status_atual FROM dim_clientes")[0]["status_atual"] == "SEM FATURAMENTO"
    assert query(result, "SELECT COUNT(*) n FROM fato_aquisicao")[0]["n"] == 0


def test_special_status_preserved_only_without_purchase(pipeline_runner):
    result = pipeline_runner([
        source_row(root="00000001", **{"Status": "CANCELADO", "Cliente Novo": "SEM CLASSIFICAÇÃO"}),
        source_row(root="00000002", **{"Cliente Novo": "SEM CLASSIFICAÇÃO"}),
    ])
    statuses = query(result, "SELECT raiz_cnpj,status_atual FROM dim_clientes ORDER BY raiz_cnpj")
    assert statuses == [
        {"raiz_cnpj": "00000001", "status_atual": "SEM CLASSIFICAÇÃO"},
        {"raiz_cnpj": "00000002", "status_atual": "EM RISCO"},
    ]


@pytest.mark.parametrize("overrides", [
    {"Status": "CANCELADO"}, {"Origem": "OUTRA ORIGEM"}, {"FAT - Quant.": "0"},
    {"Valor Contábil": "0"}, {"Emissão": "2026-02-31"}, {"Emissão": "2026-10-23"},
])
def test_valid_purchase_predicate_is_central_and_preserves_source(pipeline_runner, overrides):
    result = pipeline_runner([source_row(**overrides)])
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == 1
    assert query(result, "SELECT compra_valida FROM fato_vendas")[0]["compra_valida"] is False
    assert query(result, "SELECT COALESCE(SUM(quantidade_compras_validas),0) n FROM dim_clientes")[0]["n"] == 0


def test_valid_purchase_normalizes_case_and_whitespace(pipeline_runner):
    result = pipeline_runner([source_row(**{"Status": "  faturado  ", "Origem": "  margem bruta por nf  "})])
    assert query(result, "SELECT compra_valida FROM fato_vendas")[0]["compra_valida"] is True
