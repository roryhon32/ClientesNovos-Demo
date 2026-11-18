from datetime import date, timedelta
from decimal import Decimal

from conftest import REFERENCE, query, source_row


def test_retention_and_cumulative_repurchase_are_different(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 1, 10)),
        source_row(emitted=date(2026, 3, 10), document="SYN-SECOND"),
        source_row(emitted=date(2026, 3, 10), document="SYN-SECOND", item="2"),
    ])
    cohorts = {row["meses_desde_aquisicao"]: row for row in query(result, "SELECT * FROM fato_cohort ORDER BY meses_desde_aquisicao")}
    assert min(cohorts) == 0
    assert cohorts[0]["taxa_retencao"] is None
    assert cohorts[0]["clientes_retidos"] is None
    assert cohorts[1]["clientes_retidos"] == 0
    assert cohorts[2]["clientes_retidos"] == 1
    assert float(cohorts[2]["taxa_retencao"]) == 100
    assert cohorts[3]["clientes_retidos"] == 0
    assert cohorts[3]["clientes_com_recompra_acumulada"] == 1
    assert float(cohorts[3]["taxa_recompra_acumulada"]) == 100
    assert cohorts[9]["periodo_completo"] is False
    assert cohorts[9]["clientes_elegiveis"] == 0
    assert cohorts[9]["taxa_retencao"] is None


def test_months_without_sales_exist_without_fake_sales(pipeline_runner):
    result = pipeline_runner([source_row(emitted=date(2026, 1, 10))])
    months = query(result, "SELECT mes_referencia, quantidade_notas_mes, faturamento_contabil_mes FROM fato_clientes_mensal ORDER BY mes_referencia")
    assert len(months) == 10
    assert months[1] == {"mes_referencia": date(2026, 2, 1), "quantidade_notas_mes": 0, "faturamento_contabil_mes": Decimal("0")}
    assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == 1


def test_repurchase_windows_mark_immature_observations(pipeline_runner):
    result = pipeline_runner([
        source_row(root="00000001", emitted=REFERENCE - timedelta(days=89), document="SYN-IMMATURE"),
        source_row(root="00000002", emitted=REFERENCE - timedelta(days=90), document="SYN-MATURE"),
        source_row(root="00000003", emitted=REFERENCE - timedelta(days=91), document="SYN-REPURCHASE"),
        source_row(root="00000003", emitted=REFERENCE - timedelta(days=1), document="SYN-SECOND"),
    ])
    customers = query(result, "SELECT raiz_cnpj,maturidade_90d,recompra_90d FROM dim_clientes ORDER BY raiz_cnpj")
    assert customers == [
        {"raiz_cnpj": "00000001", "maturidade_90d": False, "recompra_90d": None},
        {"raiz_cnpj": "00000002", "maturidade_90d": True, "recompra_90d": False},
        {"raiz_cnpj": "00000003", "maturidade_90d": True, "recompra_90d": True},
    ]
    summary = query(result, "SELECT COUNT(*) FILTER (WHERE maturidade_90d) eligible, COUNT(*) FILTER (WHERE recompra_90d) repeated FROM dim_clientes")[0]
    assert summary == {"eligible": 2, "repeated": 1}


def test_same_day_second_document_counts_as_repurchase_not_item(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 1, 10), document="SYN-A", item="1"),
        source_row(emitted=date(2026, 1, 10), document="SYN-A", item="2"),
        source_row(emitted=date(2026, 1, 10), document="SYN-B", item="1"),
    ])
    customer = query(result, "SELECT quantidade_compras_validas,dias_ate_segunda_compra,recompra_30d FROM dim_clientes")[0]
    assert customer == {"quantidade_compras_validas": 2, "dias_ate_segunda_compra": 0, "recompra_30d": True}
