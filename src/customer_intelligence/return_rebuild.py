"""Recalcula validade e modelos de uma conexão já aberta, sem importar arquivos.

A chamada é explícita e transacional. Este módulo não descobre bancos, não abre
planilhas e não modifica as colunas financeiras ou a identidade documental.
"""
from __future__ import annotations

from uuid import uuid4

import duckdb

from customer_intelligence.config.settings import Settings
from customer_intelligence.models import build_models
from customer_intelligence.transformations.normalization import decimal_expression
from customer_intelligence.transformations.valid_sales import valid_purchase_expression
from customer_intelligence.validation.quality_checks import (
    QualityError, persist_quality, quality_report, reconcile_models,
)


def _quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _columns(conn: duckdb.DuckDBPyConnection, table: str) -> list[str]:
    return [row[0] for row in conn.execute(f"DESCRIBE {_quoted(table)}").fetchall()]


def _fingerprint(conn, table, columns):
    """Compara o multiconjunto preservado, incluindo IDs, nulos e decimais."""
    values = ",".join(_quoted(column) for column in columns)
    return conn.execute(f"""SELECT count(*),sum(hash({values})::HUGEINT),
        bit_xor(hash({values})) FROM {_quoted(table)}""").fetchone()


def _counts(conn):
    rows, valid_rows, documents = conn.execute("""SELECT count(*),
        count(*) FILTER (WHERE compra_valida),
        count(DISTINCT identificador_documento) FILTER (WHERE compra_valida)
        FROM fato_vendas""").fetchone()
    customers, purchases = conn.execute("""SELECT count(*),
        coalesce(sum(quantidade_compras_validas),0)::BIGINT FROM dim_clientes""").fetchone()
    return {"fact_rows": rows, "valid_rows": valid_rows, "valid_documents": documents,
            "customers": customers, "customer_valid_purchases": purchases}


def recalculate_purchase_models(conn: duckdb.DuckDBPyConnection, settings: Settings) -> dict:
    """Aplica a regra DEV na staging existente e reconstrói os modelos juntos.

    O chamador fornece a conexão autorizada e as mesmas políticas do snapshot.
    A função possui a transação; não deve ser chamada dentro de outra transação.
    Qualquer falha restaura flags, schema, modelos e qualidade anteriores.
    O retorno contém somente contagens e rótulos de status, sem nomes/raízes.
    """
    # BEGIN fora do try: uma transação já aberta pelo chamador permanece intacta.
    conn.execute("BEGIN TRANSACTION")
    registration = "_ci_return_rebuild_" + uuid4().hex
    registered = False
    try:
        metadata = conn.execute("""SELECT reference_date,history_start,
            acquisition_policy,special_status_policy FROM pipeline_metadata""").fetchall()
        expected = (settings.reference_date, settings.history_start,
                    settings.acquisition_policy, settings.special_status_policy)
        if metadata != [expected]:
            raise ValueError("Configuração difere do snapshot; recálculo recusado")

        staging_columns = _columns(conn, "stg_transacoes")
        fact_columns = _columns(conn, "fato_vendas")
        necessary = {"source_row_id", "status", "origem", "fat_quant_decimal",
                     "dev_quant", "valor_contabil_decimal", "data_emissao"}
        if not necessary <= set(staging_columns):
            raise ValueError("Staging não contém as colunas necessárias à regra de devolução")
        for table in ("stg_transacoes", "fato_vendas"):
            unique = conn.execute(f"""SELECT count(*)=count(DISTINCT source_row_id)
                AND count(*)=count(source_row_id) FROM {_quoted(table)}""").fetchone()[0]
            if not unique:
                raise ValueError("source_row_id precisa ser único e completo")
        mismatches = conn.execute("""SELECT count(*) FROM stg_transacoes s
            FULL OUTER JOIN fato_vendas v USING(source_row_id)
            WHERE s.source_row_id IS NULL OR v.source_row_id IS NULL""").fetchone()[0]
        if mismatches:
            raise ValueError("Staging e fato precisam preservar as mesmas linhas")

        preserved = {
            "stg_transacoes": [c for c in staging_columns
                               if c not in {"dev_quant_decimal", "criterio_compra_valida"}],
            "fato_vendas": [c for c in fact_columns
                            if c not in {"quantidade_devolvida", "criterios_comerciais_validos", "compra_valida"}],
        }
        fingerprints = {table: _fingerprint(conn, table, columns)
                        for table, columns in preserved.items()}
        before = _counts(conn)
        conn.execute("""CREATE OR REPLACE TEMP TABLE _ci_return_previous_status AS
            SELECT raiz_cnpj,status_atual FROM dim_clientes""")
        conn.execute("""CREATE OR REPLACE TEMP TABLE _ci_return_previous_validity AS
            SELECT source_row_id,compra_valida FROM fato_vendas""")

        # Somente os campos necessários à expressão central são materializados.
        frame = conn.execute("""SELECT source_row_id,status,origem,fat_quant_decimal,
            dev_quant,valor_contabil_decimal,data_emissao FROM stg_transacoes""").pl()
        changes = frame.with_columns(decimal_expression("dev_quant")).with_columns(
            valid_purchase_expression(settings.reference_date).alias("criterio_compra_valida")
        ).select("source_row_id", "dev_quant_decimal", "criterio_compra_valida")
        conn.register(registration, changes.to_arrow())
        registered = True
        conn.execute("ALTER TABLE stg_transacoes ADD COLUMN IF NOT EXISTS dev_quant_decimal DECIMAL(24,6)")
        conn.execute("ALTER TABLE fato_vendas ADD COLUMN IF NOT EXISTS quantidade_devolvida DECIMAL(24,6)")
        conn.execute(f"""UPDATE stg_transacoes AS s SET
            dev_quant_decimal=r.dev_quant_decimal,criterio_compra_valida=r.criterio_compra_valida
            FROM {_quoted(registration)} r WHERE s.source_row_id=r.source_row_id""")
        conn.execute("""UPDATE fato_vendas AS v SET quantidade_devolvida=s.dev_quant_decimal,
            criterios_comerciais_validos=s.criterio_compra_valida,
            compra_valida=s.criterio_compra_valida AND v.raiz_cnpj IS NOT NULL
                AND v.identificador_documento IS NOT NULL AND v.data_emissao>=?
            FROM stg_transacoes s WHERE v.source_row_id=s.source_row_id""", [settings.history_start])

        report = quality_report(conn)
        if settings.fail_on_blocking_quality and not report.passed:
            raise QualityError(report)
        build_models(conn, settings)
        reconcile_models(conn)
        persist_quality(conn, report)
        for table, columns in preserved.items():
            if _fingerprint(conn, table, columns) != fingerprints[table]:
                raise AssertionError("Recálculo alterou linhas ou atributos que deveriam ser preservados")

        invalidated, validated = conn.execute("""SELECT
            count(*) FILTER (WHERE p.compra_valida AND NOT v.compra_valida),
            count(*) FILTER (WHERE NOT p.compra_valida AND v.compra_valida)
            FROM fato_vendas v JOIN _ci_return_previous_validity p USING(source_row_id)""").fetchone()
        status_changes = conn.execute("""SELECT p.status_atual AS previous_status,
            d.status_atual AS status,count(*) AS customers
            FROM dim_clientes d JOIN _ci_return_previous_status p USING(raiz_cnpj)
            WHERE d.status_atual IS DISTINCT FROM p.status_atual
            GROUP BY p.status_atual,d.status_atual ORDER BY previous_status,status""").fetchall()
        summary = {"before": before, "after": _counts(conn),
                   "invalidated_rows": invalidated, "validated_rows": validated,
                   "status_changes": [{"previous_status": old, "status": new, "customers": count}
                                      for old, new, count in status_changes],
                   "financials_and_identity_preserved": True,
                   "quality_passed": report.passed,
                   "quality_issues": [{"code": x.code, "severity": x.severity, "count": x.count}
                                      for x in report.issues],
                   "document_conflicts": len(report.document_conflicts)}
        conn.execute("DROP TABLE _ci_return_previous_status")
        conn.execute("DROP TABLE _ci_return_previous_validity")
        conn.execute("COMMIT")
        return summary
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        if registered:
            conn.unregister(registration)
