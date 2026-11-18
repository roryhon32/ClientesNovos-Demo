import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RetentionPage } from '../pages/RetentionPage';
import { CohortHeatmapChart } from '../components/charts/CohortHeatmapChart';
import { Cohort } from '../api/types';
import { init } from 'echarts';

const mocks = vi.hoisted(() => ({ retention: vi.fn(), cohorts: vi.fn(), chart: vi.fn(), retryRetention: vi.fn(), retryCohorts: vi.fn() }));
vi.mock('../api/queries', () => ({ useRetention: mocks.retention, useCohorts: mocks.cohorts }));
vi.mock('../context/FilterContext', () => ({ useGlobalFilters: () => ({ filters: {} }) }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => ({ current: null }) }));
vi.mock('../components/layout/Header', () => ({ Header: ({ title, onToggleFilters }: { title: string; onToggleFilters: () => void }) => <header><h1>{title}</h1><button onClick={onToggleFilters}>Filtros</button></header> }));
vi.mock('../components/layout/GlobalFilters', () => ({ GlobalFilters: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Filtros abertos</div> : null }));
vi.mock('echarts-for-react', () => ({ default: ({ option }: { option: unknown }) => { mocks.chart(option); return <div data-testid="cohort-chart" />; } }));

const cohort: Cohort = {
  cohort: '2026-08', initial_customers: 10,
  periods: [
    { month_offset: 0, eligible_customers: 0, retained_customers: null, retention_pct: null, acquired_customers: 10, mature: true, net_revenue: 1000, gross_margin: 100 },
    { month_offset: 1, eligible_customers: 10, retained_customers: 0, retention_pct: 0, acquired_customers: null, mature: true, net_revenue: 0, gross_margin: 0 },
    { month_offset: 2, eligible_customers: 10, retained_customers: 2, retention_pct: 20, acquired_customers: null, mature: false, net_revenue: 200, gross_margin: 20 },
    { month_offset: 3, eligible_customers: null, retained_customers: null, retention_pct: null, acquired_customers: null, mature: false, net_revenue: null, gross_margin: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retention.mockReturnValue({
    data: { meta: { reference_date: '2026-10-22' }, data: {
      windows: [{ days: 30, eligible_customers: 8, immature_customers: 2, repurchased_customers: 4, rate_pct: 50, mature: false }],
      mean_days_to_second_purchase: 0, median_days_to_second_purchase: 0,
    } }, isLoading: false, error: null, refetch: mocks.retryRetention,
  });
  mocks.cohorts.mockReturnValue({ data: { meta: { reference_date: '2026-10-22' }, data: [cohort] }, isLoading: false, error: null, refetch: mocks.retryCohorts });
});

describe('Retention page recovery and analytical states', () => {
  it('keeps valid indicators and filters when only cohorts fail, and retries only cohorts', () => {
    mocks.cohorts.mockReturnValue({ error: new Error('Resultado excede o limite'), refetch: mocks.retryCohorts, isLoading: false });
    render(<RetentionPage />);
    expect(screen.getByRole('heading', { name: 'Retenção e Cohorts' })).toBeInTheDocument();
    expect(screen.getByText('4 de 8 elegíveis')).toBeInTheDocument();
    expect(screen.getByText(/Resultado excede o limite/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Filtros'));
    expect(screen.getByText('Filtros abertos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(mocks.retryCohorts).toHaveBeenCalledOnce();
    expect(mocks.retryRetention).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Meses de acompanhamento:' }), { target: { value: '6' } });
    expect(mocks.cohorts).toHaveBeenLastCalledWith({}, 6);
  });

  it('keeps the cohort matrix when retention fails and retries only retention', () => {
    mocks.retention.mockReturnValue({ error: new Error('Falha de conexão'), refetch: mocks.retryRetention, isLoading: false });
    render(<RetentionPage />);
    expect(screen.getByRole('heading', { name: 'Erro ao carregar indicadores de recompra' })).toBeInTheDocument();
    expect(screen.getByTestId('cohort-chart')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(mocks.retryRetention).toHaveBeenCalledOnce();
    expect(mocks.retryCohorts).not.toHaveBeenCalled();
  });

  it('shows eligible counts, excluded immature customers, pending windows and same-day intervals', () => {
    render(<RetentionPage />);
    expect(screen.getByText('4 de 8 elegíveis')).toBeInTheDocument();
    expect(screen.getByText('2 sem maturidade, excluídos da taxa')).toBeInTheDocument();
    expect(screen.getAllByText('0 dias')).toHaveLength(2);
    expect(screen.getByText(/Retenção após 90\/180 dias segue pendente/)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Recompra 60d' })).getByText('—')).toBeInTheDocument();
  });

  it('renders a null rate with no eligible customers as unavailable, not zero percent', () => {
    mocks.retention.mockReturnValue({ data: { data: { windows: [{ days: 30, eligible_customers: 0, immature_customers: 2, repurchased_customers: 0, rate_pct: null, mature: false }] } }, isLoading: false });
    render(<RetentionPage />);
    const card = within(screen.getByRole('article', { name: 'Recompra 30d' }));
    expect(card.getByText('—')).toBeInTheDocument();
    expect(card.getByText('Sem clientes com janela completa')).toBeInTheDocument();
    expect(card.queryByText('0,0%')).not.toBeInTheDocument();
  });

  it('renders explicit loading states without inventing empty or zero results', () => {
    mocks.retention.mockReturnValue({ isLoading: true });
    mocks.cohorts.mockReturnValue({ isLoading: true });
    render(<RetentionPage />);
    expect(screen.getByRole('status', { name: 'Carregando matriz de safras' })).toBeInTheDocument();
    expect(screen.queryByText('Sem dados de cohort')).not.toBeInTheDocument();
    expect(screen.queryByText('0,0%')).not.toBeInTheDocument();
  });
});

describe('Cohort heatmap semantics', () => {
  it('keeps M0 and future NULL out of the percent color scale while retaining true zero and provisional rates', () => {
    render(<CohortHeatmapChart cohorts={[cohort]} referenceDate="2026-10-22" maxMonths={6} />);
    const option = mocks.chart.mock.lastCall![0];
    expect(option.visualMap[0].seriesIndex).toBe(0);
    expect(option.visualMap[1].seriesIndex).toBe(1);
    expect(option.visualMap[1].show).toBe(false);
    const numeric = option.series[0].data;
    const placeholders = option.series[1].data;
    expect(numeric.map((cell: any) => cell.value)).toEqual([[1, 0, 0], [2, 0, 20]]);
    expect(placeholders.map((cell: any) => cell.itemData.state)).toEqual(['base', 'future']);
    expect(option.series[1].label.formatter({ data: placeholders[0] })).toBe('Base');
    expect(option.series[1].label.formatter({ data: placeholders[1] })).toBe('Futuro');
    expect(option.series[0].label.formatter({ data: numeric[0] })).toBe('0%');
    expect(option.series[0].label.formatter({ data: numeric[1] })).toBe('20%*');
    expect(option.tooltip.formatter({ data: numeric[1] })).toContain('resultado provisório');
    expect(option.tooltip.formatter({ data: placeholders[0] })).toContain('não é uma taxa de retenção');
    expect(cohort.periods[3].retention_pct).toBeNull();
    fireEvent.click(screen.getByText('Consultar valores da matriz em tabela'));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Mês em aberto')).toBeInTheDocument();
    expect(screen.getByText('Período futuro')).toBeInTheDocument();
  });

  it('handles empty cohorts with actionable guidance', () => {
    render(<CohortHeatmapChart cohorts={[]} />);
    expect(screen.getByText('Sem dados de cohort')).toBeInTheDocument();
    expect(screen.getByText(/Ajuste o período de aquisição/)).toBeInTheDocument();
    expect(screen.queryByTestId('cohort-chart')).not.toBeInTheDocument();
  });

  it('renders actual ECharts SVG with separate categorical and rate series without a chart error', () => {
    render(<CohortHeatmapChart cohorts={[cohort]} referenceDate="2026-10-22" maxMonths={6} />);
    // SVG SSR supports missing canvas; avoid jsdom logging its unsupported font-measurement API.
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 900, height: 480 });
    try {
      expect(() => chart.setOption(mocks.chart.mock.lastCall![0])).not.toThrow();
      const svg = chart.renderToSVGString();
      expect(svg).toContain('Base');
      expect(svg).toContain('Futuro');
      expect(svg).toContain('20%*');
    } finally {
      chart.dispose();
      canvasContext.mockRestore();
    }
  });
});
