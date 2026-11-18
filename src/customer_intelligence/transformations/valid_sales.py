from datetime import date

import polars as pl

from customer_intelligence.config.business_rules import VALID_ORIGIN, VALID_STATUS


def valid_purchase_expression(reference_date: date) -> pl.Expr:
    """Critérios comerciais; identidade e documento são verificados separadamente."""
    return (
        (pl.col("status") == VALID_STATUS)
        & (pl.col("origem") == VALID_ORIGIN)
        & (pl.col("fat_quant_decimal") > 0)
        # DEV > 0 identifica devolução mesmo com FAT/contábil positivos.
        # Campo opcional ausente mantém o contrato anterior; conteúdo ilegível
        # permanece desconhecido e não autoriza uma compra.
        & (pl.col("dev_quant").is_null() | (pl.col("dev_quant_decimal") <= 0))
        & (pl.col("valor_contabil_decimal") > 0)
        & pl.col("data_emissao").is_not_null()
        & (pl.col("data_emissao") <= pl.lit(reference_date))
    ).fill_null(False)
