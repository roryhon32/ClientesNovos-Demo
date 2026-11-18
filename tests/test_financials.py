from decimal import Decimal

import pytest

from customer_intelligence.metrics import Analytics

from conftest import query, source_row


@pytest.mark.parametrize(
    ("gross", "net", "margin", "expected_margin", "expected_tax_percent"),
    [
        ("100000", "85000", "25500", 30, 15),
        ("0", "0", "0", None, None),
        ("-1000", "-850", "-255", 30, 15),
        ("1000", "850", "-255", -30, 15),
        ("1000", "100", "200", 200, 90),
        ("1000", "0", "25", None, 100),
        (None, None, None, None, None),
    ],
)
def test_official_financial_formulas(
    pipeline_runner, gross, net, margin, expected_margin, expected_tax_percent
):
    result = pipeline_runner([source_row(**{
        "Valor Contábil": gross, "Fat. Líquido": net, "Margem Bruta (R$)": margin,
    })])
    fact = query(result, "SELECT * FROM fato_vendas")[0]
    expected_tax = Decimal(gross) - Decimal(net) if gross is not None and net is not None else None
    assert fact["impostos"] == expected_tax
    for name, expected in (
        ("margem_bruta_percentual", expected_margin),
        ("percentual_impostos", expected_tax_percent),
    ):
        assert fact[name] is None if expected is None else float(fact[name]) == pytest.approx(expected)
    assert fact["margem_bruta_valor"] == (Decimal(margin) if margin is not None else None)


@pytest.mark.parametrize("group_by", [("business_unit",), ("mes_referencia",), ("raiz_cnpj",), ()])
def test_aggregate_ratios_are_weighted_and_reconcile(pipeline_runner, group_by):
    rows = [
        source_row(document="SYN-A", **{"Valor Contábil": "100", "Fat. Líquido": "80", "Margem Bruta (R$)": "40"}),
        source_row(document="SYN-B", **{"Valor Contábil": "1000", "Fat. Líquido": "800", "Margem Bruta (R$)": "80"}),
        source_row(document="SYN-RETURN", **{"Valor Contábil": "-100", "Fat. Líquido": "-80", "Margem Bruta (R$)": "-8", "FAT - Quant.": "-1"}),
    ]
    result = pipeline_runner(rows)
    record = Analytics(result.connection).financial_summary(group_by=group_by).to_dicts()[0]
    assert record["faturamento_contabil"] == Decimal("1000")
    assert record["faturamento_liquido"] == Decimal("800")
    assert record["impostos"] == Decimal("200")
    assert record["margem_bruta_valor"] == Decimal("112")
    assert float(record["margem_bruta_percentual"]) == pytest.approx(14)
    assert float(record["percentual_impostos"]) == pytest.approx(20)
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == len(rows)


def test_general_financials_keep_returns_and_invalid_purchases(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SYN-SALE"),
        source_row(document="SYN-RETURN", **{
            "Valor Contábil": "-100", "Fat. Líquido": "-85", "Margem Bruta (R$)": "-25.5",
            "FAT - Quant.": "-1", "LIQ - Quant.": "-1",
        }),
    ])
    row = query(result, "SELECT SUM(faturamento_contabil) gross, SUM(impostos) tax, COUNT(*) items, COUNT(*) FILTER (WHERE compra_valida) valid_count FROM fato_vendas")[0]
    assert row == {"gross": Decimal("900"), "tax": Decimal("135"), "items": 2, "valid_count": 1}
    monthly = query(result, "SELECT faturamento_contabil_mes FROM fato_clientes_mensal WHERE mes_referencia=DATE '2026-01-01'")[0]
    assert monthly["faturamento_contabil_mes"] == Decimal("900")


def test_decimal_amounts_are_not_rounded_early(pipeline_runner):
    result = pipeline_runner([source_row(**{
        "Valor Contábil": "1.000001", "Fat. Líquido": "0.850001", "Margem Bruta (R$)": "0.255001",
    })])
    row = query(result, "SELECT faturamento_contabil, faturamento_liquido, impostos, margem_bruta_valor FROM fato_vendas")[0]
    assert row == {"faturamento_contabil": Decimal("1.000001"), "faturamento_liquido": Decimal("0.850001"), "impostos": Decimal("0.150000"), "margem_bruta_valor": Decimal("0.255001")}
