from datetime import date
from decimal import Decimal
import pytest

from conftest import query, source_row


def test_multi_item_documents_are_one_purchase(pipeline_runner):
    result = pipeline_runner([
        source_row(item="1"),
        source_row(item="2", **{"Valor Contábil": "500", "Fat. Líquido": "425", "Margem Bruta (R$)": "127.5"}),
    ])
    customer = query(result, "SELECT * FROM dim_clientes")[0]
    assert customer["quantidade_compras_validas"] == 1
    assert customer["data_segunda_compra"] is None
    assert query(result, "SELECT COUNT(DISTINCT identificador_documento) docs, COUNT(DISTINCT identificador_item) items FROM fato_vendas")[0] == {"docs": 1, "items": 2}
    acquisition = query(result, "SELECT * FROM fato_aquisicao")[0]
    assert acquisition["valor_primeira_compra"] == Decimal("1500")


def test_first_day_bundle_keeps_simultaneous_bu_and_seller(pipeline_runner):
    result = pipeline_runner([
        source_row(document="SYN-A", **{"Business Unit": "BU SINTETICA A"}),
        source_row(document="SYN-B", **{"Business Unit": "BU SINTETICA B", "Nome Vendedor": "VENDEDOR SINTETICO B"}),
    ])
    acquisition = query(result, "SELECT * FROM fato_aquisicao")[0]
    assert acquisition["valor_primeira_compra"] == Decimal("2000")
    assert acquisition["faturamento_liquido_primeira_compra"] == Decimal("1700")
    assert acquisition["impostos_primeira_compra"] == Decimal("300")
    assert acquisition["bu_aquisicao"] is None
    assert acquisition["vendedor_aquisicao"] is None
    customer = query(result, "SELECT * FROM dim_clientes")[0]
    assert customer["quantidade_compras_validas"] == 2
    assert customer["dias_ate_segunda_compra"] == 0


def test_same_root_branch_and_bu_changes_do_not_create_acquisition(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2026, 1, 10)),
        source_row(emitted=date(2026, 2, 10), branch="0002", document="SYN-B", **{
            "Business Unit": "BU SINTETICA B", "Nome Vendedor": "VENDEDOR SINTETICO B",
        }),
    ])
    customer = query(result, "SELECT * FROM dim_clientes")[0]
    assert customer["raiz_cnpj"] == "00000001"
    assert customer["data_primeira_compra"] == date(2026, 1, 10)
    assert customer["data_segunda_compra"] == date(2026, 2, 10)
    assert customer["dias_ate_segunda_compra"] == 31
    assert query(result, "SELECT COUNT(*) n FROM fato_aquisicao")[0]["n"] == 1
    assert query(result, "SELECT COUNT(*) n FROM dim_clientes")[0]["n"] == 1


def test_first_observed_purchase_does_not_use_source_current_label(pipeline_runner):
    result = pipeline_runner([
        source_row(emitted=date(2020, 1, 12), **{"Cliente Novo": "INATIVO"}),
        source_row(emitted=date(2026, 10, 12), document="SYN-B", **{"Cliente Novo": "INATIVO"}),
    ])
    acquired = query(result, "SELECT data_aquisicao FROM fato_aquisicao")[0]
    assert acquired["data_aquisicao"] == date(2020, 1, 12)
    assert query(result, "SELECT status_historico FROM fato_clientes_mensal WHERE mes_referencia=DATE '2020-01-01'")[0]["status_historico"] == "NOVO"


def test_document_key_cannot_include_item(pipeline_runner):
    rows = [source_row(item="1"), source_row(item="2")]
    default = pipeline_runner(rows)
    with pytest.raises(ValueError, match="Chave documental oficial"):
        pipeline_runner(rows, document_key_columns=("filial", "num_docto", "cod_cliente", "empresa", "item"))
    assert query(default, "SELECT quantidade_compras_validas n FROM dim_clientes")[0]["n"] == 1
