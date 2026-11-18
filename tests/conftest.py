from __future__ import annotations

from datetime import date
from typing import Any

import polars as pl
import pytest

from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.synthetic import synthetic_cnpj


REFERENCE = date(2026, 10, 22)


def source_row(
    root: str = "00000001",
    emitted: date | str = date(2026, 1, 10),
    document: str = "SYN-001",
    item: str = "1",
    branch: str = "0001",
    **overrides: Any,
) -> dict[str, Any]:
    cnpj = synthetic_cnpj(root, branch)
    row = {
        "RAIZ CNPJ": root, "CNPJ/CPF": cnpj, "CNPJ Aj.": cnpj,
        "Filial": branch, "Num. Docto.": document, "Série": "SYN",
        "Empresa": "EMPRESA SINTETICA", "Cód. Cliente": f"SYN-{root}-{branch}",
        "Emissão": emitted.isoformat() if isinstance(emitted, date) else emitted,
        "Nome Cliente": f"CLIENTE SINTETICO {root}",
        "Item": item, "Status": "FATURADO", "Origem": "Margem Bruta por NF",
        "FAT - Quant.": "1", "LIQ - Quant.": "1",
        "Valor Contábil": "1000.00", "Fat. Líquido": "850.00",
        "Margem Bruta (R$)": "255.00", "Margem Bruta (%)": "9999",
        "Valor Contábil Ajustado": "999999", "Fat. Líquido Ajustado": "999999",
        "Margem Bruta Ajustada": "999999", "Vlr.ICMS": "999999", "PIS": "999999",
        "Business Unit": "BU SINTETICA A", "Nome Vendedor": "VENDEDOR SINTETICO A",
        "Cliente Novo": "EM RISCO", "Cód. Prod.": f"SYN-P{item}",
        "Desc. Produto": "PRODUTO SINTETICO", "Familia Ajustada": "FAMILIA SINTETICA",
        "Subfamília": "SUBFAMILIA SINTETICA", "Canal de Venda": "DIRETO SINTETICO",
        "Estado": "SP", "Município": "MUNICIPIO SINTETICO",
    }
    row.update(overrides)
    return row


@pytest.fixture
def pipeline_runner():
    connections = []

    def run(rows: list[dict[str, Any]], **settings: Any):
        defaults = {
            "reference_date": REFERENCE,
            "acquisition_policy": "first_day_bundle",
            "special_status_policy": "preserve_without_purchase",
        }
        defaults.update(settings)
        frame = pl.DataFrame(rows, infer_schema_length=None).cast(pl.String)
        result = run_pipeline(SyntheticDataset(frame, label="pytest-entirely-generated"), Settings(**defaults))
        connections.append(result.connection)
        return result

    yield run
    for connection in connections:
        connection.close()


def query(result, sql: str, parameters: list[Any] | None = None) -> list[dict[str, Any]]:
    cursor = result.connection.execute(sql, parameters or [])
    names = [field[0] for field in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]
