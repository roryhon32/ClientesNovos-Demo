"""Executa exclusivamente o gerador interno e publica artefatos locais sintéticos."""
from __future__ import annotations

import argparse
from datetime import date
import json
import logging
from pathlib import Path

from customer_intelligence.config.settings import Settings
from customer_intelligence.metrics import Analytics
from customer_intelligence.pipeline import SYNTHETIC_ROOT, run_pipeline
from customer_intelligence.synthetic import synthetic_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-date", type=date.fromisoformat, default=date(2026, 10, 22))
    parser.add_argument("--customers", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--persist", action="store_true", help="Grava data/synthetic/customer_intelligence.duckdb")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Settings(reference_date=args.reference_date)
    dataset = synthetic_dataset(seed=args.seed, customers=args.customers, reference_date=args.reference_date)
    database = SYNTHETIC_ROOT / "customer_intelligence.duckdb" if args.persist else ":memory:"
    with run_pipeline(dataset, settings, database) as result:
        analytics = Analytics(result.connection)
        tables = ("dim_clientes", "fato_vendas", "fato_clientes_mensal", "fato_aquisicao", "fato_cohort", "fato_transicoes")
        lines = ["# Validação da execução sintética", "",
                 f"Referência: {args.reference_date}; seed: {args.seed}; clientes solicitados: {args.customers}.",
                 "", "Nenhuma base real foi lida. Fonte: gerador interno em memória.", "",
                 f"Gate de qualidade: {'APROVADO' if result.quality.passed else 'REPROVADO'}.", "",
                 "| Tabela | Linhas |", "| --- | ---: |"]
        for table in tables:
            count = result.connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            lines.append(f"| {table} | {count} |")
        lines += ["", "## Qualidade", "", "| Indicador | Resultado |", "| --- | ---: |"]
        lines += [f"| {key} | {value} |" for key, value in result.quality.counts.items()]
        lines += ["", "| Severidade | Código | Ocorrências |", "| --- | --- | ---: |"]
        lines += [f"| {issue.severity} | {issue.code} | {issue.count} |" for issue in result.quality.issues]
        lines += ["", "## Distribuição do status atual", "", "| Status | Clientes |", "| --- | ---: |"]
        statuses = result.connection.execute("SELECT status_atual,count(*) FROM dim_clientes GROUP BY status_atual ORDER BY status_atual").fetchall()
        lines += [f"| {status} | {count} |" for status, count in statuses]
        lines += ["", "## Etapas", "", "| Etapa | Segundos |", "| --- | ---: |"]
        lines += [f"| {stage} | {seconds:.6f} |" for stage, seconds in result.timings.items()]
        lines += ["", "Reconciliação automática: contagens e somas fonte/fato, join com dimensão, "
                  "unicidade dos seis grãos e reconciliações mensais/cohort (quando disponíveis).", "",
                  "As advertências são defeitos sintéticos intencionais, preservados nos fatos. "
                  "Totais com componente financeiro ausente são NULL, acompanhados por contagens de completude.", "",
                  "Retenção após 90/180 dias segue pendente de definição da janela; recompra acumulada é calculada.", ""]
        output = Path(__file__).resolve().parents[1] / "docs" / "synthetic_run.md"
        output.parent.mkdir(exist_ok=True)
        output.write_text("\n".join(lines), encoding="utf-8")
        print(f"Pipeline concluído: {dataset.frame.height} itens; qualidade={result.quality.passed}")
        print(json.dumps(analytics.lifecycle_summary().select("status_cliente", "clientes").to_dicts(), ensure_ascii=True))
        print(f"Relatório: {output}")
        print(f"Banco: {database}")


if __name__ == "__main__":
    main()
