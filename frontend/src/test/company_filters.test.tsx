import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { FilterProvider } from '../context/FilterContext';
import { Sidebar } from '../components/layout/Sidebar';
import { OverviewPage } from '../pages/OverviewPage';
import { acquisitionPeriodLabel } from '../components/common/AcquisitionPeriod';

vi.mock('echarts-for-react', () => ({ default: () => <div /> }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => null }));
vi.mock('../api/queries', async () => {
  const { useGlobalFilters } = await import('../context/FilterContext');
  return {
    useFilterOptions: (dimension: string) => ({ data: { data: { items: dimension === 'company'
      ? [{ value: 'COMPANY A' }, { value: 'COMPANY B' }] : [] } } }),
    useOverview: () => {
      const { filters } = useGlobalFilters();
      return { data: { meta: { reference_date: '2026-10-23' }, data: {
        acquired_customers: filters.company ? 2 : 3,
        // Deliberadamente diferente da contagem de aquisição.
        company_transaction_revenue: { clientes_identificados: 722 },
        repurchase_90d: { rate_pct: null },
      } } };
    },
    useAcquisition: () => ({ data: { data: [] } }),
    useProfitability: () => ({ data: { data: [] } }),
    useCustomers: () => ({ data: { data: { items: [] } } }),
    useCustomerDetail: () => ({}),
    useCustomerPublicCnpj: () => ({ data: null, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }),
  };
});
afterEach(cleanup);

function Probe() {
  return <output data-testid="query">{useLocation().search}</output>;
}
function setup() {
  render(<MemoryRouter initialEntries={['/overview?start_date=2026-10-01&end_date=2026-10-31']}>
    <FilterProvider><Sidebar /><Routes>
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/customers" element={<p>Lista de clientes</p>} />
    </Routes><Probe /></FilterProvider>
  </MemoryRouter>);
}

it('seleciona empresa, filtra o cartão por aquisição e preserva período na navegação', () => {
  setup();
  const card = within(screen.getByText('Novos Clientes', { selector: 'p' }).closest('div.group') as HTMLElement);
  expect(card.getByRole('heading', { level: 3 })).toHaveTextContent('3');
  expect(card.getByText('1ª compra de 01/10/2026 a 23/10/2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
  fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'COMPANY B' } });
  expect(screen.getByTestId('query')).toHaveTextContent('company=COMPANY+B');
  expect(card.getByRole('heading', { level: 3 })).toHaveTextContent('2');
  expect(screen.getByRole('button', { name: 'Remover filtro Empresa' })).toHaveTextContent('COMPANY B');
  fireEvent.click(screen.getByRole('link', { name: 'Clientes' }));
  expect(screen.getByTestId('query')).toHaveTextContent('company=COMPANY+B');
  expect(screen.getByTestId('query')).toHaveTextContent('start_date=2026-10-01');
});

it('permite remover o chip da empresa sem apagar o período', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
  fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'COMPANY A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Empresa' }));
  expect(screen.getByLabelText('Empresa')).toHaveValue('');
  expect(screen.getByTestId('query')).not.toHaveTextContent('company=');
  expect(screen.getByTestId('query')).toHaveTextContent('end_date=2026-10-31');
});

it('explica histórico completo e limita o fim à referência disponível', () => {
  expect(acquisitionPeriodLabel({}, '2026-10-23')).toBe('1ª compra no histórico até 23/10/2026');
  expect(acquisitionPeriodLabel({ start_date: '2026-01-01', end_date: '2026-01-31' }, '2026-10-23'))
    .toBe('1ª compra de 01/01/2026 a 31/01/2026');
  expect(acquisitionPeriodLabel({ start_date: '2026-11-01', end_date: '2026-11-30' }, '2026-10-23'))
    .toBe('Período posterior à referência (23/10/2026)');
});
