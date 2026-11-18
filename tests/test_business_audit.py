"""Auditoria independente de 29/10/2026; somente fixtures em memória.

Os xfail estritos documentam defeitos abertos, não comportamento desejado.
Use --runxfail para ver as asserções de contrato falharem sem mudar produção.
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
import ast
import importlib.util
from pathlib import Path
import random

import polars as pl
import pytest

from conftest import source_row
from customer_intelligence.api.behavior import customer_behavior, product_repurchase
from customer_intelligence.api.database import readiness
from customer_intelligence.api.repository import Repository
from customer_intelligence.api.schemas import QueryFilters
from customer_intelligence.api.services import Services
from customer_intelligence.metrics import Analytics, Filters
from customer_intelligence.validation.quality_checks import QualityError


@pytest.fixture(scope="module")
def importer():
    # Importa as funções; não chama main nem lê qualquer planilha.
    pytest.importorskip("fastexcel", reason="Dependência não declarada do importador real")
    spec = importlib.util.spec_from_file_location("audit_ingestion", Path(__file__).parents[1] / "scripts/ingest_real_data.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.xfail(strict=True, reason="AUD-03: API transforma RECORRENTE em NOVO")
def test_audit_customer_status_matches_official_snapshot(pipeline_runner):
    result = pipeline_runner([source_row(emitted=date(2026, 9, 10))])
    official = result.connection.execute("SELECT status_atual FROM dim_clientes").fetchone()[0]
    assert official == "RECORRENTE"
    page = Repository(result.connection).customer_page(QueryFilters(customer_status="RECORRENTE"), 1, 25, "customer_id", "asc")
    assert page["items"][0]["status"] == official


@pytest.mark.xfail(strict=True, reason="AUD-04: recência usa current_date em lugar da referência")
def test_audit_recency_is_stable_for_historical_snapshot(pipeline_runner):
    snapshot, purchase = date(2020, 2, 29), date(2020, 1, 31)
    result = pipeline_runner([source_row(emitted=purchase)], reference_date=snapshot)
    item = Repository(result.connection).customer_page(QueryFilters(), 1, 25, "customer_id", "asc")["items"][0]
    assert item["days_without_purchase"] == (snapshot - purchase).days


@pytest.mark.xfail(strict=True, reason="AUD-08: API arredonda DEV rejeitado pela normalização")
@pytest.mark.parametrize("quantity", ["0.0000001", "1e-2"])
def test_audit_item_return_quantity_preserves_unknown(pipeline_runner, quantity):
    result = pipeline_runner([source_row(**{"DEV - Quant.": quantity})])
    official = result.connection.execute("SELECT quantidade_devolvida FROM fato_vendas").fetchone()[0]
    assert official is None
    item = Repository(result.connection).customer_items("00000001", QueryFilters(), 1, 25)["items"][0]
    assert item["quantidade_devolvida"] is official


@pytest.mark.xfail(strict=True, reason="AUD-09: BU desconhecida é usada como uma BU identificada")
def test_audit_unknown_bu_does_not_prove_same_bu_repurchase(pipeline_runner):
    result = pipeline_runner([
        source_row(document="A", **{"Business Unit": None}),
        source_row(document="B", emitted=date(2026, 2, 10), **{"Business Unit": None}),
    ])
    data = customer_behavior(Services(result.connection), QueryFilters(), "00000001")["data"]
    assert data["summary"]["general_repurchase"] is True
    assert data["summary"]["same_bu_repurchase"] is False


@pytest.mark.xfail(strict=True, reason="AUD-10: status do snapshot difere do fechamento na mesma referência")
def test_audit_null_date_special_status_consistent_at_snapshot(pipeline_runner):
    result = pipeline_runner([source_row(emitted=None, **{"Cliente Novo": "SEM CLASSIFICAÇÃO"})])
    current = result.connection.execute("SELECT status_atual FROM dim_clientes").fetchone()[0]
    assert current == "SEM CLASSIFICAÇÃO"
    historical = Repository(result.connection).lifecycle(QueryFilters())
    assert historical == [{"status": current, "customers": 1}]


@pytest.mark.xfail(strict=True, reason="AUD-01: preparação apaga conflitos antes do gate")
def test_audit_importer_must_not_hide_document_conflicts(pipeline_runner, importer):
    rows = [source_row(document="CONFLICT", emitted=date(2026, 1, 10)),
            source_row(document="CONFLICT", emitted=date(2026, 2, 10), item="2", **{"Série": "OTHER"})]
    with pytest.raises(QualityError):
        pipeline_runner(rows)
    prepared = importer.prepare_real_data(pl.DataFrame(rows).cast(pl.String))
    with pytest.raises(QualityError):
        pipeline_runner(prepared.to_dicts())


@pytest.mark.xfail(strict=True, reason="AUD-01: preparação remove repetição financeira sem auditoria")
def test_audit_importer_must_preserve_duplicate_evidence(importer):
    row = source_row()
    prepared = importer.prepare_real_data(pl.DataFrame([row, row]).cast(pl.String))
    assert prepared.height == 2


@pytest.mark.xfail(strict=True, reason="AUD-01: Float64 altera valor decimal aceito pelo contrato")
def test_audit_importer_must_preserve_exact_money(importer):
    value = "9007199254740993"
    prepared = importer.prepare_real_data(pl.DataFrame([source_row(**{"Valor Contábil": value})]).cast(pl.String))
    assert Decimal(prepared["Valor Contábil"][0]) == Decimal(value)


@pytest.mark.xfail(strict=True, reason="AUD-01: preparação troca identidade conflitante por first()")
def test_audit_importer_must_preserve_identity_conflicts(pipeline_runner, importer):
    rows = [source_row(document="SAME"),
            source_row(root="00000002", document="SAME", item="2", **{"Cód. Cliente": "SYN-00000001-0001"})]
    with pytest.raises(QualityError):
        pipeline_runner(rows)
    prepared = importer.prepare_real_data(pl.DataFrame(rows).cast(pl.String))
    with pytest.raises(QualityError):
        pipeline_runner(prepared.to_dicts())


@pytest.mark.xfail(strict=True, reason="AUD-01: prefixo de Origem é promovido ao código comercial exato")
def test_audit_importer_must_not_expand_valid_origins(pipeline_runner, importer):
    rows = [source_row(**{"Origem": "MARGEM BRUTA POR NF OUTRO"})]
    result = pipeline_runner(rows)
    assert result.connection.execute("SELECT compra_valida FROM fato_vendas").fetchone()[0] is False
    prepared = importer.prepare_real_data(pl.DataFrame(rows).cast(pl.String))
    result = pipeline_runner(prepared.to_dicts())
    assert result.connection.execute("SELECT compra_valida FROM fato_vendas").fetchone()[0] is False


@pytest.mark.xfail(strict=True, reason="AUD-11: relatório auxiliar apresenta soma incompleta como total")
def test_audit_auxiliary_report_respects_official_completeness(pipeline_runner):
    result = pipeline_runner([source_row(document="KNOWN", **{"Fat. Líquido": "100"}),
                              source_row(document="UNKNOWN", **{"Fat. Líquido": None})])
    # Executa a consulta literal extraída do script, sem rodar seu main ou abrir banco.
    tree = ast.parse((Path(__file__).parents[1] / "scripts/audit_database.py").read_text(encoding="utf-8"))
    query = next(node.value for node in ast.walk(tree) if isinstance(node, ast.Constant)
                 and isinstance(node.value, str) and "year(data_emissao) as ano" in node.value)
    cursor = result.connection.execute(query)
    item = dict(zip([c[0] for c in cursor.description], cursor.fetchone()))
    assert item["fat_liquido"] is None


@pytest.mark.xfail(strict=True, reason="AUD-12: prontidão aceita modelo financeiro divergente")
def test_audit_readiness_does_not_certify_corrupt_monthly_model(pipeline_runner):
    result = pipeline_runner([source_row()])
    # Corrupção adversarial exclusivamente no DuckDB descartável da fixture.
    result.connection.execute("UPDATE fato_clientes_mensal SET faturamento_liquido_mes=faturamento_liquido_mes+1")
    with pytest.raises(RuntimeError):
        readiness(result.connection)


def test_audit_first_day_and_month_are_distinct_quantities(pipeline_runner):
    result = pipeline_runner([
        source_row(document="FIRST", emitted=date(2026, 1, 10), **{"Fat. Líquido": "80"}),
        source_row(document="LATER", emitted=date(2026, 1, 20), **{"Fat. Líquido": "320"}),
    ])
    service = Services(result.connection)
    period = QueryFilters(start_date=date(2026, 1, 1), end_date=date(2026, 1, 31))
    assert service.acquisition(period)["data"][0]["first_purchase_net_revenue"] == Decimal("80")
    assert service.overview(QueryFilters())["data"]["acquisition_month_net_revenue"] == Decimal("400")


def test_audit_unknown_period_finance_must_not_substitute_other_scope(pipeline_runner):
    result = pipeline_runner([
        source_row(document="FIRST", emitted=date(2026, 1, 10), **{"Fat. Líquido": "80"}),
        source_row(document="MISSING", emitted=date(2026, 2, 10), **{"Fat. Líquido": None}),
        source_row(root="00000002", **{"Fat. Líquido": "100", "Margem Bruta (R$)": "30"}),
    ])
    data = Services(result.connection).overview(QueryFilters())["data"]
    assert data["acquired_customer_period_revenue"]["faturamento_liquido"] is None
    assert data["acquisition_month_net_revenue"] == Decimal("180")
    assert data["acquired_customer_period_revenue"]["margem_bruta_percentual"] is None


def test_audit_profitability_limit_is_alphabetical_not_financial_top(pipeline_runner):
    result = pipeline_runner([
        source_row(root="00000001", **{"Business Unit": "A", "Fat. Líquido": "10"}),
        source_row(root="00000002", **{"Business Unit": "Z", "Fat. Líquido": "99999"}),
    ])
    repo = Repository(result.connection)
    assert repo.profitability(QueryFilters(), "business_unit", 1)[0]["dimension"] == "A"
    full = repo.profitability(QueryFilters(), "business_unit", 100)
    assert max(full, key=lambda r: r["faturamento_liquido"])["dimension"] == "Z"


@pytest.mark.parametrize("seed", [17, 93, 515])
def test_audit_independent_decimal_document_calendar_oracle(pipeline_runner, seed):
    """Oráculo em Decimal/dicts/date, sem funções SQL de produção para o esperado."""
    rng = random.Random(seed)
    reference = date(2026, 5, 20)
    rows = []
    for customer in range(1, 7):
        root = f"{customer:08d}"
        for doc in range(4):
            emitted = date(2026, 1, 3) + timedelta(days=doc * 37 + customer)
            returned = doc == 2 and customer % 2 == 0
            for item in range(1, 3):
                net = Decimal(rng.randrange(1, 50000)) / Decimal("100")
                accounting = net + Decimal("10.123456")
                margin = net / Decimal("4")
                if returned:
                    net, accounting, margin = -net, -accounting, -margin
                rows.append(source_row(root=root, document=f"D{doc}", emitted=emitted, item=str(item), **{
                    "Valor Contábil": str(accounting), "Fat. Líquido": str(net), "Margem Bruta (R$)": str(margin),
                    "DEV - Quant.": "1" if returned else "0", "Cód. Prod.": "AUD-P", "Business Unit": f"BU-{customer % 2}",
                }))
    rng.shuffle(rows)
    result = pipeline_runner(rows, reference_date=reference)
    expected_money = defaultdict(lambda: [Decimal(0), Decimal(0), Decimal(0)])
    documents = defaultdict(dict)
    fields = ["Valor Contábil", "Fat. Líquido", "Margem Bruta (R$)"]
    for row in rows:
        emitted = date.fromisoformat(row["Emissão"])
        if emitted > reference:
            continue
        key = row["Business Unit"]
        for index, field in enumerate(fields):
            expected_money[key][index] += Decimal(row[field])
        valid = (row["Status"] == "FATURADO" and row["Origem"] == "Margem Bruta por NF"
                 and Decimal(row["FAT - Quant."]) > 0 and Decimal(row["Valor Contábil"]) > 0
                 and Decimal(row["DEV - Quant."]) <= 0)
        if valid:
            key_doc = tuple(row[name] for name in ["Filial", "Num. Docto.", "Cód. Cliente", "Empresa"])
            documents[row["RAIZ CNPJ"]][key_doc] = emitted
    analytical = Analytics(result.connection)
    groups = analytical.financial_summary(group_by=("business_unit",)).to_dicts()
    for group in groups:
        accounting, net, margin = expected_money[group["business_unit"]]
        assert group["faturamento_contabil"] == accounting
        assert group["faturamento_liquido"] == net
        assert group["impostos"] == accounting - net
        assert group["margem_bruta_valor"] == margin
        assert group["margem_bruta_percentual"] == pytest.approx(float(100 * margin / net))
    customers = Repository(result.connection).rows("SELECT * FROM dim_clientes")
    for customer in customers:
        days = sorted(documents[customer["raiz_cnpj"]].values())
        assert customer["quantidade_compras_validas"] == len(days)
        assert customer["data_primeira_compra"] == days[0]
        assert customer["data_segunda_compra"] == days[1]
        assert customer["data_ultima_compra"] == days[-1]
        elapsed = (reference - days[-1]).days
        expected_status = "NOVO" if days[0].replace(day=1) == reference.replace(day=1) else (
            "RECORRENTE" if elapsed < 180 else "EM RISCO" if elapsed < 365 else "INATIVO")
        assert customer["status_atual"] == expected_status
        for window in [30, 60, 90, 180]:
            mature = (reference - days[0]).days >= window
            assert customer[f"maturidade_{window}d"] is mature
            assert customer[f"recompra_{window}d"] is ((days[1] - days[0]).days <= window if mature else None)
    cohorts = analytical.retention().to_dicts()
    for cohort in cohorts:
        month = cohort["mes_referencia"] if "mes_referencia" in cohort else date(2026, 1 + cohort["meses_desde_aquisicao"], 1)
        month_end = (date(month.year + month.month // 12, month.month % 12 + 1, 1) - timedelta(days=1))
        retained = sum(any(day.replace(day=1) == month for day in docs.values()) for docs in documents.values())
        repurchased = sum(sorted(docs.values())[1] <= min(month_end, reference) for docs in documents.values())
        assert cohort["clientes_observados"] == len(documents)
        assert cohort["clientes_com_recompra_acumulada"] == repurchased
        if month_end <= reference and cohort["meses_desde_aquisicao"] > 0:
            assert cohort["taxa_retencao"] == pytest.approx(100 * retained / len(documents))
        else:
            assert cohort["taxa_retencao"] is None
    ranking = product_repurchase(Services(result.connection), QueryFilters())["data"]["items"][0]
    assert ranking["customers"] == 6
    assert ranking["repurchased_customers"] == 6
    assert ranking["repurchase_rate_pct"] == 100


@pytest.mark.parametrize("missing_field", ["Valor Contábil", "Fat. Líquido", "Margem Bruta (R$)"])
def test_audit_completeness_is_preserved_across_granularities(pipeline_runner, missing_field):
    rows = [source_row(document="A"), source_row(document="B", item="2", **{missing_field: None})]
    result = pipeline_runner(rows)
    analytical = Analytics(result.connection)
    alias = {"Valor Contábil": "faturamento_contabil", "Fat. Líquido": "faturamento_liquido", "Margem Bruta (R$)": "margem_bruta_valor"}[missing_field]
    assert analytical.financial_summary().to_dicts()[0][alias] is None
    assert result.connection.execute(f"SELECT {alias}_mes FROM fato_clientes_mensal ORDER BY mes_referencia LIMIT 1").fetchone()[0] is None
    assert analytical.acquisition(group_by=()).to_dicts()[0][alias] is None
    assert analytical.retention().to_dicts()[0][alias + "_periodo"] is None


def test_audit_negative_net_and_zero_denominator_are_not_clamped(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SALE", **{"Fat. Líquido": "100", "Margem Bruta (R$)": "20"}),
        source_row(document="RETURN", **{"DEV - Quant.": "2", "Valor Contábil": "-2000", "Fat. Líquido": "-150", "Margem Bruta (R$)": "-30"}),
    ])
    finance = Analytics(result.connection).financial_summary().to_dicts()[0]
    assert finance["faturamento_liquido"] == Decimal("-50")
    assert finance["margem_bruta_valor"] == Decimal("-10")
    assert finance["margem_bruta_percentual"] == 20
    assert result.connection.execute("SELECT quantidade_compras_validas FROM dim_clientes").fetchone()[0] == 1


@pytest.mark.parametrize("window", [30, 60, 90, 180])
def test_audit_exact_window_last_day_and_one_day_late(pipeline_runner, window):
    first = date(2025, 1, 1)
    rows = []
    for customer, offset in [("00000001", window), ("00000002", window + 1)]:
        rows += [source_row(root=customer, document="FIRST", emitted=first),
                 source_row(root=customer, document="SECOND", emitted=first + timedelta(days=offset))]
    result = pipeline_runner(rows)
    aggregate = Analytics(result.connection).acquisition(group_by=()).to_dicts()[0]
    assert aggregate[f"clientes_elegiveis_recompra_{window}d"] == 2
    assert aggregate[f"clientes_recompra_{window}d"] == 1
    assert aggregate[f"taxa_recompra_{window}d"] == 50


def test_audit_empty_dataset_keeps_models_and_unknown_rates(pipeline_runner):
    # Mantém schema do contrato quando não existem linhas.
    row = source_row()
    from customer_intelligence.config.settings import Settings
    from customer_intelligence.ingestion.source_adapter import SyntheticDataset
    from customer_intelligence.pipeline import run_pipeline
    with run_pipeline(SyntheticDataset(pl.DataFrame([row]).cast(pl.String).head(0)), Settings(reference_date=date(2026, 10, 22))) as result:
        assert result.quality.passed
        row = Analytics(result.connection).financial_summary().to_dicts()[0]
        assert row["quantidade_itens"] == 0
        assert row["margem_bruta_percentual"] is None
