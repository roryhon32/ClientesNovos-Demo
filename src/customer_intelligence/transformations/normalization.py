import polars as pl

from customer_intelligence.config.columns import COLUMN_MAP
from customer_intelligence.config.business_rules import MONEY_COLUMNS

DECIMAL = pl.Decimal(precision=24, scale=6)


def decimal_expression(name: str) -> pl.Expr:
    """Conversão exata compartilhada; texto ilegível/escala excedida fica NULL."""
    return (pl.when(pl.col(name).str.contains(r"^[+-]?\d+(?:\.\d{1,6})?$"))
            .then(pl.col(name).cast(DECIMAL, strict=False)).otherwise(None)
            .alias(name + "_decimal"))


def _text(name: str) -> pl.Expr:
    return pl.col(name).cast(pl.String).str.strip_chars().str.replace_all(r"\s+", " ").replace("", None)


def _cnpj_valid(name: str) -> pl.Expr:
    col = pl.col(name)
    digits = [col.str.slice(i, 1).cast(pl.Int32, strict=False) for i in range(14)]
    v1 = 11 - pl.sum_horizontal([d * w for d, w in zip(digits[:12], (5,4,3,2,9,8,7,6,5,4,3,2))]) % 11
    v2 = 11 - pl.sum_horizontal([d * w for d, w in zip(digits[:13], (6,5,4,3,2,9,8,7,6,5,4,3,2))]) % 11
    return (col.str.contains(r"^\d{14}$") & (col != col.str.slice(0, 1).repeat_by(14).list.join(""))
            & (digits[12] == pl.when(v1 >= 10).then(0).otherwise(v1))
            & (digits[13] == pl.when(v2 >= 10).then(0).otherwise(v2))).fill_null(False)


def normalize(frame: pl.DataFrame) -> pl.DataFrame:
    """Não substitui valores monetários ausentes/ilegíveis por zero."""
    data = frame.rename(COLUMN_MAP).with_row_index("source_row_id")
    data = data.with_columns([_text(c).alias(c) for c in COLUMN_MAP.values()])
    data = data.with_columns([
        pl.col("status").str.to_uppercase(), pl.col("origem").str.to_uppercase(),
        pl.col("cliente_novo").str.to_uppercase(),
        *[pl.col(c).str.replace_all(r"[.\-/\s]", "").alias(c + "_digits")
          for c in ("cnpj_cpf", "cnpj_aj", "raiz_cnpj_origem")],
        pl.coalesce([
            pl.col("emissao").str.to_date("%Y-%m-%d", strict=False),
            pl.col("emissao").str.to_date("%d/%m/%Y", strict=False),
        ]).alias("data_emissao"),
    ])
    for name in (*MONEY_COLUMNS, "fat_quant", "dev_quant", "liq_quant"):
        # Aceita sinal e ponto decimal. Mais de 6 casas é erro, nunca truncamento.
        data = data.with_columns(decimal_expression(name))
    data = data.with_columns([
        _cnpj_valid("cnpj_cpf_digits").alias("cnpj_cpf_valido"),
        _cnpj_valid("cnpj_aj_digits").alias("cnpj_aj_valido"),
        pl.col("raiz_cnpj_origem_digits").str.contains(r"^\d{8}$")
            .fill_null(False).alias("raiz_origem_valida"),
    ])
    data = data.with_columns([
        ((pl.col("cnpj_cpf").is_not_null() & ~pl.col("cnpj_cpf_valido"))
         | (pl.col("cnpj_aj").is_not_null() & ~pl.col("cnpj_aj_valido"))
         | (pl.col("raiz_cnpj_origem").is_not_null() & ~pl.col("raiz_origem_valida")))
            .alias("identidade_invalida"),
        pl.coalesce([
            pl.when(pl.col("raiz_origem_valida")).then(pl.col("raiz_cnpj_origem_digits")),
            pl.when(pl.col("cnpj_cpf_valido")).then(pl.col("cnpj_cpf_digits").str.slice(0, 8)),
            pl.when(pl.col("cnpj_aj_valido")).then(pl.col("cnpj_aj_digits").str.slice(0, 8)),
        ]).alias("raiz_candidata"),
    ])
    data = data.with_columns([
        ((pl.col("cnpj_cpf_valido") & (pl.col("cnpj_cpf_digits").str.slice(0, 8) != pl.col("raiz_candidata")))
         | (pl.col("cnpj_aj_valido") & (pl.col("cnpj_aj_digits").str.slice(0, 8) != pl.col("raiz_candidata"))))
            .fill_null(False).alias("conflito_identidade"),
    ])
    return data.with_columns([
        pl.when(~pl.col("identidade_invalida") & ~pl.col("conflito_identidade"))
          .then(pl.col("raiz_candidata")).otherwise(None).alias("raiz_cnpj"),
    ])
