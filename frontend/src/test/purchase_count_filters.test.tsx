import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { FilterProvider, useGlobalFilters } from '../context/FilterContext';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { Sidebar } from '../components/layout/Sidebar';
import { CustomerItemsPanel } from '../components/customers/CustomerItemsPanel';

vi.mock('../api/queries', () => ({
  useFilterOptions: () => ({ data: { data: { items: [] } } }),
  useCustomerItems: () => ({ data: {
    meta: { reference_date: '2026-10-22' },
    data: {
      items: [
        { identificador_item: 'SYN-SALE', document_number: 'SYN-01', descricao_produto: 'Produto sintético vendido', quantidade_faturada: 2, quantidade_devolvida: 0, compra_valida: true },
        { identificador_item: 'SYN-RETURN', document_number: 'SYN-02', descricao_produto: 'Produto sintético devolvido', quantidade_faturada: 2, quantidade_devolvida: 2, compra_valida: false },
      ],
      pagination: { page: 1, total_pages: 1, total_items: 2 },
    },
  } }),
}));
vi.mock('../components/common/WaveBackground', () => ({ WaveBackground: () => null }));
afterEach(cleanup);

function Probe() {
  const { filters } = useGlobalFilters();
  const location = useLocation();
  return <>
    <output data-testid="purchase-filter-state">{JSON.stringify(filters)}</output>
    <output data-testid="purchase-filter-location">{location.pathname}{location.search}</output>
    <Link to="/retention">Navegar sem parâmetros</Link>
  </>;
}
function setup(route = '/customers') {
  render(<MemoryRouter initialEntries={[route]}><FilterProvider>
    <Header onToggleFilters={() => {}} /><GlobalFilters isOpen onClose={() => {}} /><Sidebar /><Probe />
  </FilterProvider></MemoryRouter>);
}
const state = () => JSON.parse(screen.getByTestId('purchase-filter-state').textContent!);
const choose = (value: string) => fireEvent.change(screen.getByRole('combobox', { name: 'Compras válidas' }), { target: { value } });

describe('Filtro global de documentos de compras válidas', () => {
  it('oferece limites >1, >5, >10 e >20 e mantém um número no estado e na URL', () => {
    setup('/customers?business_unit=BU-SYN');
    const select = screen.getByRole('combobox', { name: 'Compras válidas' });
    for (const threshold of [1, 5, 10, 20]) {
      expect(within(select).getByRole('option', { name: new RegExp(`\\(>${threshold}\\)`) })).toBeInTheDocument();
      choose(String(threshold));
      expect(state()).toMatchObject({ valid_purchases_gt: threshold, business_unit: 'BU-SYN' });
      expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent(`valid_purchases_gt=${threshold}`);
      expect(screen.getByRole('button', { name: 'Remover filtro Compras válidas' })).toHaveTextContent(`Compras válidas: > ${threshold}`);
    }
    expect(screen.getByText(/Total de notas distintas válidas do cliente/)).toHaveTextContent('Devoluções não contam.');
  });

  it('preserva o limite na sidebar e ao navegar sem parâmetros', () => {
    setup('/products?valid_purchases_gt=5&business_unit=BU-SYN&product=PROD-SYN');
    expect(state().valid_purchases_gt).toBe(5);
    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/customers?valid_purchases_gt=5&business_unit=BU-SYN');
    fireEvent.click(screen.getByRole('link', { name: 'Navegar sem parâmetros' }));
    expect(state()).toMatchObject({ valid_purchases_gt: 5, business_unit: 'BU-SYN', product: null });
    expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent('/retention?');
    expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent('valid_purchases_gt=5');
  });

  it('aceita limite personalizado zero, preserva-o na navegação e permite removê-lo pelo chip', () => {
    setup();
    choose('custom');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total de compras maior que' }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar limite' }));
    expect(state().valid_purchases_gt).toBe(0);
    expect(screen.getByRole('button', { name: 'Remover filtro Compras válidas' })).toHaveTextContent('> 0');
    expect(screen.getByRole('button', { name: /^Filtros\s*1$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Navegar sem parâmetros' }));
    expect(state().valid_purchases_gt).toBe(0);
    expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent('valid_purchases_gt=0');
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Compras válidas' }));
    expect(state().valid_purchases_gt).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });

  it('rejeita limite negativo, fracionário e vazio sem substituir o filtro aplicado', () => {
    setup('/customers?valid_purchases_gt=5');
    choose('custom');
    expect(screen.getByRole('spinbutton', { name: 'Total de compras maior que' })).toHaveAttribute('max', '2147483647');
    for (const invalid of ['-1', '1.5', '', '2147483648', '9007199254740992']) {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Total de compras maior que' }), { target: { value: invalid } });
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar limite' }));
      expect(screen.getByRole('alert')).toHaveTextContent('número inteiro maior ou igual a zero');
      expect(screen.getByRole('alert')).toHaveTextContent('menor ou igual a 2147483647');
      expect(state().valid_purchases_gt).toBe(5);
      expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent('valid_purchases_gt=5');
    }
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total de compras maior que' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar limite' }));
    expect(state().valid_purchases_gt).toBe(7);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Total de compras maior que' }), { target: { value: '2147483647' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar limite' }));
    expect(state().valid_purchases_gt).toBe(2147483647);
  });

  it('limpa o filtro ao selecionar todos e ao limpar os filtros globais', () => {
    setup('/customers?valid_purchases_gt=1&business_unit=BU-SYN');
    choose('');
    expect(state()).toMatchObject({ valid_purchases_gt: null, business_unit: 'BU-SYN' });
    choose('5');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    expect(Object.values(state()).every(value => value === null)).toBe(true);
    expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent(/^\/customers$/);
  });

  it('descarta limites inválidos vindos da URL e normaliza números válidos', () => {
    for (const invalid of ['-1', '2147483648']) {
      const view = render(<MemoryRouter initialEntries={[`/customers?valid_purchases_gt=${invalid}`]}><FilterProvider><Probe /></FilterProvider></MemoryRouter>);
      expect(state().valid_purchases_gt).toBeNull();
      expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent(/^\/customers$/);
      view.unmount();
    }
    setup('/customers?valid_purchases_gt=005');
    expect(state().valid_purchases_gt).toBe(5);
    expect(screen.getByTestId('purchase-filter-location')).toHaveTextContent('valid_purchases_gt=5');
  });
});

it('mostra quantidade devolvida e validade da compra sem abrir os detalhes financeiros', () => {
  render(<CustomerItemsPanel customerId="00000001" />);
  expect(screen.getByRole('columnheader', { name: 'Qtd. devolvida' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Compra válida' })).toBeInTheDocument();
  const returned = screen.getByRole('row', { name: /Produto sintético devolvido/ });
  expect(within(returned).getByRole('cell', { name: 'Não', exact: true })).toBeInTheDocument();
  expect(within(returned).getAllByRole('cell', { name: '2', exact: true })).toHaveLength(2);
  const sale = screen.getByRole('row', { name: /Produto sintético vendido/ });
  expect(within(sale).getByRole('cell', { name: 'Sim', exact: true })).toBeInTheDocument();
});
