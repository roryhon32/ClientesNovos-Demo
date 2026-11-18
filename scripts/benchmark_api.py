"""Mede endpoints somente no DuckDB sintético explicitamente indicado."""
import argparse
from pathlib import Path
from statistics import median
from time import perf_counter
import json

from fastapi.testclient import TestClient
from customer_intelligence.api.config import APISettings
from customer_intelligence.api.main import create_app
from customer_intelligence.api.database import connection


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',required=True)
    parser.add_argument('--repeats',type=int,default=3,choices=range(1,21))
    args=parser.parse_args()
    settings=APISettings(database_path=args.database)
    app=create_app(settings)
    with connection(settings) as conn:
        customers=conn.execute('SELECT count(*) FROM dim_clientes').fetchone()[0]
        items=conn.execute('SELECT count(*) FROM fato_vendas').fetchone()[0]
    records=[]
    with TestClient(app,base_url='http://localhost',client=('127.0.0.1',50000)) as client:
        for endpoint in ('overview','acquisition','customers','retention','cohorts?max_months=3','profitability','lifecycle','filters'):
            samples=[]
            for _ in range(args.repeats):
                start=perf_counter(); r=client.get('/api/v1/'+endpoint); samples.append(perf_counter()-start)
                if r.status_code!=200:
                    raise RuntimeError('Benchmark encontrou resposta sem sucesso')
            data=r.json()['data']
            rows=len(data) if isinstance(data,list) else len(data.get('items',[data]))
            records.append((endpoint,median(samples),rows,len(r.content)))
    lines=['# Benchmark da API sintética','',
           f'{args.repeats} execuções por endpoint via TestClient local; mediana inclui conexão, consulta, validação e JSON.',
           f'Sem isolamento de carga, sem metas ou garantia de produção. Banco sintético de {customers} clientes / {items} itens.', '',
           '| Endpoint | Mediana (s) | Linhas superiores | Bytes JSON |','| --- | ---: | ---: | ---: |']
    lines += [f'| {name} | {seconds:.6f} | {rows} | {size} |' for name,seconds,rows,size in records]
    lines+=['','Reproduzir: `python scripts/benchmark_api.py --database data/synthetic/customer_intelligence.duckdb --repeats 3`.',
            'A contagem de linhas considera o nível superior; cohorts contêm células de acompanhamento dentro de cada safra.','']
    (Path(__file__).resolve().parents[1]/'docs'/'api_benchmark.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(records))


if __name__=='__main__':
    main()
