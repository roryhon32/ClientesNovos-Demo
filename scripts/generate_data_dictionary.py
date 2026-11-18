"""Gera documentação a partir do contrato e de um banco inteiramente sintético."""
from datetime import date
from pathlib import Path

from customer_intelligence.config.columns import COLUMN_MAP
from customer_intelligence.config.settings import Settings
from customer_intelligence.pipeline import run_pipeline
from customer_intelligence.schemas.source_schema import REQUIRED_COLUMNS
from customer_intelligence.synthetic import synthetic_dataset


def main() -> None:
    lines = ["# Dicionário de dados", "", "## Contrato de origem", "",
             "129 nomes originais preservados em `transacoes_origem`. O mapeamento é bijetivo e "
             "não modifica arquivos externos. Identificadores devem chegar como texto; a carga sintética "
             "usa strings e NULL. Colunas opcionais ausentes são adicionadas como NULL e continuam distintas.", "",
             "| Nome original | Alias interno | Presença no contrato mínimo |", "| --- | --- | --- |"]
    for original, internal in COLUMN_MAP.items():
        required = "Obrigatória (valor pode ser NULL auditável)" if original in REQUIRED_COLUMNS else "Opcional"
        lines.append(f"| {original} | `{internal}` | {required} |")
    lines += ["", "## Linhagem principal", "",
              "| Medida/atributo analítico | Origem/regra |", "| --- | --- |",
              "| faturamento_contabil | Valor Contábil |",
              "| faturamento_liquido | Fat. Líquido |",
              "| impostos | Contábil − líquido |",
              "| margem_bruta_valor | Margem Bruta (R$), sem recálculo de custo |",
              "| margem_bruta_percentual | 100 × margem / líquido, recálculo no agrupamento |",
              "| percentual_impostos | 100 × impostos / contábil |",
              "| vendedor | Nome Vendedor, sem substituição por vendedor ajustado |",
              "| familia | Familia Ajustada, campo explicitamente identificado como família analítica |",
              "| canal_venda | Canal de Venda |",
              "| business_unit | Business Unit, sem inferir prioridade entre outras BUs |",
              "| nome_cliente_representativo | Menor nome conhecido em ordem lexicográfica, rótulo técnico |",
              "| raiz_cnpj | Consenso dos identificadores normalizados, sem CPF |",
              "| identificador_documento | SHA-256 de Filial + Num. Docto. + Cód. Cliente + Empresa; NULL se incompleta |",
              "| identificador_item | SHA-256 do fingerprint + posição da linha na carga |",
              "| chave_item_candidata | SHA-256 de documento + Item, utilizada para auditoria |",
              "| quantidade_devolvida | DEV - Quant. decimal; quantidade positiva exclui compra, sem remover financeiros |",
              "| compra_valida | Critérios comerciais, DEV não positivo ou ausente + identidade/documento completos + período declarado |",
              "| cliente_status_origem | Cliente Novo preservado, sem uso isolado para aquisição histórica |", "",
              "## Modelos materializados", "",
              "Datas de referência e de aquisição são DATE; `safra_aquisicao` usa YYYY-MM; "
              "`mes_referencia` e `mes_aquisicao` representam o primeiro dia do mês. "
              "Taxas usam a unidade percentual (0–100 quando aplicável). "
              "Medidas monetárias são decimais; percentuais não são somáveis. "
              "Lists VARCHAR[] preservam conjuntos de atribuição sem selecionar um responsável.", ""]
    grains = {
        "dim_clientes": "Uma linha por raiz CNPJ identificável no histórico considerado.",
        "fato_vendas": "Uma linha por item de origem, incluindo inelegíveis e inconsistentes.",
        "fato_clientes_mensal": "Uma linha por raiz e mês, inclusive meses sem movimento.",
        "fato_aquisicao": "Uma linha por raiz adquirida; todos os documentos válidos da primeira data.",
        "fato_cohort": "Uma linha por safra e mês relativo de acompanhamento (M0+).",
        "fato_transicoes": "Uma linha por raiz e mês em que ocorreu mudança de status.",
        "compras_validas": "Uma linha por raiz e documento válido distinto.",
        "reconciliacao_financeira": "Um bucket de exclusão/participação por escopo financeiro.",
        "pipeline_metadata": "Uma linha com a configuração do snapshot sintético.",
        "dq_summary": "Uma linha por indicador de qualidade.",
        "dq_issues": "Uma linha por código de ocorrência e severidade.",
        "dq_document_conflicts": "Uma linha por chave documental com atributos de cabeçalho conflitantes.",
        "dq_status_distribution": "Uma linha por escopo e classificação informada/calculada.",
    }
    with run_pipeline(synthetic_dataset(customers=20), Settings(reference_date=date(2026, 10, 22))) as result:
        available = {row[0] for row in result.connection.execute("SHOW TABLES").fetchall()}
        for table, grain in grains.items():
            if table not in available:
                continue
            lines += [f"### {table}", "", grain, "", "| Campo | Tipo DuckDB |", "| --- | --- |"]
            for name, dtype, *_ in result.connection.execute(f"DESCRIBE {table}").fetchall():
                lines.append(f"| {name} | {dtype} |")
            lines.append("")
    lines += ["## Relacionamentos", "",
              "`dim_clientes.raiz_cnpj` é a chave única do cliente. Fatos com raiz identificada "
              "relacionam-se a ela por raiz no escopo temporal do snapshot. Linhas financeiras sem "
              "identidade válida mantêm raiz NULL, sem dimensão de desconhecidos compartilhada. "
              "Linhas só futuras/fora do histórico podem existir na fato sem dimensão neste snapshot; "
              "consultas de financeiro usam LEFT JOIN. Aquisição é 1:0/1 com dimensão. Mensal "
              "é 1:N; transições são subconjunto dos meses; cohort agrega safras do mensal.", "",
              "Campos auxiliares de completude, conjuntos de aquisição e contagens permitem distinguir "
              "zero conhecido, ausência de compra, informação faltante e período ainda incompleto.", ""]
    output = Path(__file__).resolve().parents[1] / "docs" / "data_dictionary.md"
    output.write_text("\n".join(lines), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
