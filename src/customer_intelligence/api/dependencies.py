from datetime import date
from fastapi import Query, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from .database import connection
from .services import Services
from .schemas import QueryFilters


def query_filters(start_date: date | None = None, end_date: date | None = None,
                  company: str | None = Query(None,max_length=200),
                  business_unit: str | None = Query(None,max_length=200),
                  seller: str | None = Query(None,max_length=200),
                  state: str | None = Query(None,max_length=200),
                  city: str | None = Query(None,max_length=200),
                  sales_channel: str | None = Query(None,max_length=200),
                  family: str | None = Query(None,max_length=200),
                  product: str | None = Query(None,max_length=200),
                  customer_status: str | None = Query(None,max_length=200),
                  valid_purchases_gt: int | None = Query(None,ge=0,le=2147483647,description="Total de compras válidas do cliente no snapshot maior que N"),
                  acquisition_cohort: str | None = Query(None,max_length=7)) -> QueryFilters:
    values=locals()
    try:
        return QueryFilters(**values)
    except ValidationError:
        raise RequestValidationError([]) from None


def authorize_customer_details(request: Request) -> None:
    """Ponto de extensão; acesso apenas local sintético, sem autenticação simulada.

    Substituir por autenticação/autorização reais antes de habilitar outro modo.
    O modo de produção é recusado pela configuração atual.
    """
    if request.app.state.settings.data_mode != "synthetic":
        raise RuntimeError("Modo não autorizado")


def service(request: Request):
    with connection(request.app.state.settings) as conn:
        yield Services(conn, request.app.state.settings.max_rows)
