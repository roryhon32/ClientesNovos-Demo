import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider } from '../context/FilterContext';
import { OverviewPage } from '../pages/OverviewPage';
import { AcquisitionPage } from '../pages/AcquisitionPage';

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="synthetic-chart" /> }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => null }));

const requests: URL[] = [];
const clients: QueryClient[] = [];

function syntheticResponse(url: URL) {
  const endpoint = url.pathname.split('/').at(-1);
  const bu = url.searchParams.get('business_unit');
  const month = url.searchParams.get('start_date') === '2026-09-01';
  const empty = bu === 'Sem movimento';
  const count = empty ? 0 : bu === 'Corporativo' && month ? 7 : bu === 'Corporativo' ? 11 : month ? 13 : 23;
  const finance = { faturamento_contabil: count * 100, faturamento_liquido: count * 90, impostos: count * 10, percentual_impostos: 10, margem_bruta_valor: count * 18, margem_bruta_percentual: empty ? null : 20, documentos_distintos: count, clientes_identificados: count, ticket_medio_contabil: empty ? null : 100, ticket_medio_liquido: empty ? null : 90 };
  const window = { days: 90, eligible_customers: count, immature_customers: 0, repurchased_customers: 0, rate_pct: empty ? null : 0, mature: true };
  let data: unknown;
  if (endpoint === 'overview') data = { company_transaction_revenue: finance, acquired_customer_period_revenue: finance, acquired_customer_lifetime_revenue: finance, acquired_customers: count, acquisition_month_net_revenue: finance.faturamento_liquido, repurchase_90d: window, acquisition_growth_previous_period_pct: null };
  else if (endpoint === 'acquisition') data = empty ? [] : [{ period: '2026-09-01', new_customers: count, first_purchase_accounting_revenue: finance.faturamento_contabil, first_purchase_net_revenue: finance.faturamento_liquido, first_purchase_gross_margin: finance.margem_bruta_valor, growth_pct: null }];
  else if (endpoint === 'profitability') {
    data = empty ? [] : url.searchParams.get('group_by') === 'seller'
      ? [{ ...finance, dimension: 'VENDEDOR SYN' }]
      : [{ ...finance, dimension: 'Corporativo' }, { ...finance, dimension: 'Sem movimento', clientes_identificados: 1 }];
  } else if (endpoint === 'customers') data = {
    items: empty ? [] : [{ ...finance, customer_id: '00000001', name: 'NOME SYN', real_customer_names: [bu === 'Corporativo' && month ? 'CLIENTE REAL CORP SET' : 'CLIENTE REAL SYN'], customer_names: ['NOME SYN'], first_purchase: '2026-09-01', last_purchase: '2026-09-01', second_purchase: null, status: 'NOVO', valid_purchases: 1, acquisition_business_units: ['Corporativo'], acquisition_sellers: ['VENDEDOR SYN'], days_without_purchase: 29 }],
    pagination: { page: 1, page_size: 5, total_items: empty ? 0 : 1, total_pages: empty ? 0 : 1 },
  };
  else if (endpoint === 'filters') data = { items: [{ value: 'Corporativo' }], pagination: { page: 1, page_size: 25, total_items: 1, total_pages: 1 } };
  else throw new Error(`Unexpected request in synthetic test: ${url.pathname}`);
  return { meta: { reference_date: '2026-10-23' }, data };
}

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const response = syntheticResponse(url);
    return { ok: true, status: 200, json: async () => response };
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="filter-location">{location.search}</output>;
}

function setup(page: 'overview' | 'acquisition' = 'overview') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/${page}`]}><FilterProvider>
      {page === 'overview' ? <OverviewPage /> : <AcquisitionPage />}
      <LocationProbe />
    </FilterProvider></MemoryRouter>
  </QueryClientProvider>);
}

function matchingRequest(endpoint: string, expected: Record<string, string>, groupBy?: string) {
  return requests.some(url => url.pathname.endsWith(`/${endpoint}`)
    && (!groupBy || url.searchParams.get('group_by') === groupBy)
    && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value));
}

async function selectSeptember() {
  const summary = await screen.findByText('Filtrar mês pelo gráfico');
  (summary.parentElement as HTMLDetailsElement).open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Set 2026' }));
}

describe('Filtros cruzados nas páginas com consultas reais e transporte sintético', () => {
  it('aplica BU e mês conjuntamente a KPIs, aquisição, distribuição e tabela, e permite desfazer seleções', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Filtrar Corporativo' }));
    await waitFor(() => expect(matchingRequest('overview', { business_unit: 'Corporativo' })).toBe(true));
    await selectSeptember();
    const expected = { business_unit: 'Corporativo', start_date: '2026-09-01', end_date: '2026-09-30' };
    await waitFor(() => {
      for (const endpoint of ['overview', 'acquisition', 'profitability', 'customers']) expect(matchingRequest(endpoint, expected)).toBe(true);
      expect(screen.getByRole('heading', { name: '7', level: 3 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'CLIENTE REAL CORP SET' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Remover filtro BU' })).toHaveTextContent('Corporativo');
    expect(await screen.findByRole('button', { name: 'Filtrar Corporativo' })).toHaveAttribute('aria-pressed', 'true');
    await selectSeptember();
    await waitFor(() => expect(screen.getByTestId('filter-location')).not.toHaveTextContent('start_date'));
    expect(screen.getByTestId('filter-location')).toHaveTextContent('business_unit=Corporativo');
    fireEvent.click(await screen.findByRole('button', { name: 'Filtrar Corporativo' }));
    await waitFor(() => expect(screen.getByTestId('filter-location')).toBeEmptyDOMElement());
    expect(await screen.findByRole('heading', { name: '23', level: 3 })).toBeInTheDocument();
  });

  it('mantém chips quando a seleção produz resultado vazio e recupera todos os componentes ao limpar', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Filtrar Sem movimento' }));
    expect(await screen.findByText('Sem dados de aquisição')).toBeInTheDocument();
    expect(await screen.findByText('Sem dados de distribuição')).toBeInTheDocument();
    expect(screen.getByText('Nenhum cliente encontrado com os critérios especificados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover filtro BU' })).toHaveTextContent('Sem movimento');
    for (const endpoint of ['overview', 'acquisition', 'profitability', 'customers']) expect(matchingRequest(endpoint, { business_unit: 'Sem movimento' })).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('button', { name: 'CLIENTE REAL SYN' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Filtrar Corporativo' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Sem dados de aquisição')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('combina vendedor e mês na aquisição e atualiza ambas as distribuições financeiras', async () => {
    setup('acquisition');
    const summary = await screen.findByText('Filtrar Vendedor pelo gráfico');
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent.click(screen.getByRole('button', { name: 'VENDEDOR SYN' }));
    await waitFor(() => expect(matchingRequest('overview', { seller: 'VENDEDOR SYN' })).toBe(true));
    await selectSeptember();
    const expected = { seller: 'VENDEDOR SYN', start_date: '2026-09-01', end_date: '2026-09-30' };
    await waitFor(() => {
      expect(matchingRequest('overview', expected)).toBe(true);
      expect(matchingRequest('acquisition', expected)).toBe(true);
      expect(matchingRequest('profitability', expected, 'business_unit')).toBe(true);
      expect(matchingRequest('profitability', expected, 'seller')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Remover filtro Vendedor' })).toHaveTextContent('VENDEDOR SYN');
    (await screen.findByText('Filtrar Vendedor pelo gráfico')).parentElement!.setAttribute('open', '');
    fireEvent.click(screen.getByRole('button', { name: 'VENDEDOR SYN' }));
    await waitFor(() => expect(screen.getByTestId('filter-location')).not.toHaveTextContent('seller'));
    expect(screen.getByTestId('filter-location')).toHaveTextContent('start_date=2026-09-01');
  });
});
