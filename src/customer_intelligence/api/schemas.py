from datetime import date
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, WithJsonSchema, model_validator

from customer_intelligence.metrics import Filters

Money = Annotated[Decimal, WithJsonSchema({"type": "number"}, mode="serialization")]


class QueryFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    company: str | None = None
    business_unit: str | None = None
    seller: str | None = None
    state: str | None = None
    city: str | None = None
    sales_channel: str | None = None
    family: str | None = None
    product: str | None = None
    customer_status: str | None = None
    valid_purchases_gt: int | None = Field(default=None, ge=0, le=2147483647, description="Clientes com total de compras válidas no snapshot estritamente maior que este valor.")
    acquisition_cohort: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @model_validator(mode="after")
    def ordered(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("Período invertido")
        return self

    def analytical(self) -> Filters:
        mapping = {"seller": "vendedor", "state": "estado", "city": "municipio",
                   "sales_channel": "canal_venda", "family": "familia", "product": "codigo_produto",
                   "customer_status": "status_cliente", "acquisition_cohort": "safra_aquisicao"}
        return Filters(**{mapping.get(k, k): v for k, v in self.model_dump().items()})


class Meta(BaseModel):
    contract_version: str = "1.0"
    reference_date: date
    period_type: str
    population: str
    segmentation: str
    monetary_unit: str = "source_currency_unvalidated"
    rate_unit: str = "percent"
    start_date: date | None = None
    end_date: date | None = None
    notes: list[str] = []


T = TypeVar("T")


class Result(BaseModel, Generic[T]):
    meta: Meta
    data: T


class FinancialMeasures(BaseModel):
    faturamento_contabil: Money | None = None
    faturamento_liquido: Money | None = None
    impostos: Money | None = None
    percentual_impostos: float | None = None
    margem_bruta_valor: Money | None = None
    margem_bruta_percentual: float | None = None


class Finance(FinancialMeasures):
    documentos_distintos: int = 0
    clientes_identificados: int = 0
    ticket_medio_contabil: Money | None = None
    ticket_medio_liquido: Money | None = None


class Window(BaseModel):
    days: int
    eligible_customers: int
    immature_customers: int
    repurchased_customers: int
    rate_pct: float | None
    mature: bool


class Retention(BaseModel):
    windows: list[Window]
    mean_days_to_second_purchase: float | None
    median_days_to_second_purchase: float | None


class Overview(BaseModel):
    company_transaction_revenue: Finance
    acquired_customer_period_revenue: FinancialMeasures
    acquired_customer_lifetime_revenue: FinancialMeasures
    acquired_customers: int
    acquisition_month_net_revenue: Money | None
    repurchase_90d: Window
    acquisition_growth_previous_period_pct: float | None


class AcquisitionPoint(BaseModel):
    period: date
    new_customers: int
    first_purchase_accounting_revenue: Money | None
    first_purchase_net_revenue: Money | None
    first_purchase_gross_margin: Money | None
    growth_pct: float | None


class Customer(Finance):
    customer_id: str
    name: str | None
    customer_names: list[str] = []
    real_customer_names: list[str] = []
    first_purchase: date | None
    last_purchase: date | None
    second_purchase: date | None
    status: str
    valid_purchases: int
    acquisition_business_units: list[str] = []
    acquisition_sellers: list[str] = []
    days_without_purchase: int | None


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CustomerPage(BaseModel):
    items: list[Customer]
    pagination: Pagination


class CustomerItem(FinancialMeasures):
    identificador_item: str
    identificador_documento: str | None
    document_number: str | None
    branch: str | None
    company: str | None
    customer_code: str | None
    nome_cliente: str | None
    cliente_real: str | None
    item: str | None
    data_emissao: date
    codigo_produto: str | None
    descricao_produto: str | None
    business_unit: str | None
    familia: str | None
    subfamilia: str | None
    vendedor: str | None
    estado: str | None
    municipio: str | None
    canal_venda: str | None
    quantidade_faturada: Money | None
    quantidade_devolvida: Money | None = None
    quantidade_liquida: Money | None
    status_origem: str | None
    origem_transacao: str | None
    compra_valida: bool


class CustomerItemPage(BaseModel):
    items: list[CustomerItem]
    pagination: Pagination


class CohortPeriod(BaseModel):
    month_offset: int
    eligible_customers: int | None
    retained_customers: int | None
    retention_pct: float | None
    acquired_customers: int | None
    mature: bool
    net_revenue: Money | None
    gross_margin: Money | None


class Cohort(BaseModel):
    cohort: str
    initial_customers: int
    periods: list[CohortPeriod]


class Profit(Finance):
    dimension: str | None


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class Health(BaseModel):
    status: Literal["healthy"] = "healthy"
    database: Literal["connected"] = "connected"
    mode: Literal["synthetic"] = "synthetic"
    read_only: Literal[True] = True


class Metadata(BaseModel):
    mode: Literal["synthetic"]
    models: dict[str, bool]
    first_period: date | None
    last_period: date | None
    definitions: dict[str, str]
    document_key: list[str]
    limitations: list[str]


class MonthlyHistory(BaseModel):
    mes_referencia: date
    status_historico: str
    data_ultima_compra_ate_mes: date | None
    dias_sem_compra: int | None
    quantidade_notas_mes: int
    quantidade_compras_acumuladas: int
    faturamento_contabil_mes: Money | None
    faturamento_liquido_mes: Money | None
    impostos_mes: Money | None
    margem_bruta_valor_mes: Money | None
    margem_bruta_percentual_mes: float | None
    periodo_completo: bool


class CnaeItem(BaseModel):
    codigo: str
    descricao: str


class PublicCnpjProfile(BaseModel):
    cnpj: str
    cnpj_formatted: str
    razao_social: str | None = None
    nome_fantasia: str | None = None
    situacao_cadastral: str | None = None
    data_situacao_cadastral: str | None = None
    data_inicio_atividade: str | None = None
    cnae_principal_codigo: str | None = None
    cnae_principal_descricao: str | None = None
    cnaes_secundarios: list[CnaeItem] = []
    porte: str | None = None
    natureza_juridica: str | None = None
    capital_social: float | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    municipio: str | None = None
    uf: str | None = None
    cep: str | None = None
    source: str
    fetched_at: str
    cached: bool
