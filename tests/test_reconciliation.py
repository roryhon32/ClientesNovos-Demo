import pytest

from customer_intelligence.models.reconciliation import reconcile_monthly_cohort
from customer_intelligence.validation.quality_checks import reconcile_models

from conftest import query, source_row


def test_null_replaced_by_zero_is_detected_even_when_sum_is_unchanged(pipeline_runner):
    result = pipeline_runner([source_row(**{"Fat. Líquido": None})])
    result.connection.execute("UPDATE fato_vendas SET faturamento_liquido=0 WHERE faturamento_liquido IS NULL")
    with pytest.raises(AssertionError, match="por linha|não reconciliam"):
        reconcile_models(result.connection)


@pytest.mark.parametrize("model, measure", [
    ("fato_clientes_mensal", "faturamento_contabil_mes"),
    ("fato_cohort", "faturamento_contabil_periodo"),
])
def test_financial_drift_in_each_aggregate_is_detected(pipeline_runner, model, measure):
    result = pipeline_runner([source_row()])
    result.connection.execute(f"UPDATE {model} SET {measure}={measure}+1")
    with pytest.raises(AssertionError, match="Reconciliação"):
        reconcile_monthly_cohort(result.connection)


def test_missing_month_is_detected_by_bidirectional_reconciliation(pipeline_runner):
    result = pipeline_runner([source_row()])
    result.connection.execute("DELETE FROM fato_clientes_mensal WHERE mes_referencia=DATE '2026-02-01'")
    with pytest.raises(AssertionError, match="Reconciliação"):
        reconcile_monthly_cohort(result.connection)


def test_same_document_date_formats_do_not_create_a_repurchase(pipeline_runner):
    result = pipeline_runner([
        source_row(item="1", **{"Emissão": "2026-01-10"}),
        source_row(item="2", **{"Emissão": "10/01/2026"}),
    ])
    assert query(result, "SELECT quantidade_compras_validas,data_segunda_compra FROM dim_clientes") == [
        {"quantidade_compras_validas": 1, "data_segunda_compra": None}
    ]


def test_exclusion_buckets_account_for_every_source_row(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SYN-KNOWN"),
        source_row(document="SYN-NODATE", **{"Emissão": "invalid-synthetic-date"}),
        source_row(document="SYN-FUTURE", **{"Emissão": "2027-01-01"}),
        source_row(document="SYN-NOIDENTITY", **{"CNPJ/CPF": None, "CNPJ Aj.": None, "RAIZ CNPJ": None}),
    ])
    rows = query(result, "SELECT bucket,quantidade_itens FROM reconciliacao_financeira")
    assert sum(row["quantidade_itens"] for row in rows) == 4
    assert {row["bucket"] for row in rows} == {
        "incluido_cohort", "sem_data_valida", "futuro", "sem_raiz_identificada"
    }
