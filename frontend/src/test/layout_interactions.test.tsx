import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HorizontalScroll } from '../components/common/HorizontalScroll';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { FilterProvider } from '../context/FilterContext';
import { ThemeProvider } from '../context/ThemeContext';
import { DistributionDonutChart } from '../components/charts/DistributionDonutChart';
import { AcquisitionBarChart } from '../components/charts/AcquisitionBarChart';
import { ProfitabilityBarChart } from '../components/charts/ProfitabilityBarChart';
import { CohortHeatmapChart } from '../components/charts/CohortHeatmapChart';
import { AcquisitionPoint, Cohort, Profit } from '../api/types';

const chart = vi.hoisted(() => ({ props: null as any }));
vi.mock('echarts-for-react', () => ({ default: (props: any) => { chart.props = props; return <div data-testid="chart" />; } }));
vi.mock('../components/common/WaveBackground', () => ({ WaveBackground: () => null }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Navegação e conteúdo responsivo', () => {
  it('preserva o período e filtros na navegação e inclui análise de produtos', () => {
    render(<MemoryRouter initialEntries={['/overview?start_date=2026-01-01&end_date=2026-09-30&business_unit=BU+A&product=LOCAL&family=LOCAL&page=3']}><Sidebar /></MemoryRouter>);
    const customers = screen.getByRole('link', { name: 'Clientes' });
    expect(customers).toHaveAttribute('href', '/customers?start_date=2026-01-01&end_date=2026-09-30&business_unit=BU+A');
    expect(screen.getByRole('link', { name: 'Produtos e Recompra' }).getAttribute('href')).toContain('/products?start_date=2026-01-01');
  });

  it('sincroniza barras superior e inferior e oferece controles com teclado apenas quando há overflow', () => {
    let notify: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notify = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const view = render(<HorizontalScroll label="Produtos"><table><tbody><tr><td>Produto</td></tr></tbody></table></HorizontalScroll>);
    const content = screen.getByRole('region', { name: 'Produtos: conteúdo com rolagem horizontal' });
    expect(screen.queryByRole('region', { name: 'Produtos: rolagem horizontal superior' })).toBeNull();
    Object.defineProperties(content, { scrollWidth: { configurable: true, value: 1400 }, clientWidth: { configurable: true, value: 400 } });
    fireEvent(window, new Event('resize'));
    const top = screen.getByRole('region', { name: 'Produtos: rolagem horizontal superior' });
    expect(top).toHaveAttribute('tabindex', '0');
    expect(content).toHaveAttribute('tabindex', '0');
    expect(top.firstElementChild).toHaveStyle({ width: '1400px' });
    top.scrollLeft = 330;
    fireEvent.scroll(top);
    expect(content.scrollLeft).toBe(330);
    content.scrollLeft = 760;
    fireEvent.scroll(content);
    expect(top.scrollLeft).toBe(760);
    expect(notify).toBeDefined();
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 1500 });
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('region', { name: 'Produtos: rolagem horizontal superior' })).toBeNull();
    expect(content).not.toHaveAttribute('tabindex');
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('tolera ambiente sem ResizeObserver e mantém tabelas acessíveis', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<HorizontalScroll><table><tbody><tr><td>Sem overflow</td></tr></tbody></table></HorizontalScroll>);
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent(window, new Event('resize'));
  });
});

describe('Rosca com legenda legível e filtros acessíveis', () => {
  const data = [{ name: 'Corporativo com descrição longa', value: 30 }, { name: 'Outras BUs', value: 70 }];

  it('envia cliques nas fatias e na legenda, mantendo indicação da seleção', () => {
    const select = vi.fn();
    render(<DistributionDonutChart data={data} onSelect={select} selectedName={data[0].name} />);
    const selected = screen.getByRole('button', { name: `Filtrar ${data[0].name}` });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveTextContent('30%');
    expect(screen.getByText(data[0].name)).toHaveClass('distribution-donut-label');
    fireEvent.click(selected);
    expect(select).toHaveBeenLastCalledWith(data[0].name);
    chart.props.onEvents.click({ componentType: 'series', name: data[1].name });
    expect(select).toHaveBeenLastCalledWith(data[1].name);
    expect(chart.props.option.series[0].itemStyle).toBeDefined();
    expect(chart.props.option.series[0].data[1].itemStyle.opacity).toBe(0.35);
  });

  it('apresenta legenda estática e estado sem dados sem criar botões inativos', () => {
    const view = render(<DistributionDonutChart data={data} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(data[0].name)).toBeInTheDocument();
    view.rerender(<DistributionDonutChart data={[]} />);
    expect(screen.getByText('Sem dados de distribuição')).toBeInTheDocument();
  });

  it('atribui cores distintas e legíveis para 10+ fatias nos modos claro e escuro', () => {
    const many = Array.from({ length: 10 }, (_, idx) => ({ name: `BU_${idx + 1}`, value: 100 - idx }));
    window.localStorage.setItem('ci_theme', 'light');
    document.documentElement.classList.remove('dark');
    render(<ThemeProvider><DistributionDonutChart data={many} /></ThemeProvider>);
    const lightColors = chart.props.option.series[0].data.map((d: any) => d.itemStyle.color);
    expect(new Set(lightColors).size).toBe(10);
    expect(lightColors[0]).toBe('#0a1f3d');
    expect(lightColors[2]).toBe('#ffd30b');

    cleanup();
    window.localStorage.setItem('ci_theme', 'dark');
    document.documentElement.classList.add('dark');
    render(<ThemeProvider><DistributionDonutChart data={many} /></ThemeProvider>);
    const darkColors = chart.props.option.series[0].data.map((d: any) => d.itemStyle.color);
    expect(new Set(darkColors).size).toBe(10);
    expect(darkColors[0]).toBe('#3b78e7');
    expect(darkColors[2]).toBe('#ffd30b');
    expect(darkColors).not.toContain('#173e7a');
    document.documentElement.classList.remove('dark');
    window.localStorage.removeItem('ci_theme');
  });
});

describe('Filtros de gráficos de barras', () => {
  it('seleciona o mês original pelo gráfico e pelo controle de teclado, incluindo seleção repetida', () => {
    const select = vi.fn();
    const data: AcquisitionPoint[] = ['2026-08-01', '2026-09-01'].map((period) => ({ period, new_customers: 10, first_purchase_accounting_revenue: 100, first_purchase_net_revenue: 90, first_purchase_gross_margin: 20, growth_pct: null }));
    render(<AcquisitionBarChart data={data} onSelectPeriod={select} selectedPeriod="2026-09-01" />);
    chart.props.onEvents.click({ componentType: 'series', dataIndex: 1 });
    expect(select).toHaveBeenLastCalledWith('2026-09-01');
    const summary = screen.getByText('Filtrar mês pelo gráfico');
    (summary.parentElement as HTMLDetailsElement).open = true;
    const september = screen.getByRole('button', { name: 'Set 2026' });
    expect(september).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(september);
    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenLastCalledWith('2026-09-01');
    chart.props.onEvents.click({ componentType: 'series', dataIndex: 999 });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('mapeia a barra de rentabilidade à categoria ordenada, sem confundir com a ordem de origem', () => {
    const select = vi.fn();
    const data = [{ dimension: 'Menor', faturamento_liquido: 10 }, { dimension: 'Maior', faturamento_liquido: 100 }] as Profit[];
    render(<ProfitabilityBarChart data={data} onSelect={select} selectedName="Maior" />);
    chart.props.onEvents.click({ componentType: 'series', dataIndex: 0 });
    expect(select).toHaveBeenLastCalledWith('Maior');
    const summary = screen.getByText('Filtrar Business Unit pelo gráfico');
    (summary.parentElement as HTMLDetailsElement).open = true;
    expect(screen.getByRole('button', { name: 'Maior' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Menor' }));
    expect(select).toHaveBeenLastCalledWith('Menor');
  });
});

describe('Filtro interativo de safra', () => {
  it('usa a safra original em células numéricas e placeholders e oferece seleção pelo teclado', () => {
    const select = vi.fn();
    const period = { month_offset: 1, eligible_customers: 10, retained_customers: 5, retention_pct: 50, acquired_customers: 10, mature: true, net_revenue: 100, gross_margin: 20 };
    const cohorts: Cohort[] = [
      { cohort: '2026-01', initial_customers: 10, periods: [period] },
      { cohort: '2026-09', initial_customers: 10, periods: [{ ...period, month_offset: 0 }] },
    ];
    render(<CohortHeatmapChart cohorts={cohorts} selectedCohort="2026-09" onSelectCohort={select} />);
    expect(chart.props.opts.renderer).toBe('svg');
    chart.props.onEvents.click({ componentType: 'series', seriesIndex: 0, dataIndex: 0 });
    expect(select).toHaveBeenLastCalledWith('2026-01');
    chart.props.onEvents.click({ componentType: 'series', seriesIndex: 1, dataIndex: 0 });
    expect(select).toHaveBeenLastCalledWith('2026-09');
    expect(chart.props.option.series[1].data[0].itemStyle.color).toBe('#dbe5f4');
    expect(chart.props.option.series[1].data[0].itemStyle.borderColor).toBe('#0a1f3d');
    expect(chart.props.option.series[0].data[0].itemStyle.opacity).toBe(0.3);
    (screen.getByText('Filtrar safra pelo gráfico').parentElement as HTMLDetailsElement).open = true;
    const selected = screen.getByRole('button', { name: '2026-09' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(selected);
    expect(select).toHaveBeenCalledTimes(3);
    expect(select).toHaveBeenLastCalledWith('2026-09');
    chart.props.onEvents.click({ componentType: 'series', seriesIndex: 5, dataIndex: 9 });
    expect(select).toHaveBeenCalledTimes(3);
  });
});

describe('Alternância de tema claro e escuro e identidade neutra', () => {
  it('alterna entre tema claro e escuro, persiste no localStorage e não exibe marca anterior', () => {
    document.documentElement.classList.remove('dark');
    window.localStorage.removeItem('ci_theme');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { items: [] } }) })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <FilterProvider>
              <Sidebar />
              <Header />
            </FilterProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByText(/padroniza|interno/i)).toBeNull();
    expect(screen.getAllByAltText('Customer Intelligence').length).toBeGreaterThan(0);

    const toDark = screen.getByRole('button', { name: 'Alternar para tema escuro' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(toDark);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('ci_theme')).toBe('dark');

    const toLight = screen.getByRole('button', { name: 'Alternar para tema claro' });
    fireEvent.click(toLight);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('ci_theme')).toBe('light');
    client.clear();
  });
});
