"""Recálculo de devoluções somente em conexões geradas em memória."""
from datetime import date

import pytest

from conftest import source_row
from customer_intelligence.config.settings import Settings
from customer_intelligence.models import build_models
from customer_intelligence.return_rebuild import recalculate_purchase_models
from customer_intelligence.validation.quality_checks import QualityError


SETTINGS = Settings(reference_date=date(2026, 10, 22))


def old_snapshot(pipeline_runner):
    rows = [
        source_row(document="RETURN-ONLY", emitted=date(2026, 9, 1), **{"DEV - Quant.": "2"}),
        source_row(root="00000002", document="OLD-SALE", emitted=date(2025, 10, 1), **{"DEV - Quant.": "0"}),
        source_row(root="00000002", document="RETURN-RECENT", emitted=date(2026, 9, 2), **{"DEV - Quant.": "1"}),
        source_row(root="00000003", document="CURRENT-SALE", emitted=date(2026, 9, 3), **{"DEV - Quant.": "0"}),
    ]
    result = pipeline_runner(rows)
    conn = result.connection
    # Simula versão antiga: DEV ignorado e coluna derivada ainda ausente.
    conn.execute("UPDATE stg_transacoes SET criterio_compra_valida=true")
    conn.execute("UPDATE fato_vendas SET criterios_comerciais_validos=true,compra_valida=true")
    build_models(conn, SETTINGS)
    return conn


def preserved(conn):
    return {
        "source": conn.execute("SELECT * FROM transacoes_origem").fetchall(),
        "keys": conn.execute("""SELECT source_row_id,filial,num_docto,cod_cliente,empresa,
            raiz_cnpj,data_emissao,source_fingerprint FROM stg_transacoes ORDER BY source_row_id""").fetchall(),
        "fact": conn.execute("""SELECT source_row_id,identificador_item,identificador_documento,
            raiz_cnpj,data_emissao,faturamento_contabil,faturamento_liquido,impostos,
            percentual_impostos,margem_bruta_valor,margem_bruta_percentual,
            quantidade_faturada,quantidade_liquida FROM fato_vendas ORDER BY source_row_id""").fetchall(),
    }


def test_returns_fix_status_and_recency_without_changing_rows_or_financials(pipeline_runner):
    conn = old_snapshot(pipeline_runner)
    initial = preserved(conn)
    assert conn.execute("SELECT status_atual FROM dim_clientes WHERE raiz_cnpj='00000001'").fetchone()[0] == "RECORRENTE"
    result = recalculate_purchase_models(conn, SETTINGS)
    assert preserved(conn) == initial
    assert result["before"]["valid_documents"] == 4
    assert result["after"]["valid_documents"] == 2
    assert result["invalidated_rows"] == 2
    assert result["validated_rows"] == 0
    assert result["financials_and_identity_preserved"] and result["quality_passed"]
    actual = conn.execute("""SELECT raiz_cnpj,status_atual,quantidade_compras_validas,data_ultima_compra
        FROM dim_clientes ORDER BY raiz_cnpj""").fetchall()
    assert actual == [("00000001", "SEM FATURAMENTO", 0, None),
                      ("00000002", "INATIVO", 1, date(2025, 10, 1)),
                      ("00000003", "RECORRENTE", 1, date(2026, 9, 3))]
    assert result["status_changes"] == [
        {"previous_status": "RECORRENTE", "status": "INATIVO", "customers": 1},
        {"previous_status": "RECORRENTE", "status": "SEM FATURAMENTO", "customers": 1}]
    assert conn.execute("SELECT count(*) FROM dq_summary").fetchone()[0] > 0
    # Chamadas repetidas não alteram novamente as classificações ou movimentos.
    assert recalculate_purchase_models(conn, SETTINGS)["invalidated_rows"] == 0


def test_legacy_schema_adds_derived_quantity_columns_only(pipeline_runner):
    conn = old_snapshot(pipeline_runner)
    initial = preserved(conn)
    conn.execute("ALTER TABLE stg_transacoes DROP COLUMN dev_quant_decimal")
    conn.execute("ALTER TABLE fato_vendas DROP COLUMN quantidade_devolvida")
    result = recalculate_purchase_models(conn, SETTINGS)
    assert result["after"]["valid_documents"] == 2
    assert preserved(conn) == initial
    assert conn.execute("SELECT quantidade_devolvida FROM fato_vendas ORDER BY source_row_id").fetchall() == [(2,), (0,), (1,), (0,)]


def test_failed_model_rebuild_rolls_back_flags_schema_models_and_quality(pipeline_runner, monkeypatch):
    conn = old_snapshot(pipeline_runner)
    conn.execute("ALTER TABLE stg_transacoes DROP COLUMN dev_quant_decimal")
    conn.execute("ALTER TABLE fato_vendas DROP COLUMN quantidade_devolvida")
    before_tables = {name: conn.execute(f"SELECT * FROM {name}").fetchall()
                     for name in ("stg_transacoes", "fato_vendas", "dim_clientes", "fato_cohort", "dq_summary")}

    def fail(connection, settings):
        connection.execute("UPDATE dim_clientes SET status_atual='BROKEN'")
        raise RuntimeError("falha sintética durante rebuild")

    monkeypatch.setattr("customer_intelligence.return_rebuild.build_models", fail)
    with pytest.raises(RuntimeError, match="sintética"):
        recalculate_purchase_models(conn, SETTINGS)
    for name, rows in before_tables.items():
        assert conn.execute(f"SELECT * FROM {name}").fetchall() == rows
    # Conexão permanece utilizável depois de rollback.
    assert conn.execute("SELECT 1").fetchone()[0] == 1


def test_quality_conflict_aborts_and_preserves_snapshot(pipeline_runner):
    conn = old_snapshot(pipeline_runner)
    conn.execute("UPDATE stg_transacoes SET data_emissao=DATE '2026-09-02' WHERE source_row_id=0")
    initial = preserved(conn)
    with pytest.raises(AssertionError):
        recalculate_purchase_models(conn, SETTINGS)
    assert preserved(conn) == initial
    assert conn.execute("SELECT count(*) FROM fato_vendas WHERE compra_valida").fetchone()[0] == 4


def test_snapshot_settings_mismatch_and_nested_transaction_are_safe(pipeline_runner):
    conn = old_snapshot(pipeline_runner)
    initial = preserved(conn)
    with pytest.raises(ValueError, match="snapshot"):
        recalculate_purchase_models(conn, SETTINGS.model_copy(update={"reference_date": date(2026, 10, 23)}))
    assert preserved(conn) == initial
    conn.execute("BEGIN")
    conn.execute("UPDATE fato_vendas SET compra_valida=false WHERE source_row_id=0")
    with pytest.raises(Exception, match="transaction"):
        recalculate_purchase_models(conn, SETTINGS)
    conn.execute("ROLLBACK")
    assert conn.execute("SELECT count(*) FROM fato_vendas WHERE compra_valida").fetchone()[0] == 4
