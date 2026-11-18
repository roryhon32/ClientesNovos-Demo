from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from time import sleep
from uuid import uuid4

import duckdb
from fastapi.testclient import TestClient
import polars as pl
import pytest

from customer_intelligence.api.config import APISettings
from customer_intelligence.api.main import create_app
from customer_intelligence.api.database import connection, QueryTimeout
from customer_intelligence.api.repository import Repository
from customer_intelligence.api.serialization import encode
from customer_intelligence.config.settings import Settings
from customer_intelligence.ingestion.source_adapter import SyntheticDataset
from customer_intelligence.pipeline import SYNTHETIC_ROOT, run_pipeline
from conftest import source_row


@pytest.fixture(scope="module")
def database():
    folder=SYNTHETIC_ROOT / ('api-tests-'+uuid4().hex)
    folder.mkdir(parents=True)
    target=folder/'generated.duckdb'
    rows=[source_row(),source_row(item="2",**{"Valor Contábil":"500","Fat. Líquido":"425","Margem Bruta (R$)":"42.5"}),
          source_row(document="SECOND",emitted=date(2026,2,10),branch="0002",**{"Business Unit":"LATER_BU"}),
          source_row(root="00000002",emitted=date(2026,10,20)),
          source_row(root="00000003",emitted=date(2020,1,1)),
          source_row(root="00000003",emitted=date(2026,10,1),document="REACTIVATED"),
          source_row(root="00000004",**{"Fat. Líquido":"0","Margem Bruta (R$)":"10"}),
          source_row(root="00000005",**{"Status":"DEVOLVIDO","FAT - Quant.":"-1","Valor Contábil":"-100","Fat. Líquido":"-85","Margem Bruta (R$)":"-25.5"}),
          source_row(document="FUTURE",emitted=date(2027,1,1))]
    with run_pipeline(SyntheticDataset(pl.DataFrame(rows).cast(pl.String)),Settings(reference_date=date(2026,10,22)),target):
        pass
    yield target
    for file in folder.iterdir():
        file.unlink()
    folder.rmdir()


@pytest.fixture
def client(database):
    app=create_app(APISettings(database_path=str(database),cors_origins=("http://localhost:5173",)))
    with TestClient(app,base_url="http://localhost",client=("127.0.0.1",50000),raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize("endpoint",["health","ready","metadata","overview","acquisition","customers","customers/00000001",
                                      "retention","cohorts","profitability","lifecycle","lifecycle/transitions","filters"])
def test_all_contracts(client,endpoint):
    r=client.get('/api/v1/'+endpoint)
    assert r.status_code==200, r.text
    assert "NaN" not in r.text and "Infinity" not in r.text
    if endpoint not in ("health","ready"):
        assert r.json()["meta"]["reference_date"]=="2026-10-22"


def test_health_and_openapi(client):
    assert client.get('/api/v1/health').json()=={"status":"healthy","database":"connected","mode":"synthetic","read_only":True}
    schema=client.get('/openapi.json').json()
    assert '/api/v1/customers/{customer_id}' in schema['paths']
    assert client.get('/docs').status_code==200
    assert 'database_path' not in str(schema['paths'])


def test_financial_reconciliation_and_ticket(client,database):
    row=client.get('/api/v1/overview').json()['data']['company_transaction_revenue']
    assert row['impostos']==pytest.approx(row['faturamento_contabil']-row['faturamento_liquido'])
    assert row['margem_bruta_percentual']==pytest.approx(100*row['margem_bruta_valor']/row['faturamento_liquido'])
    with connection(APISettings(database_path=str(database))) as c:
        expected=c.execute("SELECT sum(faturamento_contabil),count(DISTINCT identificador_documento) FROM fato_vendas WHERE data_emissao<=DATE '2026-10-22'").fetchone()
    assert Decimal(str(row['faturamento_contabil']))==expected[0]
    assert row['ticket_medio_contabil']==pytest.approx(float(expected[0])/expected[1])
    customer=client.get('/api/v1/customers/00000001').json()['data']['customer']
    assert customer['valid_purchases']==2
    assert customer['first_purchase']=='2026-01-10'
    assert customer['second_purchase']=='2026-02-10'
    assert customer['acquisition_business_units']==['BU SINTETICA A']


@pytest.mark.parametrize("days",[30,60,90,180])
def test_repurchase_maturity(client,days):
    row=client.get('/api/v1/retention').json()['data']['windows']
    window=next(x for x in row if x['days']==days)
    assert window['eligible_customers']==3
    assert window['immature_customers']==1
    assert window['repurchased_customers']==(0 if days==30 else 1)
    assert not window['mature']


def test_immature_cohort_and_m0(client):
    r=client.get('/api/v1/cohorts',params={'acquisition_cohort':'2026-10','max_months':2}).json()['data'][0]
    assert r['initial_customers']==1
    assert r['periods'][0]['retained_customers'] is None
    assert r['periods'][0]['retention_pct'] is None
    assert r['periods'][0]['mature'] is False
    assert r['periods'][1]['net_revenue'] is None
    assert r['periods'][1]['eligible_customers'] is None


def test_global_acquisition_not_recomputed_by_bu(client):
    r=client.get('/api/v1/overview',params={'business_unit':'LATER_BU'}).json()['data']
    assert r['acquired_customers']==0
    assert r['company_transaction_revenue']['faturamento_contabil']==1000
    assert client.get('/api/v1/customers',params={'business_unit':'LATER_BU'}).json()['data']['pagination']['total_items']==0


def test_history_uses_historical_status_and_transitions(client):
    data=client.get('/api/v1/lifecycle',params={'reference_date':'2020-01-31'}).json()['data']
    assert data==[{'status':'NOVO','customers':1}]
    data=client.get('/api/v1/lifecycle/transitions',params={'start_date':'2026-10-01'}).json()['data']
    assert any(x['previous_status']=='INATIVO' and x['status']=='RECORRENTE' for x in data)
    detail=client.get('/api/v1/customers/00000001').json()['data']['monthly_history']
    assert any(x['mes_referencia']=='2026-03-01' and x['quantidade_notas_mes']==0 for x in detail)


@pytest.mark.parametrize("endpoint,params",[
    ('overview',{'start_date':'2026-10-01','end_date':'2026-01-01'}),
    ('overview',{'start_date':'not-a-date'}),('overview',{'family':'UNDEFINED'}),
    ('customers',{'page_size':101}),('customers',{'page':0}),
    ('customers',{'sort_by':'name; DROP TABLE dim_clientes'}),
    ('customers',{'sort_order':'desc;--'}),('profitability',{'group_by':'SELECT 1'}),
    ('profitability',{'limit':1001}),('filters',{'dimension':'../secret'}),
    ('cohorts',{'max_months':85}),('overview',{'acquisition_cohort':'2026-99'}),
    ('lifecycle',{'reference_date':'2026-01-15'}),('lifecycle',{'start_date':'2026-01-01'}),
])
def test_invalid_inputs_are_sanitized(client,endpoint,params):
    r=client.get('/api/v1/'+endpoint,params=params)
    assert r.status_code==422,r.text
    assert r.json()['error']['code']=='invalid_request'
    assert 'Traceback' not in r.text and 'DROP' not in r.text and 'C:' not in r.text


@pytest.mark.parametrize("endpoint",['overview','acquisition','customers','retention','cohorts','profitability','lifecycle','filters'])
def test_empty_and_injection_dimensions(client,endpoint):
    r=client.get('/api/v1/'+endpoint,params={'business_unit':"' OR 1=1; DROP TABLE fato_vendas;--"})
    assert r.status_code==200,r.text
    if endpoint=='customers':
        assert r.json()['data']['pagination']['total_items']==0


def test_zero_denominator(client):
    data=client.get('/api/v1/profitability',params={'group_by':'customer'}).json()['data']
    row=next(x for x in data if x['dimension']=='00000004')
    assert row['margem_bruta_percentual'] is None


def test_pagination_search_and_dependent_filters(client):
    first=client.get('/api/v1/customers',params={'page_size':2}).json()['data']
    second=client.get('/api/v1/customers',params={'page_size':2,'page':2}).json()['data']
    assert first['pagination']=={'page':1,'page_size':2,'total_items':5,'total_pages':3}
    assert {x['customer_id'] for x in first['items']}.isdisjoint(x['customer_id'] for x in second['items'])
    assert client.get('/api/v1/customers',params={'search':"' OR 1=1--"}).json()['data']['items']==[]
    assert client.get('/api/v1/filters',params={'dimension':'city','state':'XX'}).json()['data']['items']==[]
    assert client.get('/api/v1/filters',params={'dimension':'product','family':'FAMILIA SINTETICA','page_size':1}).json()['data']['pagination']['page_size']==1
    assert client.get('/api/v1/customers/99999999').status_code==404


def test_cors(client):
    accepted=client.options('/api/v1/overview',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'GET'})
    assert accepted.headers['access-control-allow-origin']=='http://localhost:5173'
    rejected=client.options('/api/v1/overview',headers={'Origin':'https://unapproved.invalid','Access-Control-Request-Method':'GET'})
    assert 'access-control-allow-origin' not in rejected.headers


def test_local_only_and_docs_disabled(database):
    app=create_app(APISettings(database_path=str(database),enable_docs=False))
    with TestClient(app,base_url='http://localhost',client=('192.0.2.1',50000)) as c:
        assert c.get('/api/v1/health').status_code==403
    with TestClient(app,base_url='http://localhost',client=('127.0.0.1',50000)) as c:
        assert c.get('/docs').status_code==404


def test_readonly_and_no_file_changes(client,database):
    before=hashlib.sha256(database.read_bytes()).hexdigest()
    client.get('/api/v1/overview')
    with connection(APISettings(database_path=str(database))) as conn:
        with pytest.raises(duckdb.Error):
            conn.execute('DELETE FROM dim_clientes')
        with pytest.raises(duckdb.Error):
            conn.execute("SELECT * FROM read_csv_auto('not-an-authorized-file.csv')")
    assert hashlib.sha256(database.read_bytes()).hexdigest()==before


def test_missing_database_no_fallback(database):
    missing=database.parent/'absent.duckdb'
    with pytest.raises(RuntimeError,match='Banco sintético indisponível'):
        with TestClient(create_app(APISettings(database_path=str(missing)))):
            pass
    assert not missing.exists()


def test_config_rejects_external_path_without_opening(monkeypatch):
    def forbidden(*a,**k):
        raise AssertionError('No filesystem inspection allowed')
    monkeypatch.setattr(Path,'is_file',forbidden)
    with pytest.raises(RuntimeError,match='não autorizada'):
        APISettings(database_path=str(Path.cwd()/'not-synthetic.duckdb')).authorized_path()
    with pytest.raises(ValueError):
        APISettings(database_path='unused',data_mode='production')


def test_concurrent_requests_use_independent_connections(client):
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda _:client.get('/api/v1/overview'),range(8)))
    assert all(x.status_code==200 for x in results)
    assert all(x.json()==results[0].json() for x in results)


def test_query_failure_hides_sql_and_paths(client,monkeypatch):
    def fail(*args,**kwargs):
        raise duckdb.IOException('SECRET SQL C:/private/path')
    monkeypatch.setattr(Repository,'customer_page',fail)
    r=client.get('/api/v1/customers')
    assert r.status_code==503
    assert 'SECRET' not in r.text and 'private' not in r.text


def test_query_deadline_and_resources(database):
    settings=APISettings(database_path=str(database),query_timeout_seconds=0.01)
    with pytest.raises(QueryTimeout):
        with connection(settings) as conn:
            sleep(0.03)
    with pytest.raises(duckdb.Error):
        conn.execute('SELECT 1')


def test_decimal_json_exact_and_nonfinite_safe():
    body=encode({'money':Decimal('123456789012345678.123456'),'rate':float('nan'),'other':Decimal('Infinity')})
    assert json.loads(body,parse_float=Decimal)['money']==Decimal('123456789012345678.123456')
    assert json.loads(body)['rate'] is None and json.loads(body)['other'] is None


def test_database_unavailable_after_start_is_controlled(client,monkeypatch):
    def unavailable(*args):
        raise RuntimeError('SECRET PATH')
    monkeypatch.setattr(APISettings,'authorized_path',unavailable)
    r=client.get('/api/v1/overview')
    assert r.status_code==503
    assert 'SECRET' not in r.text


def test_timeout_response(client,monkeypatch):
    def timeout(*args,**kwargs):
        raise QueryTimeout()
    monkeypatch.setattr(Repository,'customer_page',timeout)
    assert client.get('/api/v1/customers').status_code==504


def test_actual_query_is_interrupted(database):
    with pytest.raises((duckdb.InterruptException,QueryTimeout)):
        with connection(APISettings(database_path=str(database),query_timeout_seconds=0.02)) as conn:
            conn.execute('SELECT sum(a.i*b.i) FROM range(1000000000) a(i), range(1000000000) b(i)')


def test_row_limit_and_output_schema(database):
    with TestClient(create_app(APISettings(database_path=str(database),max_rows=1)),base_url='http://localhost',client=('127.0.0.1',50000)) as c:
        assert c.get('/api/v1/cohorts').status_code==422
        assert len(c.get('/api/v1/customers').json()['data']['items'])==1
        assert len(c.get('/api/v1/profitability').json()['data'])<=1
        schemas=c.get('/openapi.json').json()['components']['schemas']
        financial=next(v for k,v in schemas.items() if k=='Finance')
        assert financial['properties']['faturamento_contabil']['anyOf'][0]['type']=='number'


def test_four_revenue_scopes_are_distinct(client):
    data=client.get('/api/v1/overview',params={'start_date':'2026-01-01','end_date':'2026-01-31'}).json()['data']
    assert data['company_transaction_revenue']['faturamento_contabil']!=data['acquired_customer_lifetime_revenue']['faturamento_contabil']
    assert data['acquired_customer_period_revenue']['faturamento_contabil']==2500
    assert data['company_transaction_revenue']['faturamento_contabil']==2400
    assert data['acquisition_month_net_revenue']==data['acquired_customer_period_revenue']['faturamento_liquido']


def test_conflicting_database_connection_returns_unavailable(client,database):
    with duckdb.connect(str(database)):
        assert client.get('/api/v1/health').status_code==503


def test_customers_multi_column_sort_and_validation(client):
    by_rev=client.get('/api/v1/customers',params={'sort_by':'net_revenue','sort_order':'desc','sort':'net_revenue:desc,last_purchase:desc'})
    assert by_rev.status_code==200
    items_rev=by_rev.json()['data']['items']
    assert [(x['customer_id'],x['faturamento_liquido'],x['last_purchase']) for x in items_rev]==sorted(
        [(x['customer_id'],x['faturamento_liquido'],x['last_purchase']) for x in items_rev],
        key=lambda t:(-(t[1] or 0),-(date.fromisoformat(t[2]).toordinal() if t[2] else 0),t[0]))

    by_status_rev=client.get('/api/v1/customers',params={'sort_by':'status','sort_order':'asc','sort':'status:asc,net_revenue:desc'})
    by_status_recent=client.get('/api/v1/customers',params={'sort_by':'status','sort_order':'asc','sort':'status:asc,last_purchase:desc'})
    assert by_status_rev.status_code==200 and by_status_recent.status_code==200
    items_recent=by_status_recent.json()['data']['items']
    rev_ids=[x['customer_id'] for x in by_status_rev.json()['data']['items']]
    rec_ids=[x['customer_id'] for x in items_recent]
    assert rev_ids!=rec_ids
    assert [(x['status'],x['last_purchase'],x['customer_id']) for x in items_recent]==sorted(
        [(x['status'],x['last_purchase'],x['customer_id']) for x in items_recent],
        key=lambda t:(t[0],-(date.fromisoformat(t[1]).toordinal() if t[1] else 0),t[2]))
    by_last_first=client.get('/api/v1/customers',params={'sort_by':'last_purchase','sort_order':'desc','sort':'last_purchase:desc,net_revenue:desc'})
    assert by_last_first.status_code==200
    assert by_last_first.json()['data']['items'][0]['last_purchase']=='2026-10-20'

    for bad in ('','bad:asc','net_revenue:sideways','name:asc,name:desc','name; DROP TABLE dim_clientes:asc','name:asc,status:asc,net_revenue:desc,last_purchase:desc,first_purchase:asc'):
        resp=client.get('/api/v1/customers',params={'sort':bad})
        assert resp.status_code==422 and resp.json()['error']['code']=='invalid_request'


def test_customer_detail_includes_commercial_profile(client):
    r=client.get('/api/v1/customers/00000001')
    assert r.status_code==200
    profile=r.json()['data']['commercial_profile']
    assert profile['safra_aquisicao']=='2026-01'
    assert isinstance(profile['sales_channels'],list) and len(profile['sales_channels'])>=1
    assert isinstance(profile['business_units'],list) and 'LATER_BU' in profile['business_units']
    assert isinstance(profile['sellers'],list) and len(profile['sellers'])>=1
    assert isinstance(profile['states'],list) and isinstance(profile['cities'],list)
    assert isinstance(profile['companies'],list) and isinstance(profile['families'],list)
    assert isinstance(profile['channel_breakdown'],list) and profile['channel_breakdown'][0]['channel']==profile['sales_channels'][0]


def test_public_cnpj_lookup_uses_cache_and_handles_errors(client,monkeypatch):
    from customer_intelligence.api import cnpj_enrichment
    assert cnpj_enrichment.compute_matriz_cnpj('00000000')=='00000000000191'
    assert cnpj_enrichment.compute_matriz_cnpj('16501555')=='16501555000157'
    calls=[]
    def fake_fetch(cnpj14,timeout=8.0):
        calls.append(cnpj14)
        return {
            'cnpj':cnpj14,'razao_social':'EMPRESA PUBLICA LTDA','nome_fantasia':'EMPRESA FANTASIA',
            'descricao_situacao_cadastral':'ATIVA','data_situacao_cadastral':'2020-01-01',
            'data_inicio_atividade':'2018-05-10','cnae_fiscal':6201501,
            'cnae_fiscal_descricao':'Desenvolvimento de programas de computador sob encomenda',
            'cnaes_secundarios':[{'codigo':6202300,'descricao':'Desenvolvimento de software'}],
            'porte':'DEMAIS','natureza_juridica':'Sociedade Empresária Limitada',
            'capital_social':150000.0,'logradouro':'AV PAULISTA','numero':'1000',
            'complemento':'SALA 10','bairro':'BELA VISTA','municipio':'SAO PAULO','uf':'SP','cep':'01310100',
        }
    monkeypatch.setattr(cnpj_enrichment,'fetch_brasilapi',fake_fetch)
    first=client.get('/api/v1/customers/00000001/cnpj-publico')
    assert first.status_code==200
    d1=first.json()['data']
    assert d1['cnpj']=='00000001000136' and d1['cached'] is False and d1['situacao_cadastral']=='ATIVA'
    assert d1['cnae_principal_codigo']=='6201501' and len(d1['cnaes_secundarios'])==1
    second=client.get('/api/v1/customers/00000001/cnpj-publico')
    assert second.status_code==200 and second.json()['data']['cached'] is True
    assert len(calls)==1
    refreshed=client.get('/api/v1/customers/00000001/cnpj-publico',params={'refresh':'true'})
    assert refreshed.status_code==200 and refreshed.json()['data']['cached'] is False
    assert len(calls)==2
    assert client.get('/api/v1/customers/99999999/cnpj-publico').status_code==404
    def fail_upstream(cnpj14,timeout=8.0):
        raise cnpj_enrichment.CnpjServiceError('API pública indisponível')
    monkeypatch.setattr(cnpj_enrichment,'fetch_brasilapi',fail_upstream)
    err=client.get('/api/v1/customers/00000002/cnpj-publico')
    assert err.status_code==503 and err.json()['error']['code']=='upstream_unavailable'
