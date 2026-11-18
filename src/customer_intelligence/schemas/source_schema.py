import polars as pl

from customer_intelligence.config.columns import COLUMN_MAP

REQUIRED_COLUMNS = frozenset({
    "RAIZ CNPJ", "CNPJ/CPF", "Emissão", "Status", "Origem", "FAT - Quant.",
    "Valor Contábil", "Fat. Líquido", "Margem Bruta (R$)",
    "Filial", "Num. Docto.", "Empresa", "Cód. Cliente", "Item",
})


def validate_source(frame: pl.DataFrame) -> pl.DataFrame:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    unknown = set(frame.columns) - set(COLUMN_MAP)
    if missing:
        raise ValueError(f"Colunas obrigatórias ausentes: {sorted(missing)}")
    if unknown:
        raise ValueError(f"Colunas fora do contrato: {sorted(unknown)}")
    # Identificadores numéricos já perderam informação (zeros); não os reparar.
    for name in ("RAIZ CNPJ", "CNPJ/CPF", "CNPJ Aj.", "Num. Docto.", "Cód. Cliente"):
        if name in frame.columns and frame.schema[name] not in (pl.String, pl.Null):
            raise TypeError(f"{name} deve chegar como texto; conversão numérica é proibida")
    additions = [pl.lit(None, dtype=pl.String).alias(c) for c in COLUMN_MAP if c not in frame.columns]
    return frame.with_columns(additions).select(list(COLUMN_MAP))
