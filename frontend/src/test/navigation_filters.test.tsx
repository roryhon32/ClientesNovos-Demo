import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider } from '../context/FilterContext';
import { AppShell } from '../components/layout/AppShell';
import { OverviewPage } from '../pages/OverviewPage';
import { AcquisitionPage } from '../pages/AcquisitionPage';
import { CustomersPage } from '../pages/CustomersPage';
import { RetentionPage } from '../pages/RetentionPage';
import { ProfitabilityPage } from '../pages/ProfitabilityPage';
import { LifecyclePage } from '../pages/LifecyclePage';

// Mock ECharts to prevent canvas errors in jsdom
vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echarts-mock" />,
}));

// Mock API client
vi.mock('../api/client', () => ({
  fetchApi: vi.fn().mockImplementation((endpoint: string) => {
    if (endpoint.includes('overview')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: {
          company_transaction_revenue: { faturamento_liquido: 50000 },
          acquired_customers: 92,
          acquisition_month_net_revenue: 25000,
          repurchase_90d: { days: 90, eligible_customers: 75, repurchased_customers: 25, rate_pct: 33.3, mature: false },
          acquisition_growth_previous_period_pct: 12.5,
        },
      });
    }
    if (endpoint.includes('acquisition')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: [
          { period: '2024-01-01', new_customers: 10, first_purchase_net_revenue: 20000, growth_pct: null },
        ],
      });
    }
    if (endpoint.includes('customers')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: {
          items: [
            {
              customer_id: '00000001',
              name: 'CLIENTE TESTE',
              first_purchase: '2024-01-01',
              status: 'RECORRENTE',
              valid_purchases: 3,
              faturamento_liquido: 15000,
              margem_bruta_percentual: 30.0,
            },
          ],
          pagination: { page: 1, page_size: 15, total_items: 1, total_pages: 1 },
        },
      });
    }
    if (endpoint.includes('retention')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: {
          windows: [
            { days: 30, eligible_customers: 50, repurchased_customers: 10, rate_pct: 20.0, mature: true, immature_customers: 0 },
            { days: 90, eligible_customers: 50, repurchased_customers: 20, rate_pct: 40.0, mature: true, immature_customers: 0 },
          ],
          mean_days_to_second_purchase: 45,
          median_days_to_second_purchase: 30,
        },
      });
    }
    if (endpoint.includes('cohorts')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: [
          {
            cohort: '2024-01',
            initial_customers: 10,
            periods: [
              { month_offset: 0, eligible_customers: 10, retained_customers: null, retention_pct: null, mature: true },
              { month_offset: 1, eligible_customers: 10, retained_customers: 5, retention_pct: 50.0, mature: true },
            ],
          },
        ],
      });
    }
    if (endpoint.includes('profitability')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: [
          { dimension: 'BU TESTE', faturamento_liquido: 10000, faturamento_contabil: 12000, impostos: 2000, margem_bruta_valor: 3000, margem_bruta_percentual: 30.0, clientes_identificados: 10, documentos_distintos: 15 },
        ],
      });
    }
    if (endpoint.includes('lifecycle/transitions')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: [
          { period: '2024-02-01', previous_status: 'NOVO', status: 'RECORRENTE', customers: 5, mature: true },
        ],
      });
    }
    if (endpoint.includes('lifecycle')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: [
          { status: 'NOVO', customers: 10 },
          { status: 'RECORRENTE', customers: 25 },
        ],
      });
    }
    if (endpoint.includes('filters')) {
      return Promise.resolve({
        meta: { reference_date: '2026-10-22' },
        data: {
          items: [{ value: 'BU SINTETICA A' }, { value: 'BU SINTETICA B' }],
          pagination: { page: 1, page_size: 25, total_items: 2, total_pages: 1 },
        },
      });
    }
    return Promise.resolve({ meta: { reference_date: '2026-10-22' }, data: {} });
  }),
}));

function renderWithProviders(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <FilterProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/acquisition" element={<AcquisitionPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/retention" element={<RetentionPage />} />
              <Route path="/profitability" element={<ProfitabilityPage />} />
              <Route path="/lifecycle" element={<LifecyclePage />} />
            </Route>
          </Routes>
        </FilterProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Navigation and Page Rendering Integration', () => {
  it('renders OverviewPage with KPIs and sections', async () => {
    renderWithProviders('/overview');
    expect(screen.getAllByText('Novos Clientes').length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(screen.getByText('92')).toBeInTheDocument();
      expect(screen.getByText('Nome Cliente: CLIENTE TESTE')).toBeInTheDocument();
    });
  });

  it('renders AcquisitionPage with filters and metrics', async () => {
    renderWithProviders('/acquisition');
    expect(screen.getByText('Aquisição de Clientes')).toBeInTheDocument();
  });

  it('renders CustomersPage with table', async () => {
    renderWithProviders('/customers');
    expect(screen.getByText('Base de Clientes')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Nome Cliente: CLIENTE TESTE')).toBeInTheDocument();
    });
  });

  it('renders RetentionPage with cohorts', async () => {
    renderWithProviders('/retention');
    expect(screen.getByText('Retenção e Cohorts')).toBeInTheDocument();
  });

  it('renders ProfitabilityPage with dimensions', async () => {
    renderWithProviders('/profitability');
    expect(screen.getByText('Rentabilidade & Margem')).toBeInTheDocument();
  });

  it('renders LifecyclePage with status breakdown', async () => {
    renderWithProviders('/lifecycle');
    expect(screen.getByText('Ciclo de Vida do Cliente')).toBeInTheDocument();
  });
});
