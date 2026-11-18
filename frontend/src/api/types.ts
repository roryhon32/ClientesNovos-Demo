export interface Meta {
  contract_version: string;
  reference_date: string;
  period_type: string;
  population: string;
  segmentation: string;
  monetary_unit: string;
  rate_unit: string;
  start_date?: string | null;
  end_date?: string | null;
  notes: string[];
}

export interface ApiResponse<T> {
  meta: Meta;
  data: T;
}

export interface FinancialMeasures {
  faturamento_contabil: number | null;
  faturamento_liquido: number | null;
  impostos: number | null;
  percentual_impostos: number | null;
  margem_bruta_valor: number | null;
  margem_bruta_percentual: number | null;
}

export interface Finance extends FinancialMeasures {
  documentos_distintos: number;
  clientes_identificados: number;
  ticket_medio_contabil: number | null;
  ticket_medio_liquido: number | null;
}

export interface Window {
  days: number;
  eligible_customers: number;
  immature_customers: number;
  repurchased_customers: number;
  rate_pct: number | null;
  mature: boolean;
}

export interface Retention {
  windows: Window[];
  mean_days_to_second_purchase: number | null;
  median_days_to_second_purchase: number | null;
}

export interface Overview {
  company_transaction_revenue: Finance;
  acquired_customer_period_revenue: FinancialMeasures;
  acquired_customer_lifetime_revenue: FinancialMeasures;
  acquired_customers: number;
  acquisition_month_net_revenue: number | null;
  repurchase_90d: Window;
  acquisition_growth_previous_period_pct: number | null;
}

export interface AcquisitionPoint {
  period: string; // YYYY-MM-DD
  new_customers: number;
  first_purchase_accounting_revenue: number | null;
  first_purchase_net_revenue: number | null;
  first_purchase_gross_margin: number | null;
  growth_pct: number | null;
}

export interface Customer extends Finance {
  customer_id: string;
  name: string | null;
  customer_names?: string[];
  real_customer_names?: string[];
  first_purchase: string | null;
  last_purchase: string | null;
  second_purchase: string | null;
  status: string;
  valid_purchases: number;
  acquisition_business_units: string[];
  acquisition_sellers: string[];
  days_without_purchase: number | null;
}

export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface CustomerPage {
  items: Customer[];
  pagination: Pagination;
}

export interface MonthlyHistory {
  mes_referencia: string;
  status_historico: string;
  data_ultima_compra_ate_mes: string | null;
  dias_sem_compra: number | null;
  quantidade_notas_mes: number;
  quantidade_compras_acumuladas: number;
  faturamento_contabil_mes: number | null;
  faturamento_liquido_mes: number | null;
  impostos_mes: number | null;
  margem_bruta_valor_mes: number | null;
  margem_bruta_percentual_mes: number | null;
  periodo_completo: boolean;
}

export interface CustomerIndicators {
  data_segunda_compra: string | null;
  dias_ate_segunda_compra: number | null;
  maturidade_30d: boolean;
  recompra_30d: boolean | null;
  maturidade_60d: boolean;
  recompra_60d: boolean | null;
  maturidade_90d: boolean;
  recompra_90d: boolean | null;
  maturidade_180d: boolean;
  recompra_180d: boolean | null;
}

export interface CustomerChannelBreakdown {
  channel: string;
  faturamento_contabil: number | null;
  faturamento_liquido: number | null;
  margem_bruta_valor: number | null;
  margem_bruta_percentual: number | null;
  documents: number;
}

export interface CustomerCommercialProfile {
  safra_aquisicao: string | null;
  acquisition_channels: string[];
  acquisition_states: string[];
  acquisition_cities: string[];
  dias_ate_segunda_compra: number | null;
  intervalo_medio_entre_compras: number | null;
  sales_channels: string[];
  business_units: string[];
  sellers: string[];
  companies: string[];
  states: string[];
  cities: string[];
  families: string[];
  channel_breakdown: CustomerChannelBreakdown[];
}

export interface CustomerDetail {
  customer: Customer;
  monthly_history: MonthlyHistory[];
  purchase_indicators: CustomerIndicators;
  commercial_profile?: CustomerCommercialProfile | null;
}

export interface PublicCnpjCnae {
  codigo: string;
  descricao: string;
}

export interface PublicCnpjProfile {
  cnpj: string;
  cnpj_formatted: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  cnae_principal_codigo: string | null;
  cnae_principal_descricao: string | null;
  cnaes_secundarios: PublicCnpjCnae[];
  porte: string | null;
  natureza_juridica: string | null;
  capital_social: number | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  source: string;
  fetched_at: string;
  cached: boolean;
}

export interface CustomerItem extends FinancialMeasures {
  identificador_item: string;
  identificador_documento: string | null;
  document_number: string | null;
  branch: string | null;
  company: string | null;
  customer_code: string | null;
  nome_cliente?: string | null;
  cliente_real?: string | null;
  item: string | null;
  data_emissao: string;
  codigo_produto: string | null;
  descricao_produto: string | null;
  business_unit: string | null;
  familia: string | null;
  subfamilia: string | null;
  vendedor: string | null;
  estado: string | null;
  municipio: string | null;
  canal_venda: string | null;
  quantidade_faturada: number | null;
  quantidade_devolvida?: number | null;
  quantidade_liquida: number | null;
  status_origem: string | null;
  origem_transacao: string | null;
  compra_valida: boolean;
}

export interface CustomerItemPage {
  items: CustomerItem[];
  pagination: Pagination;
}

export interface CohortPeriod {
  month_offset: number;
  eligible_customers: number | null;
  retained_customers: number | null;
  retention_pct: number | null;
  acquired_customers: number | null;
  mature: boolean;
  net_revenue: number | null;
  gross_margin: number | null;
}

export interface Cohort {
  cohort: string;
  initial_customers: number;
  periods: CohortPeriod[];
}

export interface Profit extends Finance {
  dimension: string | null;
}

export interface StatusCount {
  status: string;
  customers: number;
}

export interface Transition {
  period: string;
  previous_status: string;
  status: string;
  customers: number;
  mature: boolean;
}

export interface FilterItem {
  value: string;
}

export interface FilterPage {
  items: FilterItem[];
  pagination: Pagination;
}

export interface Metadata {
  mode: 'synthetic';
  models: Record<string, boolean>;
  first_period: string | null;
  last_period: string | null;
  definitions: Record<string, string>;
  document_key: string[];
  limitations: string[];
}

export interface QueryFilters {
  company?: string | null;
  valid_purchases_gt?: number | null;
  family?: string | null;
  product?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  business_unit?: string | null;
  seller?: string | null;
  state?: string | null;
  city?: string | null;
  sales_channel?: string | null;
  customer_status?: string | null;
  acquisition_cohort?: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
