"""Somente regras confirmadas no contrato; decisões abertas ficam em Settings."""

VALID_STATUS = "FATURADO"
VALID_ORIGIN = "MARGEM BRUTA POR NF"
RISK_DAYS = 180
INACTIVE_DAYS = 365
REPURCHASE_WINDOWS = (30, 60, 90, 180)
MONEY_COLUMNS = ("valor_contabil", "fat_liquido", "margem_bruta_valor")
