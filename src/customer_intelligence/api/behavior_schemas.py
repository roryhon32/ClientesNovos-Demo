"""Contratos explícitos para comportamento transacional, sem redefinir aquisição."""
from datetime import date
from typing import Literal

from pydantic import BaseModel

from .schemas import FinancialMeasures, Money

OccasionMode = Literal["documents", "dates"]


class BusinessUnitBehavior(FinancialMeasures):
    business_unit: str | None
    documents: int
    occasions: int
    repurchased: bool
    net_share_pct: float | None


class MonthlyBusinessUnit(FinancialMeasures):
    month: date
    business_unit: str | None
    documents: int


class ProductBehavior(FinancialMeasures):
    product_id: str | None
    descriptions: list[str]
    business_units: list[str]
    quantity: Money | None
    documents: int
    occasions: int
    first_purchase: date | None
    last_purchase: date | None
    mean_days_between_purchases: float | None
    repurchased: bool


class FirstProduct(BaseModel):
    product_id: str | None
    descriptions: list[str]
    business_units: list[str]
    date: date
    documents: int


class MixEvolution(BaseModel):
    current_start: date
    current_end: date
    previous_start: date
    previous_end: date
    period_basis: str
    previous_period_complete: bool
    new_in_period: list[str]
    not_observed_in_period: list[str]
    retained_products: list[str]
    resumed_products: list[str]
    current_products: int
    previous_products: int
    current_top_product_share_pct: float | None
    previous_top_product_share_pct: float | None
    concentration_basis: str = "valid_purchase_net_revenue"


class BehaviorSummary(FinancialMeasures):
    valid_documents: int
    occasions: int
    general_repurchase: bool
    same_bu_repurchase: bool
    same_product_repurchase: bool
    mean_days_between_purchases: float | None
    predominant_business_units: list[str | None]
    occasion_mode: OccasionMode


class CustomerBehavior(BaseModel):
    summary: BehaviorSummary
    business_units: list[BusinessUnitBehavior]
    monthly_business_units: list[MonthlyBusinessUnit]
    first_products: list[FirstProduct]
    top_products_quantity: list[ProductBehavior]
    top_products_revenue: list[ProductBehavior]
    products: list[ProductBehavior]
    mix: MixEvolution


class ProductCodeDetail(BaseModel):
    code: str
    description: str | None = None
    customers: int
    eligible_customers: int = 0
    excluded_recent_customers: int = 0
    repurchased_customers: int = 0
    repurchase_rate_pct: float | None = None
    minimum_observation_days: int | None = None
    maximum_observation_days: int | None = None


class ProductRepurchase(BaseModel):
    product_id: str
    product_name: str | None = None
    descriptions: list[str]
    codes: list[str] = []
    customers: int
    eligible_customers: int
    excluded_recent_customers: int
    repurchased_customers: int
    repurchase_rate_pct: float | None
    minimum_observation_days: int | None
    maximum_observation_days: int | None
    code_details: list[ProductCodeDetail] = []


class ProductRepurchasePage(BaseModel):
    items: list[ProductRepurchase]
    pagination: dict[str, int]
    occasion_mode: OccasionMode
    min_observation_days: int
    observation_end: date
    group_by: str = "product"


class ProductInvoiceDetail(BaseModel):
    num_docto: str
    serie: str | None = None
    data_emissao: date | None = None
    cliente_real: str
    nome_cliente: str | None = None
    raiz_cnpj: str | None = None
    faturamento_liquido: float | None = None
    margem_bruta_valor: float | None = None
    margem_bruta_percentual: float | None = None
    itens: int = 1


class ProductInvoicesPage(BaseModel):
    items: list[ProductInvoiceDetail]
    pagination: dict[str, int]
    code: str

