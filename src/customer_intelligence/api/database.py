from contextlib import contextmanager
from threading import Timer
from time import monotonic

import duckdb

from .config import APISettings

TABLES = ("dim_clientes", "fato_vendas", "fato_clientes_mensal", "fato_aquisicao", "fato_cohort", "fato_transicoes")


class QueryTimeout(RuntimeError):
    pass


@contextmanager
def connection(settings: APISettings):
    path = settings.authorized_path()
    conn = duckdb.connect(str(path), read_only=True, config={
        "enable_external_access": False, "memory_limit": f"{settings.memory_limit_mb}MB", "threads": 2,
    })
    start = monotonic()
    timer = Timer(settings.query_timeout_seconds, conn.interrupt)
    timer.daemon = True
    timer.start()
    try:
        yield conn
        if monotonic() - start > settings.query_timeout_seconds:
            raise QueryTimeout()
    finally:
        timer.cancel()
        timer.join()
        conn.close()


def readiness(conn):
    # Seis modelos e contratos mínimos, sem DDL/DML ou leitura dos fatos completos.
    columns = {
        "dim_clientes": "raiz_cnpj,data_primeira_compra,status_atual",
        "fato_vendas": "identificador_documento,faturamento_contabil,faturamento_liquido,margem_bruta_valor",
        "fato_clientes_mensal": "raiz_cnpj,mes_referencia,status_historico",
        "fato_aquisicao": "raiz_cnpj,data_aquisicao,business_units_aquisicao",
        "fato_cohort": "safra_aquisicao,meses_desde_aquisicao,taxa_retencao",
        "fato_transicoes": "raiz_cnpj,mes_referencia,status_anterior,status_atual",
    }
    for table, projection in columns.items():
        conn.execute(f"SELECT {projection} FROM {table} LIMIT 0")
    metadata = conn.execute("SELECT synthetic,reference_date FROM pipeline_metadata").fetchall()
    if len(metadata) != 1 or metadata[0][0] is not True or metadata[0][1] is None:
        raise RuntimeError("Snapshot não autorizado")
    if conn.execute("SELECT count(*) FROM dq_issues WHERE severity='error' AND occurrences>0").fetchone()[0]:
        raise RuntimeError("Snapshot reprovado")
