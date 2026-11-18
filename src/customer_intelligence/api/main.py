from contextlib import asynccontextmanager
from datetime import date
import ipaddress
import logging
from time import perf_counter
from typing import Annotated

import duckdb
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import APISettings
from .database import TABLES, QueryTimeout, connection, readiness
from .dependencies import authorize_customer_details, query_filters, service
from .schemas import (AcquisitionPoint, Cohort, Customer, CustomerItemPage, CustomerPage, ErrorResponse,
                      Finance, Health, Meta, Metadata, MonthlyHistory, Overview, Profit, PublicCnpjProfile, QueryFilters, Result, Retention)
from .serialization import ExactJSONResponse, response
from .services import Services
from .behavior import router as behavior_router
from .cnpj_enrichment import CnpjNotFoundError, CnpjServiceError, lookup_public_cnpj

LOG = logging.getLogger("customer_intelligence.api")
F = Annotated[QueryFilters, Depends(query_filters)]
S = Annotated[Services, Depends(service, scope="function")]


class CustomerDetail(BaseModel):
    customer: Customer
    monthly_history: list[MonthlyHistory]
    purchase_indicators: dict
    commercial_profile: dict | None = None


class StatusCount(BaseModel):
    status: str
    customers: int


class Transition(BaseModel):
    period: date
    previous_status: str
    status: str
    customers: int
    mature: bool


class FilterPage(BaseModel):
    items: list[dict[str, str]]
    pagination: dict[str, int]


def create_app(settings: APISettings | None = None) -> FastAPI:
    settings = settings or APISettings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        try:
            with connection(settings) as conn:
                readiness(conn)
        except Exception:
            raise RuntimeError("Banco sintético indisponível ou contrato inválido") from None
        yield

    app = FastAPI(title="Customer Intelligence — API sintética",version="1.0",
                  lifespan=lifespan,docs_url="/docs" if settings.enable_docs else None,
                  redoc_url=None,openapi_url="/openapi.json" if settings.enable_docs else None)
    app.state.settings = settings
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=["localhost","127.0.0.1","[::1]"])
    if "*" in settings.cors_origins:
        raise ValueError("CORS exige origens explícitas")
    app.add_middleware(CORSMiddleware,allow_origins=list(settings.cors_origins),
                       allow_credentials=False,allow_methods=["GET"],allow_headers=["Accept","Content-Type"])

    @app.middleware("http")
    async def local_only(request, call_next):
        try:
            local = ipaddress.ip_address(request.client.host).is_loopback
        except (ValueError, AttributeError):
            local = False
        if not local:
            return ExactJSONResponse({"error":{"code":"local_only","message":"Acesso restrito ao ambiente local"}},status_code=403)
        start=perf_counter()
        result=await call_next(request)
        LOG.info('request_complete route=%s status=%s seconds=%.6f',
                 getattr(request.scope.get("route"),"path","unmatched"),result.status_code,perf_counter()-start)
        return result

    async def bad_input(request, exc):
        return ExactJSONResponse({"error":{"code":"invalid_request","message":"Parâmetros inválidos ou cruzamento ainda não definido"}},status_code=422)

    async def unavailable(request, exc):
        timeout=isinstance(exc,(QueryTimeout,duckdb.InterruptException))
        return ExactJSONResponse({"error":{"code":"query_timeout" if timeout else "database_unavailable",
                                           "message":"Consulta excedeu o tempo permitido" if timeout else "Serviço analítico temporariamente indisponível"}},status_code=504 if timeout else 503)

    async def unexpected(request, exc):
        return ExactJSONResponse({"error":{"code":"internal_error","message":"Não foi possível concluir a consulta"}},status_code=500)

    for error in (RequestValidationError, ValueError):
        app.add_exception_handler(error,bad_input)
    for error in (duckdb.Error, RuntimeError, OSError):
        app.add_exception_handler(error,unavailable)
    app.add_exception_handler(ValidationError,unexpected)
    app.add_exception_handler(ResponseValidationError,unexpected)
    app.add_exception_handler(Exception,unexpected)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return ExactJSONResponse({"error":{"code":"not_found" if exc.status_code==404 else "request_failed",
                                           "message":"Recurso não encontrado" if exc.status_code==404 else "Requisição recusada"}},status_code=exc.status_code)

    router=APIRouter(prefix="/api/v1",responses={422:{"model":ErrorResponse},503:{"model":ErrorResponse},504:{"model":ErrorResponse}})

    @router.get("/health",response_model=Health)
    @router.get("/ready",response_model=Health)
    def health(s:S):
        readiness(s.repo.conn)
        return Health()

    @router.get("/metadata",response_model=Result[Metadata])
    def metadata(s:S):
        period=s.repo.rows("SELECT min(data_emissao) first_period,max(data_emissao) last_period FROM fato_vendas WHERE data_emissao<=?",[s.a.reference_date])[0]
        return response(Result[Metadata],s.wrap(QueryFilters(),{"mode":"synthetic","models":dict.fromkeys(TABLES,True),
            **period,"definitions":s.a.catalog(),"document_key":["Filial","Num. Docto.","Cód. Cliente","Empresa"],
            "limitations":["Primeira compra observada desde 2020, sem comprovar início real do relacionamento.",
                           "Retenção após 90/180 dias pendente; recompra acumulada disponível.",
                           "Moeda da origem não validada; métricas sem conversão.",
                           "Status histórico disponível em fechamentos mensais e referência do snapshot."]},period="snapshot",population="synthetic_snapshot",segmentation="none"))

    @router.get("/overview",response_model=Result[Overview])
    def overview(f:F,s:S):
        return response(Result[Overview],s.overview(f))

    @router.get("/acquisition",response_model=Result[list[AcquisitionPoint]])
    def acquisition(f:F,s:S):
        return response(Result[list[AcquisitionPoint]],s.acquisition(f))

    @router.get("/finance",response_model=Result[Finance])
    def finance(f:F,s:S):
        return response(Result[Finance],s.wrap(f,s.a.financial_summary(f.analytical()).to_dicts()[0],period="transaction",population="all_financial_transactions",segmentation="transaction_attributes"))

    @router.get("/retention",response_model=Result[Retention])
    def retention(f:F,s:S):
        return response(Result[Retention],s.retention(f))

    @router.get("/cohorts",response_model=Result[list[Cohort]])
    def cohorts(f:F,s:S,max_months:int=Query(12,ge=0,le=84)):
        return response(Result[list[Cohort]],s.cohorts(f,max_months))

    @router.get("/customers",response_model=Result[CustomerPage],dependencies=[Depends(authorize_customer_details)])
    def customers(f:F,s:S,page:int=Query(1,ge=1,le=1000000),page_size:int=Query(25,ge=1,le=100),
                  sort_by:str=Query("customer_id",max_length=40),sort_order:str=Query("asc",pattern="^(asc|desc)$"),
                  sort:str|None=Query(None,max_length=160),search:str|None=Query(None,max_length=100)):
        data=s.repo.customer_page(f,page,min(page_size,s.max_rows),sort_by,sort_order,search,sort=sort)
        return response(Result[CustomerPage],s.wrap(f,data,period="acquisition_selection;financials_lifetime_to_snapshot",population="identified_customers"))

    @router.get("/customers/{customer_id}/items",response_model=Result[CustomerItemPage],dependencies=[Depends(authorize_customer_details)])
    def customer_items(f:F,s:S,customer_id:str=Path(pattern=r"^\d{8}$"),
                       page:int=Query(1,ge=1,le=1000000),page_size:int=Query(25,ge=1,le=100),
                       search:str|None=Query(None,max_length=100)):
        if not s.repo.rows("SELECT 1 FROM dim_clientes WHERE raiz_cnpj=?",[customer_id]):
            raise HTTPException(404)
        data=s.repo.customer_items(customer_id,f,page,min(page_size,s.max_rows),search)
        payload=s.wrap(f,data,period="transaction_to_snapshot",population="identified_customer_financial_items",
                       segmentation="transaction_attributes")
        payload["meta"]["notes"].append("Itens financeiros incluem devoluções; datas de emissão nulas ou posteriores ao snapshot são excluídas. Quantidades preservam a unidade da origem, sem conversão.")
        return response(Result[CustomerItemPage],payload)

    @router.get("/customers/{customer_id}/cnpj-publico",response_model=Result[PublicCnpjProfile],dependencies=[Depends(authorize_customer_details)])
    def customer_public_cnpj(f:F,s:S,request:Request,customer_id:str=Path(pattern=r"^\d{8}$"),refresh:bool=Query(False)):
        if not s.repo.rows("SELECT 1 FROM dim_clientes WHERE raiz_cnpj=?",[customer_id]):
            raise HTTPException(404)
        try:
            data=lookup_public_cnpj(customer_id,cache_path=request.app.state.settings.resolved_cnpj_cache_path(),refresh=refresh)
        except CnpjNotFoundError:
            raise HTTPException(404)
        except CnpjServiceError as exc:
            return ExactJSONResponse({"error":{"code":"upstream_unavailable","message":str(exc)}},status_code=503)
        return response(Result[PublicCnpjProfile],s.wrap(f,data,period="external_public_registry",population="single_identified_customer_matriz"))

    @router.get("/customers/{customer_id}",response_model=Result[CustomerDetail],dependencies=[Depends(authorize_customer_details)])
    def detail(f:F,s:S,customer_id:str=Path(pattern=r"^\d{8}$")):
        page=s.repo.customer_page(f,1,1,"customer_id","asc",customer_id=customer_id)
        if not page["items"]:
            raise HTTPException(404)
        history_cond = " AND mes_referencia <= ?" if f.end_date else ""
        history_params = [customer_id, f.end_date] if f.end_date else [customer_id]
        history=s.bounded(s.repo.rows(f"""SELECT * EXCLUDE(raiz_cnpj,status_historico,cliente_status_historico),
            CASE WHEN quantidade_compras_acumuladas <= 5 AND status_historico = 'RECORRENTE' THEN 'NOVO' ELSE status_historico END AS status_historico,
            CASE WHEN quantidade_compras_acumuladas <= 5 AND status_historico = 'RECORRENTE' THEN 'NOVO' ELSE status_historico END AS cliente_status_historico
            FROM fato_clientes_mensal WHERE raiz_cnpj=? {history_cond} ORDER BY mes_referencia LIMIT ?""",[*history_params,s.max_rows+1]))
        indicators=s.repo.rows("SELECT data_segunda_compra,dias_ate_segunda_compra,maturidade_30d,recompra_30d,maturidade_60d,recompra_60d,maturidade_90d,recompra_90d,maturidade_180d,recompra_180d FROM dim_clientes WHERE raiz_cnpj=?",[customer_id])[0]
        profile=s.repo.customer_profile(customer_id,f)
        return response(Result[CustomerDetail],s.wrap(f,{"customer":page["items"][0],"monthly_history":history,"purchase_indicators":indicators,"commercial_profile":profile},period="monthly_history_and_snapshot",population="single_identified_customer"))

    @router.get("/profitability",response_model=Result[list[Profit]])
    def profitability(f:F,s:S,group_by:str=Query("business_unit",max_length=40),limit:int=Query(100,ge=1,le=1000)):
        return response(Result[list[Profit]],s.wrap(f,s.repo.profitability(f,group_by,min(limit,s.max_rows)),period="transaction",population="all_financial_transactions",segmentation="transaction_attributes"))

    @router.get("/lifecycle",response_model=Result[list[StatusCount]])
    def lifecycle(f:F,s:S,reference_date:date|None=None):
        if f.start_date or f.end_date:
            raise ValueError("Use reference_date para ciclo de vida")
        payload=s.wrap(f,s.repo.lifecycle(f,reference_date),period="monthly_close_or_snapshot",population="customers_observed_by_reference")
        payload["meta"]["reference_date"]=reference_date or s.a.reference_date
        return response(Result[list[StatusCount]],payload)

    @router.get("/lifecycle/transitions",response_model=Result[list[Transition]])
    def transitions(f:F,s:S):
        return response(Result[list[Transition]],s.wrap(f,s.bounded(s.repo.lifecycle(f,transitions=True)),period="transition_month",population="observed_customer_transitions"))

    @router.get("/filters",response_model=Result[FilterPage])
    def filters(f:F,s:S,dimension:str=Query("business_unit",max_length=40),search:str|None=Query(None,max_length=100),
                page:int=Query(1,ge=1,le=1000000),page_size:int=Query(25,ge=1,le=100)):
        return response(Result[FilterPage],s.wrap(f,s.repo.filter_values(f,dimension,search,page,min(page_size,s.max_rows)),period="transaction",population="available_transaction_dimensions",segmentation="transaction_attributes"))

    app.include_router(router)
    app.include_router(behavior_router, prefix="/api/v1")
    return app
