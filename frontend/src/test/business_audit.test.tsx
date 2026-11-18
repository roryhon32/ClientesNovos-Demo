// Defeitos abertos: it.fails exige que a asserção do contrato continue falhando.
// Os hooks são transporte sintético; componentes e seleção de valores são reais.
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcquisitionPage } from '../pages/AcquisitionPage';
import { OverviewPage } from '../pages/OverviewPage';
import { CustomerTable } from '../components/customers/CustomerTable';
import { CustomerDetailDrawer } from '../components/customers/CustomerDetailDrawer';
import type { Customer } from '../api/types';

const state = vi.hoisted(() => ({ overview: {} as any, customer: {} as any }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => null }));
vi.mock('../context/FilterContext', () => ({ useGlobalFilters: () => ({ filters: {}, toggleFilter: vi.fn(), toggleMonth: vi.fn() }) }));
vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/GlobalFilters', () => ({ GlobalFilters: () => null }));
vi.mock('../components/charts/AcquisitionBarChart', () => ({ AcquisitionBarChart: () => null }));
vi.mock('../components/charts/DistributionDonutChart', () => ({ DistributionDonutChart: () => null }));
vi.mock('../components/charts/ProfitabilityBarChart', () => ({ ProfitabilityBarChart: () => null }));
vi.mock('../components/customers/CustomerItemsPanel', () => ({ CustomerItemsPanel: () => null }));
vi.mock('../components/customers/CustomerBehaviorPanel', () => ({ CustomerBehaviorPanel: () => null }));
vi.mock('../api/queries', () => ({
  useOverview: () => ({ data: { data: state.overview }, isLoading: false }),
  useAcquisition: () => ({ data: { data: [{ period: '2026-01-01', new_customers: 1, first_purchase_net_revenue: 80 }] } }),
  useProfitability: () => ({ data: { data: [] } }),
  useCustomers: () => ({ data: { data: { items: [] } } }),
  useCustomerDetail: () => ({ data: { data: { customer: state.customer, monthly_history: [] } } }),
  useCustomerPublicCnpj: () => ({ data: null, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }),
}));

beforeEach(() => {
  state.overview = {
    acquired_customers: 1, acquisition_month_net_revenue: 400,
    acquired_customer_period_revenue: { faturamento_liquido: 400, margem_bruta_percentual: 20 },
    company_transaction_revenue: { margem_bruta_percentual: 50 },
    acquired_customer_lifetime_revenue: { faturamento_liquido: 400 },
    repurchase_90d: { rate_pct: null, eligible_customers: 0, repurchased_customers: 0 },
  };
  state.customer = {
    customer_id: '00000001', name: 'AUDITORIA SINTÉTICA', status: 'RECORRENTE', valid_purchases: 1,
    first_purchase: '2026-09-10', last_purchase: '2026-09-10', second_purchase: null,
    acquisition_business_units: [], acquisition_sellers: [], days_without_purchase: 42,
  };
});
afterEach(cleanup);

function setup(page: React.ReactNode) {
  render(<MemoryRouter>{page}</MemoryRouter>);
}
function card(title: string) {
  return within(screen.getByText(title).closest('div.group') as HTMLElement);
}

it.fails('AUD-05: cartão 1ª compra deve usar primeira data (80), não mês inteiro (400)', () => {
  // Livro conhecido: entrada em 10/01 de 80; compra posterior em 20/01 de 320.
  setup(<AcquisitionPage />);
  expect(card('Fat. 1ª Compra Líquido').getByRole('heading', { level: 3 })).toHaveTextContent('R$ 80,00');
});

it.fails('AUD-06: receita desconhecida do período não pode ser trocada pela do mês', () => {
  state.overview.acquired_customer_period_revenue.faturamento_liquido = null;
  setup(<OverviewPage />);
  expect(card('Receita Gerada').getByRole('heading', { level: 3 })).toHaveTextContent('—');
});

it.fails('AUD-06: margem desconhecida dos adquiridos não pode usar margem da empresa', () => {
  state.overview.acquired_customer_period_revenue.margem_bruta_percentual = null;
  setup(<OverviewPage />);
  expect(card('Margem Bruta (%)').getByRole('heading', { level: 3 })).toHaveTextContent('—');
});

it('AUD-03: tabela deve preservar RECORRENTE fornecido pela API', () => {
  setup(<CustomerTable customers={[state.customer as Customer]} />);
  expect(screen.getByText('RECORRENTE')).toBeInTheDocument();
});

it('AUD-03: dossiê deve preservar RECORRENTE fornecido pela API', () => {
  setup(<CustomerDetailDrawer customerId="00000001" onClose={vi.fn()} />);
  expect(screen.getByText('RECORRENTE')).toBeInTheDocument();
});
