import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FilterProvider, useGlobalFilters } from '../context/FilterContext';
import { LifecyclePage, lifecycleReference } from '../pages/LifecyclePage';
import { LifecycleTransitionsChart } from '../components/charts/LifecycleTransitionsChart';
import { QueryFilters, Transition } from '../api/types';

const mocks = vi.hoisted(() => ({
  useLifecycle: vi.fn(), useLifecycleTransitions: vi.fn(), useMetadata: vi.fn(),
  transitionsChart: null as any,
}));
vi.mock('../api/queries', () => ({
  useLifecycle: mocks.useLifecycle, useLifecycleTransitions: mocks.useLifecycleTransitions,
  useMetadata: mocks.useMetadata,
  useFilterOptions: () => ({ data: { data: { items: [] } } }),
}));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => null }));
vi.mock('echarts-for-react', () => ({ default: (props: any) => {
  if (props.option.series[0]?.type === 'bar') mocks.transitionsChart = props;
  return <div data-testid="synthetic-echart" />;
} }));

const transitions: Transition[] = [
  { period: '2026-09-07', previous_status: 'NOVO', status: 'EM RISCO', customers: 4, mature: true },
  { period: '2026-08-03', previous_status: 'INATIVO', status: 'RECORRENTE', customers: 3, mature: true },
];
const statusRows = [{ status: 'NOVO', customers: 9 }, { status: 'RECORRENTE', customers: 12 }, { status: 'EM RISCO', customers: 4 }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transitionsChart = null;
  mocks.useMetadata.mockReturnValue({ data: { meta: { reference_date: '2026-10-23' }, data: { mode: 'synthetic' } } });
  mocks.useLifecycle.mockImplementation((_reference: string, filters: QueryFilters) => ({
    data: { meta: { reference_date: '2026-10-23' }, data: statusRows.filter(row => !filters.customer_status || row.status === filters.customer_status) },
    isLoading: false, error: null, refetch: vi.fn(),
  }));
  mocks.useLifecycleTransitions.mockImplementation((filters: QueryFilters) => ({
    data: { data: transitions.filter(row => (!filters.customer_status || row.status === filters.customer_status)
      && (!filters.start_date || row.period >= filters.start_date)
      && (!filters.end_date || row.period <= filters.end_date)) },
    isLoading: false, error: null, refetch: vi.fn(),
  }));
});
afterEach(cleanup);

function StateProbe({ observe }: { observe: (filters: QueryFilters) => void }) {
  const { filters } = useGlobalFilters();
  useEffect(() => { observe(filters); }, [filters, observe]);
  return <output data-testid="lifecycle-filter-state">{JSON.stringify(filters)}</output>;
}
function setup(route = '/lifecycle') {
  const observe = vi.fn();
  render(<MemoryRouter initialEntries={[route]}><FilterProvider><LifecyclePage /><StateProbe observe={observe} /></FilterProvider></MemoryRouter>);
  return { observe };
}
function current(): QueryFilters { return JSON.parse(screen.getByTestId('lifecycle-filter-state').textContent!); }

describe('Referência mensal do ciclo de vida', () => {
  it.each([
    ['2026-09-15', '2026-10-23', '2026-08-31'],
    ['2026-09-30', '2026-10-23', '2026-09-30'],
    ['2026-10-23', '2026-10-23', '2026-10-23'],
    ['2026-12-31', '2026-10-23', '2026-10-23'],
    ['2024-03-15', '2026-10-23', '2024-02-29'],
    [undefined, '2026-10-23', '2026-10-23'],
    ['2026-09-15', undefined, undefined],
  ])('fim %s e snapshot %s definem referência %s', (end, snapshot, expected) => {
    expect(lifecycleReference(end, snapshot)).toBe(expected);
  });

  it('envia dimensões globais e status às duas consultas, preservando o intervalo inteiro para transições', () => {
    setup('/lifecycle?start_date=2026-01-01&end_date=2026-09-15&business_unit=Corporativo&seller=SYN&state=SP&sales_channel=CANAL&customer_status=EM+RISCO');
    const expected = { start_date: '2026-01-01', end_date: '2026-09-15', business_unit: 'Corporativo', seller: 'SYN', state: 'SP', sales_channel: 'CANAL', customer_status: 'EM RISCO' };
    expect(mocks.useLifecycle).toHaveBeenLastCalledWith('2026-08-31', expect.objectContaining(expected));
    expect(mocks.useLifecycleTransitions).toHaveBeenLastCalledWith(expect.objectContaining(expected));
    expect(screen.getByText(/Carteira em 2026-08-31/)).toBeInTheDocument();
  });
});

describe('Interação de ciclo de vida', () => {
  it('seleciona mês e status de destino atomicamente e desfaz os três filtros ao selecionar novamente', () => {
    const { observe } = setup('/lifecycle?business_unit=Corporativo');
    const summary = screen.getByText('Filtrar transições pelo gráfico');
    (summary.parentElement as HTMLDetailsElement).open = true;
    observe.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Set 2026 · EM RISCO' }));
    expect(current()).toMatchObject({ start_date: '2026-09-01', end_date: '2026-09-30', customer_status: 'EM RISCO', business_unit: 'Corporativo' });
    for (const [filters] of observe.mock.calls) {
      expect([[null, null, null], ['2026-09-01', '2026-09-30', 'EM RISCO']]).toContainEqual([filters.start_date, filters.end_date, filters.customer_status]);
    }
    expect(mocks.useLifecycle).toHaveBeenLastCalledWith('2026-09-30', expect.objectContaining({ customer_status: 'EM RISCO' }));
    expect(mocks.useLifecycleTransitions).toHaveBeenLastCalledWith(expect.objectContaining({ start_date: '2026-09-01', end_date: '2026-09-30', customer_status: 'EM RISCO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set 2026 · EM RISCO' }));
    expect(current()).toMatchObject({ start_date: null, end_date: null, customer_status: null, business_unit: 'Corporativo' });
    expect(mocks.useLifecycle).toHaveBeenLastCalledWith('2026-10-23', expect.anything());
  });

  it('compartilha seleção de status entre cards, legenda da rosca e consultas', () => {
    setup();
    const riskCard = screen.getByRole('button', { name: /EM RISCO 4 180 a 364/ });
    fireEvent.click(riskCard);
    expect(riskCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Filtrar EM RISCO' })).toHaveAttribute('aria-pressed', 'true');
    expect(current().customer_status).toBe('EM RISCO');
    expect(mocks.useLifecycleTransitions).toHaveBeenLastCalledWith(expect.objectContaining({ customer_status: 'EM RISCO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar EM RISCO' }));
    expect(current().customer_status).toBeNull();
    expect(riskCard).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Filtrar RECORRENTE' })).toBeInTheDocument();
  });

  it('mapeia índices de barras ao período original e ao destino, mantendo tooltip seguro e destaque', () => {
    const select = vi.fn();
    render(<LifecycleTransitionsChart transitions={transitions} onSelect={select} selectedPeriod="2026-09" selectedStatus="EM RISCO" />);
    const props = mocks.transitionsChart;
    expect(props.opts.renderer).toBe('svg');
    expect(props.option.tooltip.renderMode).toBe('richText');
    expect(props.option.xAxis.data).toEqual(['Ago 2026', 'Set 2026']);
    props.onEvents.click({ dataIndex: 1, seriesIndex: 0 });
    expect(select).toHaveBeenLastCalledWith('2026-09-07', 'EM RISCO');
    props.onEvents.click({ dataIndex: 0, seriesIndex: 1 });
    expect(select).toHaveBeenLastCalledWith('2026-08-03', 'RECORRENTE');
    expect(props.option.series[0].data[1].itemStyle.opacity).toBe(1);
    expect(props.option.series[1].data[0].itemStyle.opacity).toBe(0.35);
    props.onEvents.click({ dataIndex: 99, seriesIndex: 99 });
    expect(select).toHaveBeenCalledTimes(2);
  });
});
