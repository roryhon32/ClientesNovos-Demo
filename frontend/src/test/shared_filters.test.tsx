import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { FilterProvider, useGlobalFilters } from '../context/FilterContext';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { QueryFilters } from '../api/types';

// Only the data boundary is synthetic; routing, header and filter state are real.
vi.mock('../api/queries', () => ({ useFilterOptions: () => ({ data: { data: { items: [{ value: 'Corporativo' }, { value: 'Varejo' }] } } }) }));
vi.mock('../components/common/WaveBackground', () => ({ WaveBackground: () => null }));

afterEach(cleanup);

function Probe({ observe }: { observe: (filters: QueryFilters) => void }) {
  const { filters, toggleFilter, toggleMonth } = useGlobalFilters();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { observe(filters); }, [filters, observe]);
  return <>
    <output data-testid="shared-filter-state">{JSON.stringify(filters)}</output>
    <output data-testid="current-location">{location.pathname}{location.search}</output>
    <button onClick={() => toggleFilter('business_unit', 'Corporativo')}>Selecionar Corporativo no gráfico</button>
    <button onClick={() => toggleMonth('2026-09-01')}>Selecionar setembro no gráfico</button>
    <button onClick={() => { toggleFilter('business_unit', 'Corporativo'); toggleMonth('2026-09-01'); }}>Combinar BU e mês</button>
    <Link to="/retention">Navegar sem query</Link>
    <button onClick={() => navigate(-1)}>Voltar no histórico</button>
  </>;
}

function setup(entries = ['/overview'], initialIndex = entries.length - 1) {
  const observe = vi.fn();
  render(<MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
    <FilterProvider><Header /><Sidebar /><Probe observe={observe} /></FilterProvider>
  </MemoryRouter>);
  return { observe };
}

function current(): QueryFilters {
  return JSON.parse(screen.getByTestId('shared-filter-state').textContent!);
}

describe('Filtros compartilhados com cabeçalho e navegação reais', () => {
  it('aplica as duas datas personalizadas em uma atualização, sem intervalo intermediário', () => {
    const { observe } = setup(['/overview?start_date=2025-01-01&end_date=2025-12-31']);
    fireEvent.click(screen.getByRole('button', { name: 'Ano 2025' }));
    fireEvent.change(screen.getByLabelText('Data inicial global'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Data final global'), { target: { value: '2026-09-30' } });
    expect(current()).toMatchObject({ start_date: '2025-01-01', end_date: '2025-12-31' });
    observe.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Datas' }));
    expect(current()).toMatchObject({ start_date: '2026-01-01', end_date: '2026-09-30' });
    expect(screen.getByRole('button', { name: '2026-01-01 a 2026-09-30' })).toBeInTheDocument();
    for (const [filters] of observe.mock.calls) {
      expect([['2025-01-01', '2025-12-31'], ['2026-01-01', '2026-09-30']]).toContainEqual([filters.start_date, filters.end_date]);
    }
    expect(screen.getByTestId('current-location')).toHaveTextContent('start_date=2026-01-01&end_date=2026-09-30');
  });

  it('rejeita intervalo invertido sem alterar filtros nem URL', () => {
    const { observe } = setup(['/overview?start_date=2025-01-01&end_date=2025-12-31']);
    fireEvent.click(screen.getByRole('button', { name: 'Ano 2025' }));
    fireEvent.change(screen.getByLabelText('Data inicial global'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Data final global'), { target: { value: '2026-09-30' } });
    observe.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Datas' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A data inicial deve ser anterior');
    expect(current()).toMatchObject({ start_date: '2025-01-01', end_date: '2025-12-31' });
    expect(screen.getByTestId('current-location')).toHaveTextContent('/overview?start_date=2025-01-01&end_date=2025-12-31');
    expect(observe).not.toHaveBeenCalled();
  });

  it('combina seleções de gráficos no mesmo evento, exibe chips e remove cada filtro por nova seleção', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Combinar BU e mês' }));
    expect(current()).toMatchObject({ business_unit: 'Corporativo', start_date: '2026-09-01', end_date: '2026-09-30' });
    expect(screen.getByRole('button', { name: 'Remover filtro BU' })).toHaveTextContent('BU: Corporativo');
    expect(screen.getByRole('button', { name: 'Remover filtro De' })).toHaveTextContent('2026-09-01');
    expect(screen.getByRole('button', { name: 'Remover filtro Até' })).toHaveTextContent('2026-09-30');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar setembro no gráfico' }));
    expect(current()).toMatchObject({ business_unit: 'Corporativo', start_date: null, end_date: null });
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Corporativo no gráfico' }));
    expect(current().business_unit).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('remove pelo chip e limpa período, BU e explorações locais conjuntamente', () => {
    setup(['/products?start_date=2026-01-01&end_date=2026-09-30&business_unit=Corporativo&product=SYN-1&family=SYN-F']);
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro BU' }));
    expect(current()).toMatchObject({ business_unit: null, start_date: '2026-01-01', product: 'SYN-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(Object.values(current()).every(value => value === null)).toBe(true);
    expect(screen.getByTestId('current-location')).toHaveTextContent(/^\/products$/);
    expect(screen.getByRole('button', { name: 'Todo o Histórico' })).toBeInTheDocument();
  });

  it('mantém filtros globais ao navegar por um Link sem query', async () => {
    setup(['/overview?start_date=2026-01-01&end_date=2026-09-30&business_unit=Corporativo']);
    fireEvent.click(screen.getByRole('link', { name: 'Navegar sem query' }));
    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent('/retention?'));
    expect(current()).toMatchObject({ start_date: '2026-01-01', end_date: '2026-09-30', business_unit: 'Corporativo' });
    expect(screen.getByRole('button', { name: '2026-01-01 a 2026-09-30' })).toBeInTheDocument();
  });

  it('a sidebar transporta globais e descarta produto e família locais', () => {
    setup(['/products?start_date=2026-01-01&end_date=2026-09-30&business_unit=Corporativo&seller=VEN-SYN&product=SYN-1&family=SYN-F']);
    const customers = screen.getByRole('link', { name: 'Clientes' });
    expect(customers).toHaveAttribute('href', '/customers?start_date=2026-01-01&end_date=2026-09-30&business_unit=Corporativo&seller=VEN-SYN');
    fireEvent.click(customers);
    expect(current()).toMatchObject({ start_date: '2026-01-01', end_date: '2026-09-30', business_unit: 'Corporativo', seller: 'VEN-SYN', product: null, family: null });
    expect(screen.queryByRole('button', { name: /Remover filtro Produto/ })).toBeNull();
  });

  it('restaura o período explícito de uma página anterior ao voltar no histórico', async () => {
    setup(['/overview?start_date=2025-01-01&end_date=2025-12-31', '/customers?start_date=2026-01-01&end_date=2026-09-30']);
    expect(current().start_date).toBe('2026-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar no histórico' }));
    await waitFor(() => expect(current()).toMatchObject({ start_date: '2025-01-01', end_date: '2025-12-31' }));
    expect(screen.getByRole('button', { name: 'Ano 2025' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ano 2025' }));
    expect(screen.getByLabelText('Data inicial global')).toHaveValue('2025-01-01');
    expect(screen.getByLabelText('Data final global')).toHaveValue('2025-12-31');
  });
});
