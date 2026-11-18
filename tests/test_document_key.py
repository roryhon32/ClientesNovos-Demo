from datetime import date
from decimal import Decimal

import pytest

from customer_intelligence.metrics import Analytics
from customer_intelligence.validation.quality_checks import QualityError
from conftest import source_row, query


def test_four_field_note_preserves_items_and_ticket(pipeline_runner):
    rows = [source_row(item="1", **{"Série": None, "NF + Prod.": "A"}),
            source_row(item="2", **{"Série": None, "NF + Prod.": "B"}),
            source_row(document="SYN-SECOND", emitted=date(2026, 2, 1))]
    result = pipeline_runner(rows)
    assert query(result, "SELECT count(*) n,count(DISTINCT identificador_documento) docs FROM fato_vendas")[0] == {"n": 3, "docs": 2}
    customer = query(result, "SELECT * FROM dim_clientes")[0]
    assert customer["quantidade_compras_validas"] == 2
    assert customer["data_primeira_compra"] == date(2026, 1, 10)
    assert customer["data_segunda_compra"] == date(2026, 2, 1)
    financial = Analytics(result.connection).financial_summary().to_dicts()[0]
    assert financial["ticket_medio_contabil"] == 1500
    assert financial["ticket_medio_liquido"] == 1275
    assert financial["impostos"] == Decimal("450")
    assert financial["margem_bruta_valor"] == Decimal("765")


@pytest.mark.parametrize("column,value", [
    ("Filial", "SYN-OTHER"), ("Num. Docto.", "SYN-OTHER"),
    ("Cód. Cliente", "SYN-OTHER"), ("Empresa", "SYN-OTHER"),
])
def test_each_official_component_distinguishes_notes(pipeline_runner, column, value):
    result = pipeline_runner([source_row(), source_row(**{column: value})])
    assert query(result, "SELECT quantidade_compras_validas n FROM dim_clientes")[0]["n"] == 2


@pytest.mark.parametrize("conflict", ["date", "root", "series", "unknown_date"])
def test_conflicts_are_reported_without_changing_financials(pipeline_runner, conflict):
    other = source_row(item="2")
    if conflict == "date":
        other["Emissão"] = "2026-02-01"
    elif conflict == "unknown_date":
        other["Emissão"] = "invalid-synthetic-date"
    elif conflict == "root":
        other = source_row(root="00000002", item="2", **{"Cód. Cliente": source_row()["Cód. Cliente"]})
    else:
        other["Série"] = "SYN-OTHER"
    rows = [source_row(), other]
    with pytest.raises(QualityError) as exc:
        pipeline_runner(rows)
    assert exc.value.report.counts["ambiguous_documents"] == 1
    assert len(exc.value.report.to_dict()["document_conflicts"]) == 1
    result = pipeline_runner(rows, fail_on_blocking_quality=False)
    assert not result.quality.passed
    assert query(result, "SELECT count(*) n,count(DISTINCT identificador_documento) docs,sum(faturamento_contabil) gross,sum(faturamento_liquido) net,sum(impostos) tax,sum(margem_bruta_valor) margin FROM fato_vendas")[0] == {
        "n": 2, "docs": 1, "gross": Decimal("2000"), "net": Decimal("1700"),
        "tax": Decimal("300"), "margin": Decimal("510"),
    }
    assert query(result, "SELECT count(*) n FROM dq_document_conflicts")[0]["n"] == 1


def test_emission_and_series_do_not_change_document_hash(pipeline_runner):
    a = pipeline_runner([source_row()])
    b = pipeline_runner([source_row(emitted=date(2025, 2, 1), **{"Série": "OTHER", "NF + Prod.": "OTHER"})])
    assert query(a, "SELECT identificador_documento FROM fato_vendas") == query(b, "SELECT identificador_documento FROM fato_vendas")
