from decimal import Decimal

import polars as pl
import pytest

from customer_intelligence.config.columns import COLUMN_MAP
from customer_intelligence.ingestion.source_adapter import SyntheticDataset, read_synthetic
from customer_intelligence.synthetic import synthetic_cnpj
from customer_intelligence.validation.quality_checks import QualityError

from conftest import query, source_row


def test_source_contract_keeps_distinct_commerce_fields():
    assert len(COLUMN_MAP) == 129
    assert len(set(COLUMN_MAP.values())) == len(COLUMN_MAP)
    assert COLUMN_MAP["ECOMERCE"] != COLUMN_MAP["E-COMERCE"]


def test_adapter_accepts_only_in_memory_synthetic_dataset():
    with pytest.raises(TypeError):
        read_synthetic("not-an-authorized-input.parquet")


def test_numeric_customer_identifiers_are_rejected_without_zero_repair():
    row = source_row()
    row["RAIZ CNPJ"] = 1
    with pytest.raises(TypeError):
        read_synthetic(SyntheticDataset(pl.DataFrame([row])))


def test_unknown_columns_are_rejected():
    row = source_row()
    row["UNAPPROVED FIELD"] = "fabricated"
    with pytest.raises(ValueError):
        read_synthetic(SyntheticDataset(pl.DataFrame([row])))


def test_invalid_cnpjs_and_cpfs_do_not_merge_into_a_customer(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SYN-INVALID-A", **{"CNPJ/CPF": "SYNTHETIC-INVALID-A", "CNPJ Aj.": None}),
        source_row(document="SYN-INVALID-B", **{"CNPJ/CPF": "SYNTHETIC-INVALID-B", "CNPJ Aj.": None}),
        source_row(document="SYN-CPF", **{"CNPJ/CPF": "00000000000", "CNPJ Aj.": None}),
    ])
    assert query(result, "SELECT COUNT(*) n FROM dim_clientes")[0]["n"] == 0
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas WHERE raiz_cnpj IS NULL")[0]["n"] == 3
    assert query(result, "SELECT SUM(faturamento_contabil) n FROM fato_vendas")[0]["n"] == Decimal("3000")
    assert any(issue.count > 0 for issue in result.quality.issues)


def test_identity_conflicts_are_reported_and_not_arbitrarily_resolved(pipeline_runner):
    result = pipeline_runner([source_row(**{"CNPJ Aj.": synthetic_cnpj("00000002")})])
    assert query(result, "SELECT raiz_cnpj FROM fato_vendas")[0]["raiz_cnpj"] is None
    assert query(result, "SELECT COUNT(*) n FROM dim_clientes")[0]["n"] == 0
    assert any(issue.count > 0 for issue in result.quality.issues)


def test_punctuation_and_leading_zeros_are_preserved(pipeline_runner):
    cnpj = synthetic_cnpj("00000001")
    formatted = f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
    result = pipeline_runner([source_row(**{"CNPJ/CPF": formatted, "RAIZ CNPJ": "00.000.001"})])
    assert query(result, "SELECT raiz_cnpj FROM dim_clientes")[0]["raiz_cnpj"] == "00000001"


def test_missing_identity_keeps_unassigned_financial_item(pipeline_runner):
    result = pipeline_runner([source_row(**{"RAIZ CNPJ": None, "CNPJ/CPF": None, "CNPJ Aj.": None})])
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == 1
    assert query(result, "SELECT COUNT(*) n FROM dim_clientes")[0]["n"] == 0
    assert query(result, "SELECT faturamento_contabil FROM fato_vendas")[0]["faturamento_contabil"] == Decimal("1000")


def test_duplicate_items_are_blocking_and_preserved_for_inspection(pipeline_runner):
    rows = [source_row(), source_row()]
    result = pipeline_runner(rows, fail_on_blocking_quality=False)
    assert not result.quality.passed
    assert any(issue.severity == "error" and issue.count > 0 for issue in result.quality.issues)
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == 2


def test_duplicate_items_fail_default_quality_gate(pipeline_runner):
    with pytest.raises(QualityError) as raised:
        pipeline_runner([source_row(), source_row()])
    assert hasattr(raised.value, "report")
    assert not raised.value.report.passed


def test_missing_financials_do_not_become_artificial_zero(pipeline_runner):
    result = pipeline_runner([
        source_row(item="1"),
        source_row(item="2", **{"Fat. Líquido": None, "Margem Bruta (R$)": None}),
    ])
    fact = query(result, "SELECT faturamento_liquido, impostos, margem_bruta_valor FROM fato_vendas ORDER BY identificador_item")
    assert any(row["faturamento_liquido"] is None and row["impostos"] is None for row in fact)
    aggregate = query(result, "SELECT faturamento_liquido_mes,margem_bruta_percentual_mes FROM fato_clientes_mensal WHERE mes_referencia=DATE '2026-01-01'")[0]
    assert aggregate["faturamento_liquido_mes"] is None
    assert aggregate["margem_bruta_percentual_mes"] is None


@pytest.mark.parametrize("invalid", ["1,25", "1.1234567", "SYNTHETIC-INVALID-AMOUNT", "9999999999999999999999999999999999999999"])
def test_unparseable_money_is_blocking_without_rounding_or_repair(pipeline_runner, invalid):
    result = pipeline_runner([source_row(**{"Valor Contábil": invalid})], fail_on_blocking_quality=False)
    assert result.quality.counts["invalid_money"] == 1
    assert not result.quality.passed
    assert query(result, "SELECT faturamento_contabil FROM fato_vendas")[0]["faturamento_contabil"] is None
    assert query(result, 'SELECT "Valor Contábil" AS amount FROM transacoes_origem')[0]["amount"] == invalid
