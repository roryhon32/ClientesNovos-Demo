from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from customer_intelligence.metrics import Analytics, Filters

from conftest import REFERENCE, source_row


def test_parameterized_filters_apply_only_selected_source_scope(pipeline_runner):
    result = pipeline_runner([
        source_row(root="00000001", document="SYN-A", **{"Business Unit": "BU SINTETICA A"}),
        source_row(root="00000002", document="SYN-B", emitted=date(2026, 2, 10), **{"Business Unit": "BU SINTETICA B"}),
    ])
    analytics = Analytics(result.connection)
    selected = analytics.financial_summary(Filters(business_unit="BU SINTETICA A")).to_dicts()[0]
    assert selected["faturamento_contabil"] == Decimal("1000")
    injected = analytics.financial_summary(Filters(business_unit="x' OR 1=1 --")).to_dicts()[0]
    assert injected["faturamento_contabil"] in (None, Decimal("0"))


def test_unsafe_grouping_is_rejected(pipeline_runner):
    result = pipeline_runner([source_row()])
    with pytest.raises(ValueError):
        Analytics(result.connection).financial_summary(group_by=("business_unit); DROP TABLE fato_vendas;--",))
    assert result.connection.execute("SELECT COUNT(*) FROM fato_vendas").fetchone()[0] == 1


def test_filters_validate_month_and_unknown_arguments():
    with pytest.raises(ValidationError):
        Filters(month=13)
    with pytest.raises(ValidationError):
        Filters(unsupported="arbitrary")


def test_repurchase_denominator_excludes_recent_customers(pipeline_runner):
    from datetime import timedelta
    from conftest import REFERENCE

    result = pipeline_runner([
        source_row(root="00000001", emitted=REFERENCE - timedelta(days=89), document="SYN-IMMATURE"),
        source_row(root="00000002", emitted=REFERENCE - timedelta(days=90), document="SYN-NO-REPEAT"),
        source_row(root="00000003", emitted=REFERENCE - timedelta(days=91), document="SYN-FIRST"),
        source_row(root="00000003", emitted=REFERENCE - timedelta(days=1), document="SYN-SECOND"),
    ])
    summary = Analytics(result.connection).acquisition(group_by=()).to_dicts()[0]
    assert summary["clientes_novos"] == 3
    assert summary["clientes_elegiveis_recompra_90d"] == 2
    assert summary["clientes_imaturos_90d"] == 1
    assert summary["clientes_recompra_90d"] == 1
    assert float(summary["taxa_recompra_90d"]) == 50


def test_multi_attribute_groups_do_not_multiply_acquisition_revenue(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SYN-A", **{"Business Unit": "BU SINTETICA A"}),
        source_row(document="SYN-B", **{"Business Unit": "BU SINTETICA B"}),
    ])
    analytics = Analytics(result.connection)
    grouped = analytics.acquisition(group_by=("business_unit",)).to_dicts()
    assert len(grouped) == 1
    assert grouped[0]["clientes_novos"] == 1
    assert grouped[0]["business_unit"] == ["BU SINTETICA A", "BU SINTETICA B"]


@pytest.fixture
def analytics_scope(pipeline_runner):
    """Every selector can distinguish these entirely fabricated source rows."""
    result = pipeline_runner([
        source_row(
            root="00000001", emitted=date(2026, 10, 10), document="SYN-TARGET",
            **{
                "Nome Cliente": "CLIENTE SINTETICO D'AGUA", "Estado": "SP",
                "Município": "MUNICIPIO SINTETICO A", "Canal de Venda": "CANAL SINTETICO A",
                "Cód. Prod.": "SYN-P-A", "Familia Ajustada": "FAMILIA SINTETICA A",
            },
        ),
        source_row(
            root="00000002", emitted=date(2025, 9, 10), document="SYN-OTHER",
            **{
                "Empresa": "OUTRA EMPRESA SINTETICA",
                "Business Unit": "BU SINTETICA B", "Nome Vendedor": "VENDEDOR SINTETICO B",
                "Estado": "MG", "Município": "MUNICIPIO SINTETICO B",
                "Canal de Venda": "CANAL SINTETICO B", "Cód. Prod.": "SYN-P-B",
                "Familia Ajustada": "FAMILIA SINTETICA B", "Valor Contábil": "2000",
                "Fat. Líquido": "1700", "Margem Bruta (R$)": "510",
            },
        ),
    ])
    return Analytics(result.connection)


_FILTER_CASES = [
    ("company", "EMPRESA SINTETICA", "00000001"),
    ("year", 2026, "00000001"),
    ("month", 10, "00000001"),
    ("start_date", date(2026, 1, 1), "00000001"),
    ("end_date", date(2025, 12, 31), "00000002"),
    ("business_unit", "BU SINTETICA A", "00000001"),
    ("raiz_cnpj", "00000001", "00000001"),
    ("cliente", "CLIENTE SINTETICO D'AGUA", "00000001"),
    ("vendedor", "VENDEDOR SINTETICO A", "00000001"),
    ("estado", "SP", "00000001"),
    ("municipio", "MUNICIPIO SINTETICO A", "00000001"),
    ("canal_venda", "CANAL SINTETICO A", "00000001"),
    ("familia", "FAMILIA SINTETICA A", "00000001"),
    ("codigo_produto", "SYN-P-A", "00000001"),
    ("safra_aquisicao", "2026-10", "00000001"),
    ("status_cliente", "NOVO", "00000001"),
]


@pytest.mark.parametrize("field,value,expected_root", _FILTER_CASES)
def test_every_filter_selects_the_intended_financial_and_client_scope(
    analytics_scope, field, value, expected_root
):
    filters = Filters(**{field: value})
    financial = analytics_scope.financial_summary(filters, ("raiz_cnpj",)).to_dicts()
    assert len(financial) == 1
    assert financial[0]["raiz_cnpj"] == expected_root
    expected = Decimal("1000") if expected_root == "00000001" else Decimal("2000")
    assert financial[0]["faturamento_contabil"] == expected
    if field not in ("familia", "codigo_produto"):
        acquired = analytics_scope.acquisition(filters, ("raiz_cnpj",)).to_dicts()
        assert len(acquired) == 1
        assert acquired[0]["raiz_cnpj"] == expected_root
        assert acquired[0]["clientes_novos"] == 1


def test_filter_cases_cover_the_public_contract():
    # O limiar numérico requer clientes com contagens diferentes; a matriz
    # específica em api/test_purchase_count_filters.py cobre 0, 1, 2, 5 e 6.
    assert {field for field, _, _ in _FILTER_CASES} | {"valid_purchases_gt"} == set(Filters.model_fields)


def test_sql_text_in_every_string_filter_remains_a_literal(analytics_scope):
    fields = {field for field, value, _ in _FILTER_CASES if isinstance(value, str)}
    for field in fields:
        filters = Filters(**{field: "x' OR 1=1; DROP TABLE fato_vendas;--"})
        assert analytics_scope.financial_summary(filters)["quantidade_itens"].item() == 0
        if field not in ("familia", "codigo_produto"):
            assert analytics_scope.acquisition_attribution(filters=filters).is_empty()
    # A legitimate apostrophe matches as data, and no statement has modified the fact.
    assert analytics_scope.financial_summary(
        Filters(cliente="CLIENTE SINTETICO D'AGUA")
    )["quantidade_itens"].item() == 1
    assert analytics_scope.financial_summary()["quantidade_itens"].item() == 2


@pytest.mark.parametrize("group_by", [
    ["business_unit"], "business_unit", ("business_unit", "business_unit"),
    ("faturamento_liquido",), ("business_unit; DROP TABLE fato_vendas",), (1,),
])
def test_grouping_requires_a_tuple_of_distinct_allowlisted_dimensions(
    analytics_scope, group_by
):
    for method in (
        analytics_scope.financial_summary, analytics_scope.acquisition,
        analytics_scope.acquisition_quality, analytics_scope.acquisition_growth,
        analytics_scope.lifecycle_summary,
    ):
        with pytest.raises(ValueError):
            method(group_by=group_by)
    assert analytics_scope.financial_summary()["quantidade_itens"].item() == 2


def test_filter_validation_rejects_inverted_or_malformed_periods():
    with pytest.raises(ValidationError):
        Filters(start_date="2026-10-22", end_date="2026-01-01")
    with pytest.raises(ValidationError):
        Filters(start_date="2026-02-31")
    with pytest.raises(ValidationError):
        Filters(year="2026 OR 1=1")


def test_snapshot_reference_cannot_change_precomputed_customer_status(analytics_scope):
    assert Analytics(analytics_scope.connection, REFERENCE).reference_date == REFERENCE
    with pytest.raises(ValueError, match="snapshot"):
        Analytics(analytics_scope.connection, date(2025, 1, 1))
    assert analytics_scope.acquisition(group_by=())["clientes_novos"].item() == 2


@pytest.fixture
def multi_attribution_scope(pipeline_runner):
    first = {
        "Business Unit": "BU SINTETICA A", "Nome Vendedor": "VENDEDOR SINTETICO A",
        "Estado": "SP", "Município": "MUNICIPIO SINTETICO A",
        "Canal de Venda": "CANAL SINTETICO A",
    }
    second = {
        "Business Unit": "BU SINTETICA B", "Nome Vendedor": "VENDEDOR SINTETICO B",
        "Estado": "MG", "Município": "MUNICIPIO SINTETICO B",
        "Canal de Venda": "CANAL SINTETICO B",
    }
    result = pipeline_runner([
        source_row(document="SYN-A", item="1", **first),
        source_row(document="SYN-A", item="2", **first),
        source_row(document="SYN-B", **second),
        source_row(root="00000002", document="SYN-C", **first),
    ])
    return Analytics(result.connection)


@pytest.mark.parametrize("dimension,first,second", [
    ("business_unit", "BU SINTETICA A", "BU SINTETICA B"),
    ("vendedor", "VENDEDOR SINTETICO A", "VENDEDOR SINTETICO B"),
    ("canal_venda", "CANAL SINTETICO A", "CANAL SINTETICO B"),
    ("estado", "SP", "MG"),
    ("municipio", "MUNICIPIO SINTETICO A", "MUNICIPIO SINTETICO B"),
])
def test_individual_associations_count_roots_once_and_expose_nonadditivity(
    multi_attribution_scope, dimension, first, second
):
    frame = multi_attribution_scope.acquisition_attribution(dimension)
    assert set(frame.columns) == {
        dimension, "clientes_novos", "clientes_multiplas_atribuicoes"
    }
    members = {row[dimension]: row for row in frame.to_dicts()}
    assert members[first]["clientes_novos"] == 2
    assert members[second]["clientes_novos"] == 1
    assert members[first]["clientes_multiplas_atribuicoes"] == 1
    assert members[second]["clientes_multiplas_atribuicoes"] == 1
    assert frame["clientes_novos"].sum() == 3
    assert multi_attribution_scope.acquisition(group_by=())["clientes_novos"].item() == 2
    # Counting associations cannot duplicate financial totals in the customer query.
    assert multi_attribution_scope.acquisition(group_by=())["faturamento_contabil"].item() == Decimal("4000")


def test_attribution_filter_selects_customers_before_listing_members(multi_attribution_scope):
    selected = multi_attribution_scope.acquisition_attribution(
        "business_unit", Filters(business_unit="BU SINTETICA B")
    ).to_dicts()
    assert {row["business_unit"] for row in selected} == {"BU SINTETICA A", "BU SINTETICA B"}
    assert all(row["clientes_novos"] == 1 for row in selected)


def test_attribution_catalog_dispatch_is_closed_and_validates_dimension(multi_attribution_scope):
    assert "acquisition_attribution" in Analytics.catalog()
    dispatched = multi_attribution_scope.query("acquisition_attribution", dimension="vendedor")
    assert dispatched.equals(multi_attribution_scope.acquisition_attribution("vendedor"))
    assert multi_attribution_scope.query("acquisition_attribution").equals(
        multi_attribution_scope.acquisition_attribution("business_unit")
    )
    with pytest.raises(ValueError):
        multi_attribution_scope.acquisition_attribution("estado; DROP TABLE fato_vendas")
    with pytest.raises(ValueError):
        multi_attribution_scope.query("acquisition_attribution", group_by=("estado",))
    with pytest.raises(ValueError):
        multi_attribution_scope.query("financial_summary", dimension="estado")
    with pytest.raises(ValueError):
        multi_attribution_scope.query("SELECT * FROM fato_vendas")


def test_dense_growth_keeps_missing_months_and_prior_year_before_display_filters(pipeline_runner):
    result = pipeline_runner([
        source_row(root="00000001", emitted=date(2024, 3, 10), document="SYN-PRIOR-YEAR"),
        source_row(root="00000002", emitted=date(2025, 1, 10), document="SYN-JAN"),
        source_row(root="00000003", emitted=date(2025, 3, 10), document="SYN-MAR-A"),
        source_row(root="00000004", emitted=date(2025, 3, 11), document="SYN-MAR-B"),
        source_row(root="00000005", emitted=date(2025, 4, 10), document="SYN-APR"),
    ])
    analytics = Analytics(result.connection)
    rows = analytics.acquisition_growth(
        Filters(year=2025, start_date=date(2025, 1, 1), end_date=date(2025, 4, 30))
    ).to_dicts()
    assert [row["periodo"] for row in rows] == [date(2025, month, 1) for month in range(1, 5)]
    assert [row["clientes_novos"] for row in rows] == [1, 0, 2, 1]
    assert rows[1]["crescimento_mensal_percentual"] == -100
    assert rows[2]["crescimento_mensal_percentual"] is None
    assert rows[3]["crescimento_mensal_percentual"] == -50
    assert rows[2]["crescimento_anual_percentual"] == 100
    march_only = analytics.acquisition_growth(Filters(year=2025, month=3)).to_dicts()[0]
    assert march_only["crescimento_anual_percentual"] == 100
    annual = analytics.acquisition_growth(Filters(year=2025), frequency="year").to_dicts()[0]
    assert annual["clientes_novos"] == 4
    assert annual["crescimento_anual_percentual"] == 300
