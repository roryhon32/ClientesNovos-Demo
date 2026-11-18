"""Deterministic, entirely fabricated source data; never reads a business source.

Identifiers are generated mathematically in a zero-prefixed namespace. A valid
checksum is a structural test feature, not a claim of registration or existence.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from random import Random

import polars as pl

from customer_intelligence.config.columns import COLUMN_MAP
from customer_intelligence.ingestion.source_adapter import SyntheticDataset


def synthetic_cnpj(root: str, branch: str = "0001") -> str:
    """Generate checksum digits for an explicitly fabricated eight-digit root."""
    if len(root) != 8 or not root.isascii() or not root.isdigit():
        raise ValueError("Synthetic root must contain exactly eight ASCII digits")
    if len(branch) != 4 or not branch.isascii() or not branch.isdigit():
        raise ValueError("Synthetic branch must contain exactly four ASCII digits")
    base = root + branch
    for weights in (
        (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2),
        (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2),
    ):
        remainder = sum(int(digit) * weight for digit, weight in zip(base, weights)) % 11
        base += str(0 if remainder < 2 else 11 - remainder)
    return base


def _money(value: Decimal | int) -> str:
    return format(Decimal(value).quantize(Decimal("0.000001")), "f")


def synthetic_dataset(
    seed: int = 42,
    customers: int = 100,
    reference_date: date = date(2026, 10, 22),
) -> SyntheticDataset:
    """Generate original-name, text-typed source items without external input.

    The first profiles exercise observed history, lifecycle boundaries, same-day
    documents, branches and reactivation. Additional profiles vary reproducibly.
    Deliberately malformed rows are retained for data-quality reconciliation.
    ``customers`` counts fabricated valid roots, not source rows or documents.
    """
    if not 1 <= customers <= 999_999:
        raise ValueError("customers must be between 1 and 999999")
    history_start = date(2020, 1, 1)
    if reference_date < history_start + timedelta(days=400):
        raise ValueError("reference_date must allow at least 400 observed history days")
    rng = Random(seed)
    rows: list[dict[str, str | None]] = []
    document_counter = 0

    def add_document(
        customer: int,
        emitted: date,
        *,
        items: int = 1,
        branch: str = "0001",
        bu: str | None = None,
        seller: str | None = None,
        status: str = "FATURADO",
        revenue: Decimal | None = None,
    ) -> list[dict[str, str | None]]:
        nonlocal document_counter
        document_counter += 1
        root = f"{customer:08d}"
        identifier = synthetic_cnpj(root, branch)
        emitted_rows = []
        for item in range(1, items + 1):
            gross = revenue if revenue is not None else Decimal(rng.randint(1000, 300_000)) / 100
            net = gross * Decimal("0.85")
            margin = net * Decimal("0.30")
            row: dict[str, str | None] = dict.fromkeys(COLUMN_MAP)
            row.update({
                "CONCATENADO": f"SYNTHETIC-{document_counter}-{item}",
                "MONTH": str(emitted.month),
                "Filial": branch,
                "Mês/Ano": emitted.strftime("%m/%Y"),
                "Origem": "Margem Bruta por NF",
                "Emissão": emitted.isoformat(),
                "Num. Docto.": f"SYN-{document_counter:010d}",
                "Série": "SYN",
                "Empresa": "EMPRESA SINTETICA",
                "Cód. Cliente": f"SYN-{customer:08d}-{branch}",
                "Nome Cliente": f"CLIENTE SINTETICO {customer:08d}",
                "CNPJ/CPF": identifier,
                "CNPJ Aj.": identifier,
                "RAIZ CNPJ": root,
                "Estado": ("SP", "MG", "PR")[customer % 3],
                "Município": f"MUNICIPIO SINTETICO {customer % 4}",
                "Cód. Vend.": f"SYN-V{customer % 5}",
                "Nome Vendedor": seller or f"VENDEDOR SINTETICO {customer % 5}",
                "Item": str(item),
                "Cód. Prod.": f"SYN-P{item % 7}",
                "Desc. Produto": f"PRODUTO SINTETICO {item % 7}",
                "Cod. Familia": f"SYN-F{item % 3}",
                "Desc. Familia": f"FAMILIA SINTETICA {item % 3}",
                "Familia Ajustada": f"FAMILIA SINTETICA {item % 3}",
                "Subfamília": f"SUBFAMILIA SINTETICA {item % 4}",
                "Business Unit": bu or ("BU SINTETICA A", "BU SINTETICA B", "BU SINTETICA C")[customer % 3],
                "Canal de Venda": ("DIRETO SINTETICO", "ONLINE SINTETICO")[customer % 2],
                "FAT - Quant.": "1" if gross >= 0 else "-1",
                "DEV - Quant.": "0" if gross >= 0 else "1",
                "LIQ - Quant.": "1" if gross >= 0 else "-1",
                "Valor Contábil": _money(gross),
                "Fat. Líquido": _money(net),
                "Margem Bruta (R$)": _money(margin),
                "Margem Bruta (%)": "30",
                "Valor Contábil Ajustado": _money(gross * 2),
                "Fat. Líquido Ajustado": _money(net * 2),
                "Margem Bruta Ajustada": _money(margin * 2),
                "Vlr.ICMS": "99999.0000",
                "Vlr.IPI": "99999.0000",
                "Status": status,
                "Cliente Novo": "RECORRENTE",
                "ECOMERCE": "SYNTHETIC-UNVALIDATED-A",
                "E-COMERCE": "SYNTHETIC-UNVALIDATED-B",
                "Ano": str(emitted.year),
                "Mês": str(emitted.month),
                "DIA": str(emitted.day),
            })
            rows.append(row)
            emitted_rows.append(row)
        return emitted_rows

    for customer in range(1, customers + 1):
        profile = (customer - 1) % 12
        if profile == 0:
            dates = [history_start, history_start + timedelta(days=31)]
        elif profile == 1:
            dates = [reference_date.replace(day=1), reference_date]
        elif profile in (2, 3, 4, 5):
            dates = [reference_date - timedelta(days=(179, 180, 364, 365)[profile - 2])]
        elif profile == 6:
            dates = [history_start + timedelta(days=3), reference_date - timedelta(days=4)]
        elif profile == 7:
            dates = [reference_date - timedelta(days=60)]
        elif profile == 8:
            dates = [reference_date - timedelta(days=2)]
        elif profile == 9:
            dates = [reference_date - timedelta(days=100)] * 2
        elif profile == 10:
            dates = [reference_date - timedelta(days=250), reference_date - timedelta(days=30)]
        else:
            acquisition = history_start + timedelta(days=rng.randrange((reference_date - history_start).days - 181))
            dates = [acquisition, acquisition + timedelta(days=30), acquisition + timedelta(days=181)]
        for index, emitted in enumerate(dates):
            add_document(
                customer, emitted,
                items=2 if index == 0 else 1,
                branch="0002" if index > 0 else "0001",
                seller=f"VENDEDOR SINTETICO {(customer + index) % 5}",
                bu="BU SINTETICA B" if index else "BU SINTETICA A",
                status="CANCELADO" if profile == 7 else "  faturado  ",
            )

    # Independent defects intentionally stress quality reporting, while retaining
    # their source amounts for reconciliation and explicit purchase eligibility.
    defect_date = reference_date - timedelta(days=10)
    add_document(1, defect_date, revenue=Decimal("-100.00"))
    zero_net = add_document(1, defect_date)[0]
    zero_net["Fat. Líquido"] = "0.0000"
    zero_net["Margem Bruta (R$)"] = "-10.0000"
    zero_net["Margem Bruta (%)"] = None
    null_money = add_document(1, defect_date)[0]
    null_money["Valor Contábil"] = None
    null_money["Fat. Líquido"] = None
    null_money["Margem Bruta (R$)"] = None
    missing_identity = add_document(1, defect_date)[0]
    missing_identity["RAIZ CNPJ"] = None
    missing_identity["CNPJ/CPF"] = None
    missing_identity["CNPJ Aj."] = None
    invalid_identity = add_document(1, defect_date)[0]
    invalid_identity["RAIZ CNPJ"] = None
    invalid_identity["CNPJ/CPF"] = "SYNTHETIC-INVALID-CNPJ"
    invalid_identity["CNPJ Aj."] = None
    invalid_date = add_document(1, defect_date)[0]
    invalid_date["Emissão"] = "2026-02-31"
    missing_labels = add_document(1, defect_date)[0]
    missing_labels["Business Unit"] = None
    missing_labels["Nome Vendedor"] = None
    add_document(1, reference_date + timedelta(days=10))
    # A second BU in the same first-day bundle is explicit, never a tie-break.
    add_document(1, history_start, bu="BU SINTETICA C")

    frame = pl.DataFrame(rows, schema={column: pl.String for column in COLUMN_MAP})
    return SyntheticDataset(frame=frame, seed=seed, label="generated-synthetic-identities")
