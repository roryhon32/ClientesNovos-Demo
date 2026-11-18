import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { ApiResponse, FinancialMeasures, Pagination, QueryFilters } from './types';

export interface BusinessUnitBehavior extends FinancialMeasures {
  business_unit: string | null;
  documents: number;
  occasions: number;
  repurchased: boolean;
  net_share_pct: number | null;
}
export interface MonthlyBusinessUnit extends FinancialMeasures {
  month: string;
  business_unit: string | null;
  documents: number;
}
export interface ProductBehavior extends FinancialMeasures {
  product_id: string | null;
  descriptions: string[];
  business_units: string[];
  quantity: number | null;
  documents: number;
  occasions: number;
  first_purchase: string | null;
  last_purchase: string | null;
  mean_days_between_purchases: number | null;
  repurchased: boolean;
}
export interface FirstProduct {
  product_id: string | null;
  descriptions: string[];
  business_units: string[];
  date: string;
  documents: number;
}
export interface CustomerBehavior {
  summary: FinancialMeasures & {
    valid_documents: number;
    occasions: number;
    general_repurchase: boolean;
    same_bu_repurchase: boolean;
    same_product_repurchase: boolean;
    mean_days_between_purchases: number | null;
    predominant_business_units: (string | null)[];
    occasion_mode: 'dates';
  };
  business_units: BusinessUnitBehavior[];
  monthly_business_units: MonthlyBusinessUnit[];
  first_products: FirstProduct[];
  top_products_quantity: ProductBehavior[];
  top_products_revenue: ProductBehavior[];
  products: ProductBehavior[];
  mix: {
    current_start: string;
    current_end: string;
    previous_start: string;
    previous_end: string;
    period_basis: string;
    previous_period_complete: boolean;
    new_in_period: string[];
    resumed_products: string[];
    not_observed_in_period: string[];
    retained_products: string[];
    current_products: number;
    previous_products: number;
    current_top_product_share_pct: number | null;
    previous_top_product_share_pct: number | null;
    concentration_basis: string;
  };
}
export interface ProductCodeDetail {
  code: string;
  description: string;
  customers: number;
  eligible_customers: number;
  excluded_recent_customers: number;
  repurchased_customers: number;
  repurchase_rate_pct: number | null;
  minimum_observation_days: number | null;
  maximum_observation_days: number | null;
}

export interface ProductRepurchase {
  product_id: string;
  product_name?: string;
  descriptions: string[];
  codes?: string[];
  customers: number;
  eligible_customers: number;
  excluded_recent_customers: number;
  repurchased_customers: number;
  repurchase_rate_pct: number | null;
  minimum_observation_days: number | null;
  maximum_observation_days: number | null;
  code_details?: ProductCodeDetail[];
}
export interface ProductRepurchasePage {
  items: ProductRepurchase[];
  pagination: Pagination;
  occasion_mode: 'dates';
  min_observation_days: number;
  observation_end: string;
  group_by?: 'product' | 'product_id';
}
export interface ProductRepurchaseParams {
  page?: number;
  page_size?: number;
  search?: string;
  min_observation_days?: number;
  sort_by?: 'repurchase_rate_pct' | 'customers' | 'repurchased_customers' | 'product_id' | 'product' | 'product_name';
  sort_order?: 'asc' | 'desc';
  group_by?: 'product' | 'product_id';
}

export function useCustomerBehavior(customerId: string | null, filters: QueryFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['customerBehavior', customerId, filters],
    queryFn: ({ signal }) => fetchApi<ApiResponse<CustomerBehavior>>(`/customers/${customerId}/behavior`, { ...filters }, signal),
    enabled: enabled && Boolean(customerId && /^\d{8}$/.test(customerId)),
    staleTime: 1000 * 60 * 2,
  });
}

export function useProductRepurchase(filters: QueryFilters, params: ProductRepurchaseParams = {}) {
  return useQuery({
    queryKey: ['productRepurchase', filters, params],
    queryFn: ({ signal }) => fetchApi<ApiResponse<ProductRepurchasePage>>('/products/repurchase', { ...filters, ...params }, signal),
    staleTime: 1000 * 60 * 2,
  });
}

export interface ProductInvoiceDetail {
  num_docto: string;
  serie: string | null;
  data_emissao: string | null;
  cliente_real: string;
  nome_cliente: string | null;
  raiz_cnpj: string | null;
  faturamento_liquido: number | null;
  margem_bruta_valor: number | null;
  margem_bruta_percentual: number | null;
  itens: number;
}

export interface ProductInvoicesPage {
  items: ProductInvoiceDetail[];
  pagination: Pagination;
  code: string;
}

export interface ProductInvoicesParams {
  page?: number;
  page_size?: number;
  sort_by?: 'data_emissao' | 'num_docto' | 'cliente_real' | 'faturamento_liquido' | 'margem_bruta_valor' | 'margem_bruta_percentual';
  sort_order?: 'asc' | 'desc';
}

export function useProductInvoices(
  code: string | null | undefined,
  filters: QueryFilters = {},
  params: ProductInvoicesParams = {},
  enabled = true
) {
  return useQuery({
    queryKey: ['productInvoices', code, filters, params],
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<ProductInvoicesPage>>('/products/invoices', { ...filters, ...params, code: code || '' }, signal),
    enabled: enabled && Boolean(code),
    staleTime: 1000 * 60 * 2,
  });
}

