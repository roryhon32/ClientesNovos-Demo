from datetime import date
from decimal import Decimal

import polars as pl
import pytest

from customer_intelligence.config.columns import COLUMN_MAP
from customer_intelligence.config.settings import Settings
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.synthetic import synthetic_cnpj, synthetic_dataset

from conftest import query


def test_generator_is_reproducible_with_original_contract():
    first = synthetic_dataset(seed=42, customers=24)
    second = synthetic_dataset(seed=42, customers=24)
    other = synthetic_dataset(seed=43, customers=24)
    assert first.frame.equals(second.frame)
    assert not first.frame.equals(other.frame)
    assert first.frame.columns == list(COLUMN_MAP)
    assert all(dtype == pl.String for dtype in first.frame.schema.values())
    assert first.frame["Nome Cliente"].str.starts_with("CLIENTE SINTETICO ").all()
    assert first.frame["Num. Docto."].str.starts_with("SYN-").all()
    assert first.frame["Emissão"].min() == "2020-01-01"


@pytest.mark.parametrize("root,branch", [("abc", "0001"), ("00000001", "1"), ("0000000x", "0001")])
def test_generated_identifiers_require_text_structure(root, branch):
    with pytest.raises(ValueError):
        synthetic_cnpj(root, branch)


def test_all_six_tables_respect_their_grain_and_reconcile():
    dataset = synthetic_dataset(customers=24)
    result = run_pipeline(dataset, Settings(
        reference_date=date(2026, 10, 22), acquisition_policy="first_day_bundle",
        special_status_policy="preserve_without_purchase",
    ))
    try:
        keys = {
            "dim_clientes": "raiz_cnpj",
            "fato_vendas": "identificador_item",
            "fato_clientes_mensal": "(raiz_cnpj,mes_referencia)",
            "fato_aquisicao": "raiz_cnpj",
            "fato_cohort": "(safra_aquisicao,meses_desde_aquisicao)",
            "fato_transicoes": "(raiz_cnpj,mes_referencia)",
        }
        for table, key in keys.items():
            row = query(result, f"SELECT COUNT(*) n, COUNT(DISTINCT {key}) unique_n FROM {table}")[0]
            assert row["n"] == row["unique_n"], table
        assert query(result, "SELECT COUNT(*) n FROM fato_vendas")[0]["n"] == dataset.frame.height
        assert query(result, "SELECT COUNT(*) n FROM dim_clientes")[0]["n"] == 24
        for source, target in (
            ("Valor Contábil", "faturamento_contabil"),
            ("Fat. Líquido", "faturamento_liquido"),
            ("Margem Bruta (R$)", "margem_bruta_valor"),
        ):
            expected = sum((Decimal(value) for value in dataset.frame[source] if value is not None), Decimal(0))
            actual = query(result, f"SELECT SUM({target}) amount FROM fato_vendas")[0]["amount"]
            assert actual == expected
        assert result.quality.passed
        assert any(issue.severity == "warning" for issue in result.quality.issues)
        assert all(elapsed >= 0 for elapsed in result.timings.values())
    finally:
        result.connection.close()
