from dataclasses import asdict, dataclass, field
from typing import Literal

import duckdb


@dataclass(frozen=True)
class QualityIssue:
    code: str
    severity: Literal["error", "warning", "observation"]
    count: int
    description: str


@dataclass
class QualityReport:
    counts: dict[str, int | float | str | None]
    issues: list[QualityIssue]
    document_conflicts: list[dict] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not any(issue.severity == "error" and issue.count for issue in self.issues)

    def to_dict(self) -> dict:
        return {"passed": self.passed, "counts": self.counts, "issues": [asdict(x) for x in self.issues], "document_conflicts": self.document_conflicts}


class QualityError(ValueError):
    def __init__(self, report: QualityReport):
        self.report = report
        super().__init__("Qualidade bloqueante: " + ", ".join(x.code for x in report.issues if x.severity == "error" and x.count))


def quality_report(conn: duckdb.DuckDBPyConnection) -> QualityReport:
    summary = conn.execute("""
        SELECT count(*) AS records, count(DISTINCT raiz_cnpj) AS distinct_roots,
            count(DISTINCT identificador_documento) AS distinct_documents,
            count(*) FILTER (WHERE raiz_cnpj IS NOT NULL) AS identified_records,
            min(data_emissao)::VARCHAR AS min_date, max(data_emissao)::VARCHAR AS max_date,
            count(*) FILTER (WHERE NOT compra_valida) AS invalid_purchase_records,
            count(*) FILTER (WHERE faturamento_contabil IS NULL OR faturamento_liquido IS NULL
                OR margem_bruta_valor IS NULL) AS null_financial_records,
            count(*) FILTER (WHERE business_unit IS NULL) AS missing_bu,
            count(*) FILTER (WHERE vendedor IS NULL) AS missing_seller,
            count(*) FILTER (WHERE identificador_documento IS NULL) AS incomplete_documents
        FROM fato_vendas
    """)
    counts = dict(zip([c[0] for c in summary.description], summary.fetchone()))
    stg = conn.execute("""
        SELECT count(*) FILTER (WHERE cnpj_cpf IS NULL AND cnpj_aj IS NULL) AS missing_cnpj,
            count(*) FILTER (WHERE identidade_invalida) AS invalid_cnpj,
            count(*) FILTER (WHERE conflito_identidade) AS conflicting_identity,
            count(*) FILTER (WHERE data_emissao IS NULL) AS invalid_dates,
            count(*) FILTER (WHERE data_emissao > (SELECT reference_date FROM pipeline_metadata)) AS future_dates,
            count(*) FILTER (WHERE data_emissao < (SELECT history_start FROM pipeline_metadata)) AS before_history,
            count(*) FILTER (WHERE dev_quant IS NOT NULL AND dev_quant_decimal IS NULL)
                AS invalid_return_quantity,
            count(*) FILTER (WHERE (valor_contabil IS NOT NULL AND valor_contabil_decimal IS NULL)
                OR (fat_liquido IS NOT NULL AND fat_liquido_decimal IS NULL)
                OR (margem_bruta_valor IS NOT NULL AND margem_bruta_valor_decimal IS NULL)) AS invalid_money,
            count(*) FILTER (WHERE TRY_CAST(margem_bruta_percentual_origem AS DOUBLE) IS NOT NULL
                AND abs(TRY_CAST(margem_bruta_percentual_origem AS DOUBLE)
                    - 100.0 * margem_bruta_valor_decimal / NULLIF(fat_liquido_decimal,0)) > 0.000001)
                    AS source_margin_percent_divergences,
            count(*) FILTER (WHERE cnpj_cpf_digits ~ '^[0-9]{11}$') AS cpf_records,
            count(*) FILTER (WHERE valor_contabil_ajustado IS NOT NULL OR fat_liquido_ajustado IS NOT NULL
                OR margem_bruta_ajustada IS NOT NULL) AS adjusted_measure_records
        FROM stg_transacoes
    """)
    counts.update(zip([c[0] for c in stg.description], stg.fetchone()))
    for column, output in (("faturamento_contabil", "null_accounting"), ("faturamento_liquido", "null_net"), ("margem_bruta_valor", "null_margin")):
        counts[output] = conn.execute(f"SELECT count(*) FROM fato_vendas WHERE {column} IS NULL").fetchone()[0]
    counts["identified_clients"] = counts["distinct_roots"]
    counts["duplicate_source_rows"] = conn.execute("SELECT coalesce(sum(n-1),0) FROM (SELECT count(*) n FROM fato_vendas GROUP BY source_fingerprint HAVING count(*) > 1)").fetchone()[0]
    counts["duplicate_items"] = conn.execute("SELECT coalesce(sum(n-1),0) FROM (SELECT count(*) n FROM fato_vendas WHERE chave_item_candidata IS NOT NULL GROUP BY chave_item_candidata HAVING count(*)>1)").fetchone()[0]
    conn.execute("""CREATE OR REPLACE TABLE dq_document_conflicts AS
        WITH documents AS (
            SELECT v.identificador_documento,
                list_sort(list(v.source_row_id)) AS source_row_ids,
                list_sort(list(DISTINCT v.data_emissao::VARCHAR)) AS emission_dates,
                list_sort(list(DISTINCT v.raiz_cnpj)) AS customer_roots,
                list_sort(list(DISTINCT s.serie)) AS series,
                count(DISTINCT v.data_emissao)>1 OR
                    (count(v.data_emissao)>0 AND count(v.data_emissao)<count(*)) AS conflicting_dates,
                count(DISTINCT v.raiz_cnpj)>1 OR
                    (count(v.raiz_cnpj)>0 AND count(v.raiz_cnpj)<count(*)) AS conflicting_roots,
                count(DISTINCT s.serie)>1 AS conflicting_series
            FROM fato_vendas v JOIN stg_transacoes s USING(source_row_id)
            WHERE v.identificador_documento IS NOT NULL GROUP BY v.identificador_documento
        ) SELECT * FROM documents
          WHERE conflicting_dates OR conflicting_roots OR conflicting_series
    """)
    conflicts = conn.execute("SELECT * FROM dq_document_conflicts ORDER BY identificador_documento")
    document_conflicts = [dict(zip([c[0] for c in conflicts.description], row)) for row in conflicts.fetchall()]
    counts["ambiguous_documents"] = len(document_conflicts)
    total = counts["records"]
    counts["missing_cnpj_percent"] = 100 * counts["missing_cnpj"] / total if total else None
    counts["invalid_cnpj_percent"] = 100 * counts["invalid_cnpj"] / total if total else None
    descriptions = {
        "duplicate_source_rows": ("error", "Linhas de origem repetidas; nenhuma foi removida."),
        "duplicate_items": ("error", "Chave candidata de item repetida; validar granularidade."),
        "ambiguous_documents": ("error", "Documento com datas, raízes ou séries incompatíveis; detalhes em dq_document_conflicts."),
        "invalid_money": ("error", "Formato monetário inválido, overflow ou escala excedida; valor original preservado."),
        "missing_cnpj": ("warning", "CNPJ ausente; raiz explícita válida pode identificar cliente."),
        "invalid_cnpj": ("warning", "Identificação inválida/CPF; sem agrupamento em raiz fictícia."),
        "conflicting_identity": ("warning", "Campos de identificação discordam; raiz analítica NULL."),
        "invalid_dates": ("warning", "Data ilegível/ausente; transação retida na origem e fato."),
        "future_dates": ("observation", "Transações futuras preservadas, fora da análise na referência."),
        "before_history": ("warning", "Transações anteriores ao início declarado, fora do ciclo de vida."),
        "null_financial_records": ("warning", "Medida oficial ausente; agregados incompletos retornam NULL."),
        "missing_bu": ("warning", "BU ausente; não inferida de outros campos."),
        "missing_seller": ("warning", "Vendedor ausente; não inferido de campo ajustado."),
        "incomplete_documents": ("warning", "Chave incompleta; não conta compra nem recompra."),
        "invalid_purchase_records": ("observation", "Transação inelegível no ciclo de vida, preservada no financeiro."),
        "invalid_return_quantity": ("warning", "DEV - Quant. ilegível ou fora da precisão; linha financeira preservada, sem contar compra."),
        "source_margin_percent_divergences": ("warning", "Percentual de margem informado diverge da fórmula oficial."),
        "adjusted_measure_records": ("observation", "Medidas ajustadas preservadas no staging, sem substituir oficiais."),
    }
    issues = [QualityIssue(code, severity, int(counts[code]), description)
              for code, (severity, description) in descriptions.items() if counts[code]]
    return QualityReport(counts=counts, issues=issues, document_conflicts=document_conflicts)


def persist_quality(conn: duckdb.DuckDBPyConnection, report: QualityReport) -> None:
    """Auditoria estruturada no mesmo snapshot transacional dos modelos."""
    conn.execute("CREATE OR REPLACE TABLE dq_summary (metric VARCHAR PRIMARY KEY, value VARCHAR)")
    if report.counts:
        conn.executemany("INSERT INTO dq_summary VALUES (?, ?)", [(key, None if value is None else str(value)) for key, value in report.counts.items()])
    conn.execute("CREATE OR REPLACE TABLE dq_issues (code VARCHAR, severity VARCHAR, occurrences BIGINT, description VARCHAR)")
    if report.issues:
        conn.executemany("INSERT INTO dq_issues VALUES (?, ?, ?, ?)", [(x.code, x.severity, x.count, x.description) for x in report.issues])
    conn.execute("""CREATE OR REPLACE TABLE dq_status_distribution AS
        SELECT 'source_items' AS scope, cliente_status_origem AS status, count(*) AS occurrences
        FROM fato_vendas GROUP BY cliente_status_origem
        UNION ALL SELECT 'current_customers', status_atual, count(*) FROM dim_clientes GROUP BY status_atual
        UNION ALL SELECT 'historical_customer_months', status_historico, count(*)
        FROM fato_clientes_mensal GROUP BY status_historico""")


def reconcile_models(conn: duckdb.DuckDBPyConnection) -> None:
    """Falha se modelos de uma linha por raiz ou joins multiplicarem medidas."""
    for table, keys in (
        ("fato_vendas", "identificador_item"),
        ("dim_clientes", "raiz_cnpj"), ("fato_aquisicao", "raiz_cnpj"),
        ("fato_clientes_mensal", "raiz_cnpj,mes_referencia"),
        ("fato_cohort", "safra_aquisicao,meses_desde_aquisicao"),
        ("fato_transicoes", "raiz_cnpj,mes_referencia"),
    ):
        if conn.execute(f"SELECT count(*) FROM (SELECT {keys} FROM {table} GROUP BY {keys} HAVING count(*)>1)").fetchone()[0]:
            raise AssertionError(f"Granularidade inválida: {table}")
    original = conn.execute("SELECT count(*),sum(valor_contabil_decimal),sum(fat_liquido_decimal),sum(margem_bruta_valor_decimal) FROM stg_transacoes").fetchone()
    fact = conn.execute("SELECT count(*),sum(faturamento_contabil),sum(faturamento_liquido),sum(margem_bruta_valor) FROM fato_vendas").fetchone()
    if original != fact:
        raise AssertionError("Contagens/valores de origem não reconciliam com fato_vendas")
    mismatch = conn.execute("""SELECT count(*) FROM stg_transacoes s
        FULL OUTER JOIN fato_vendas v ON s.source_row_id=v.source_row_id
        WHERE s.source_row_id IS NULL OR v.source_row_id IS NULL
            OR s.valor_contabil_decimal IS DISTINCT FROM v.faturamento_contabil
            OR s.fat_liquido_decimal IS DISTINCT FROM v.faturamento_liquido
            OR s.margem_bruta_valor_decimal IS DISTINCT FROM v.margem_bruta_valor
            OR s.raiz_cnpj IS DISTINCT FROM v.raiz_cnpj
            OR s.data_emissao IS DISTINCT FROM v.data_emissao""").fetchone()[0]
    if mismatch:
        raise AssertionError("Valores/nulidades de origem não reconciliam por linha")
    joined = conn.execute("""SELECT count(*),sum(v.faturamento_contabil),sum(v.faturamento_liquido),sum(v.margem_bruta_valor)
        FROM fato_vendas v LEFT JOIN dim_clientes d USING(raiz_cnpj)""").fetchone()
    if joined != fact:
        raise AssertionError("Join com dimensão multiplicou valores")
