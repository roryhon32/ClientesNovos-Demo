import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import {
  ApiResponse,
  Metadata,
  Overview,
  AcquisitionPoint,
  CustomerPage,
  CustomerDetail,
  CustomerItemPage,
  Retention,
  Cohort,
  Profit,
  StatusCount,
  Transition,
  FilterPage,
  QueryFilters,
  Finance,
  PublicCnpjProfile,
} from './types';

export const QUERY_KEYS = {
  metadata: ['metadata'] as const,
  overview: (filters: QueryFilters) => ['overview', filters] as const,
  acquisition: (filters: QueryFilters) => ['acquisition', filters] as const,
  customers: (params: Record<string, unknown>) => ['customers', params] as const,
  customerDetail: (id: string, filters?: QueryFilters) => ['customerDetail', id, filters] as const,
  retention: (filters: QueryFilters) => ['retention', filters] as const,
  cohorts: (filters: QueryFilters, maxMonths: number) => ['cohorts', filters, maxMonths] as const,
  profitability: (filters: QueryFilters, groupBy: string, limit = 100) => ['profitability', filters, groupBy, limit] as const,
  lifecycle: (referenceDate?: string) => ['lifecycle', referenceDate] as const,
  transitions: (filters: QueryFilters) => ['transitions', filters] as const,
  filters: (dimension: string, filters?: QueryFilters) => ['filters', dimension, filters] as const,
};

export function useMetadata() {
  return useQuery({
    queryKey: QUERY_KEYS.metadata,
    queryFn: ({ signal }) => fetchApi<ApiResponse<Metadata>>('/metadata', undefined, signal),
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

export function useOverview(filters: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.overview(filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<Overview>>(
        '/overview',
        filters as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useFinancialSummary(filters: QueryFilters) {
  return useQuery({
    queryKey: ['finance', filters],
    queryFn: ({ signal }) => fetchApi<ApiResponse<Finance>>('/finance', { ...filters }, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function useAcquisition(filters: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.acquisition(filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<AcquisitionPoint[]>>(
        '/acquisition',
        filters as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export interface CustomerQueryParams extends QueryFilters {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  sort?: string;
  search?: string;
}

export function useCustomers(params: CustomerQueryParams) {
  return useQuery({
    queryKey: QUERY_KEYS.customers(params as Record<string, unknown>),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<CustomerPage>>(
        '/customers',
        params as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCustomerDetail(customerId: string | null, filters?: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.customerDetail(customerId || '', filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<CustomerDetail>>(
        `/customers/${customerId}`,
        filters as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    enabled: Boolean(customerId && /^\d{8}$/.test(customerId)),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCustomerPublicCnpj(customerId: string | null, enabled: boolean, refresh: boolean = false) {
  return useQuery({
    queryKey: ['customerPublicCnpj', customerId, refresh],
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<PublicCnpjProfile>>(
        `/customers/${customerId}/cnpj-publico`,
        refresh ? { refresh: true } : undefined,
        signal
      ),
    enabled: enabled && Boolean(customerId && /^\d{8}$/.test(customerId)),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });
}

export interface CustomerItemParams extends QueryFilters {
  page?: number;
  page_size?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  business_unit?: string;
}

export function useCustomerItems(customerId: string, params: CustomerItemParams, enabled = true) {
  return useQuery({
    queryKey: ['customerItems', customerId, params],
    queryFn: ({ signal }) => fetchApi<ApiResponse<CustomerItemPage>>(`/customers/${customerId}/items`, { ...params }, signal),
    enabled: enabled && /^\d{8}$/.test(customerId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useRetention(filters: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.retention(filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<Retention>>(
        '/retention',
        filters as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCohorts(filters: QueryFilters, maxMonths: number = 12) {
  return useQuery({
    queryKey: QUERY_KEYS.cohorts(filters, maxMonths),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<Cohort[]>>(
        '/cohorts',
        {
          ...(filters as Record<string, string | number | boolean | null | undefined>),
          max_months: maxMonths,
        },
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useProfitability(filters: QueryFilters, groupBy: string = 'business_unit', limit: number = 100) {
  return useQuery({
    queryKey: QUERY_KEYS.profitability(filters, groupBy, limit),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<Profit[]>>(
        '/profitability',
        {
          ...(filters as Record<string, string | number | boolean | null | undefined>),
          group_by: groupBy,
          limit,
        },
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useLifecycle(referenceDate?: string, filters: QueryFilters = {}) {
  const { start_date: _start, end_date: _end, ...dimensions } = filters;
  return useQuery({
    queryKey: [...QUERY_KEYS.lifecycle(referenceDate), dimensions],
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<StatusCount[]>>(
        '/lifecycle',
        { ...dimensions, ...(referenceDate ? { reference_date: referenceDate } : {}) },
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useLifecycleTransitions(filters: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.transitions(filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<Transition[]>>(
        '/lifecycle/transitions',
        filters as Record<string, string | number | boolean | null | undefined>,
        signal
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useFilterOptions(dimension: string, filters?: QueryFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.filters(dimension, filters),
    queryFn: ({ signal }) =>
      fetchApi<ApiResponse<FilterPage>>(
        '/filters',
        {
          dimension,
          ...(filters ? (filters as Record<string, string | number | boolean | null | undefined>) : {}),
        },
        signal
      ),
    staleTime: 1000 * 60 * 10,
  });
}
