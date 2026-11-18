import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Cohort, CohortPeriod } from '../../api/types';
import { formatPercent, formatNumber } from '../../hooks/useFormatters';
import { ChartSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ChartFilterOptions } from '../common/ChartFilterOptions';
import { HorizontalScroll } from '../common/HorizontalScroll';
import { useTheme } from '../../context/ThemeContext';

interface CohortHeatmapChartProps {
  cohorts: Cohort[];
  loading?: boolean;
  maxMonths?: number;
  height?: number;
  referenceDate?: string;
  onSelectCohort?: (cohort: string) => void;
  selectedCohort?: string | null;
}

type CellState = 'base' | 'open' | 'future' | 'complete' | 'unavailable';

function cellState(cohort: Cohort, period: CohortPeriod, referenceDate?: string): CellState {
  if (period.month_offset === 0) return 'base';
  if (referenceDate) {
    const [year, month] = cohort.cohort.split('-').map(Number);
    const [referenceYear, referenceMonth] = referenceDate.split('-').map(Number);
    if (year * 12 + month + period.month_offset > referenceYear * 12 + referenceMonth) return 'future';
  }
  if (!period.mature) return 'open';
  return period.retention_pct == null ? 'unavailable' : 'complete';
}

function cellLabel(state: CellState, period: CohortPeriod): string {
  if (state === 'base') return 'Base';
  if (state === 'future') return 'Futuro';
  if (state === 'open') return period.retention_pct == null ? 'Aberto' : `${formatPercent(period.retention_pct, { decimals: 0 })}*`;
  return period.retention_pct == null ? '—' : formatPercent(period.retention_pct, { decimals: 0 });
}

interface Cell {
  value: [number, number, number];
  itemData: { cohort: Cohort; period: CohortPeriod; state: CellState };
  itemStyle?: { color?: string; opacity?: number; borderColor?: string; borderWidth?: number };
  label?: { color?: string; fontWeight?: string | number };
}

export const CohortHeatmapChart: React.FC<CohortHeatmapChartProps> = ({
  cohorts = [], loading = false, maxMonths = 12, height = 480, referenceDate, onSelectCohort, selectedCohort,
}) => {
  const { isDark } = useTheme();
  const sortedCohorts = useMemo(() => [...cohorts].sort((a, b) => b.cohort.localeCompare(a.cohort)), [cohorts]);
  const chartOptions = useMemo(() => {
    if (sortedCohorts.length === 0) return null;
    const numeric: Cell[] = [];
    const placeholders: Cell[] = [];
    const baseColor = isDark ? '#19355e' : '#dbe5f4';
    const openColor = isDark ? '#223d66' : '#f3efe0';
    const mutedCellColor = isDark ? '#0e1d36' : '#f1f5f9';
    const placeholderTextColor = isDark ? '#e2e8f0' : '#0a1f3d';
    const selectedBorderColor = isDark ? '#5787cf' : '#0a1f3d';

    sortedCohorts.forEach((cohort, y) => {
      cohort.periods.filter((period) => period.month_offset >= 0 && period.month_offset <= maxMonths).forEach((period) => {
        const state = cellState(cohort, period, referenceDate);
        const pct = period.retention_pct ?? 0;
        const cell: Cell = {
          value: [period.month_offset, y, pct],
          itemData: { cohort, period, state },
          itemStyle: selectedCohort ? {
            opacity: selectedCohort === cohort.cohort ? 1 : 0.3,
            ...(selectedCohort === cohort.cohort ? { borderColor: selectedBorderColor, borderWidth: 2 } : {}),
          } : undefined,
        };
        if (state === 'complete' || (state === 'open' && period.retention_pct != null)) {
          cell.label = {
            color: '#0a1f3d',
            fontWeight: 700,
          };
          numeric.push(cell);
        } else {
          // Categorical codes for the separate, hidden visual map; these are not percentages.
          cell.value[2] = { base: 0, open: 1, future: 2, unavailable: 3, complete: 3 }[state];
          cell.itemStyle = {
            ...cell.itemStyle,
            color: state === 'base' ? baseColor : state === 'open' ? openColor : mutedCellColor,
          };
          cell.label = { color: placeholderTextColor, fontWeight: 600 };
          placeholders.push(cell);
        }
      });
    });
    const series = (name: string, data: Cell[]) => ({
      name, type: 'heatmap', data,
      label: {
        show: true, color: placeholderTextColor, fontSize: 12, fontFamily: '"Work Sans", sans-serif',
        formatter: ({ data: cell }: { data: Cell }) => cellLabel(cell.itemData.state, cell.itemData.period),
      },
      itemStyle: { borderColor: isDark ? '#0b1b33' : '#FFFFFF', borderWidth: 2, borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: selectedBorderColor, borderWidth: 2 } },
    });
    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top', renderMode: 'richText', backgroundColor: '#0a1f3d', borderColor: '#123063',
        textStyle: { color: '#FFFFFF', fontSize: 12, fontFamily: '"Work Sans", sans-serif' },
        formatter: ({ data: cell }: { data: Cell }) => {
          const { cohort, period, state } = cell.itemData;
          const title = `Safra ${cohort.cohort} · ${period.month_offset === 0 ? 'M0' : `M+${period.month_offset}`}`;
          if (state === 'base') return `${title}\nClientes adquiridos: ${formatNumber(cohort.initial_customers)}\nM0 é a base de aquisição; não é uma taxa de retenção.`;
          if (state === 'future') return `${title}\nPeríodo futuro à data de referência.\nSem taxa de retenção observada.`;
          const maturity = state === 'open' ? '\nMês em aberto: resultado provisório.' : state === 'unavailable' ? '\nTaxa indisponível para este período.' : '\nMês completo.';
          return `${title}${maturity}\nRetenção: ${period.retention_pct == null ? '—' : formatPercent(period.retention_pct)}\nElegíveis: ${formatNumber(period.eligible_customers)}\nRetidos: ${formatNumber(period.retained_customers)}\nBase inicial: ${formatNumber(cohort.initial_customers)}`;
        },
      },
      grid: { top: 16, right: sortedCohorts.length > 18 ? 42 : 12, bottom: 62, left: 12, containLabel: true },
      xAxis: {
        type: 'category', data: Array.from({ length: maxMonths + 1 }, (_, i) => i === 0 ? 'M0 (Base)' : `M+${i}`),
        axisTick: { show: false }, axisLine: { lineStyle: { color: isDark ? '#244575' : '#CBD5E1' } },
        axisLabel: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, fontFamily: '"Work Sans", sans-serif', interval: 0 },
      },
      yAxis: {
        type: 'category', data: sortedCohorts.map((cohort) => cohort.cohort), inverse: true,
        axisTick: { show: false }, axisLine: { lineStyle: { color: isDark ? '#244575' : '#CBD5E1' } },
        axisLabel: { color: isDark ? '#f1f5f9' : '#0a1f3d', fontSize: 12, fontWeight: 600, fontFamily: '"Work Sans", sans-serif' },
      },
      dataZoom: sortedCohorts.length > 18 ? [{ type: 'slider', yAxisIndex: 0, right: 0, start: 0, end: 18 / sortedCohorts.length * 100, filterMode: 'empty' }] : [],
      visualMap: [{
        min: 0, max: 100, dimension: 2, seriesIndex: 0, calculable: false,
        orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 14, itemHeight: 140,
        inRange: {
          color: isDark
            ? ['#fbe894', '#ffe04d', '#ffd30b', '#ebb90f', '#dea712', '#c48d09']
            : ['#fff8d6', '#ffe97d', '#ffd30b', '#efc00f', '#dea712', '#c48d09'],
        },
        textStyle: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12 }, formatter: (value: number) => `${Math.round(value)}%`,
      }, {
        type: 'piecewise', show: false, dimension: 2, seriesIndex: 1,
        pieces: [
          { value: 0, color: baseColor }, { value: 1, color: openColor },
          { value: 2, color: mutedCellColor }, { value: 3, color: mutedCellColor },
        ],
      }],
      series: [series('Retenção mensal', numeric), series('Base e períodos sem taxa', placeholders)],
    };
  }, [sortedCohorts, maxMonths, referenceDate, selectedCohort, isDark]);

  if (loading) return <div style={{ height }} role="status" aria-label="Carregando matriz de safras"><ChartSkeleton height="h-full" /></div>;
  if (cohorts.length === 0) return <EmptyState title="Sem dados de cohort" message="Não há safras para os filtros selecionados. Ajuste o período de aquisição ou os demais filtros." />;

  return (
    <div className="min-w-0 bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
      <h2 className="text-sm sm:text-base font-display font-bold text-text-primary">Matriz de Retenção de Safras (Cohort)</h2>
      <p className="text-xs text-text-muted mt-1 mb-4">M0 define a base adquirida. Cada mês seguinte mede compras no respectivo mês, sem acumular períodos.</p>
      <div className="flex flex-wrap gap-4 text-xs text-text-secondary mb-3" aria-label="Legenda da matriz">
        <span>Base: clientes adquiridos</span><span>* / Aberto: mês incompleto</span><span>Futuro: sem observação</span><span>—: taxa indisponível</span>
      </div>
      <HorizontalScroll label="Matriz de safras">
        <div style={{ height, minWidth: Math.max(620, (maxMonths + 1) * 48 + 100) }}>
          {chartOptions && <ReactECharts
            option={chartOptions}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
            onEvents={onSelectCohort ? { click: (event: { componentType?: string; seriesIndex?: number; dataIndex?: number }) => {
              if (event.componentType !== 'series' || event.seriesIndex === undefined || event.dataIndex === undefined) return;
              const cell = chartOptions.series[event.seriesIndex]?.data[event.dataIndex];
              if (cell) onSelectCohort(cell.itemData.cohort.cohort);
            } } : undefined}
          />}
        </div>
      </HorizontalScroll>
      {onSelectCohort && <ChartFilterOptions
        label="Filtrar safra pelo gráfico"
        options={sortedCohorts.map((cohort) => ({ value: cohort.cohort, label: cohort.cohort }))}
        selected={selectedCohort}
        onSelect={onSelectCohort}
      />}
      <details className="mt-4 text-xs text-text-secondary">
        <summary className="cursor-pointer font-semibold text-primary hover:underline py-2">Consultar valores da matriz em tabela</summary>
        <HorizontalScroll className="mt-2 rounded-xl border border-border" label="Valores da matriz de safras">
          <table className="w-full text-left whitespace-nowrap">
            <caption className="sr-only">Retenção mensal por safra e maturidade do período</caption>
            <thead className="bg-action text-white"><tr>{['Safra', 'Mês', 'Base inicial', 'Elegíveis', 'Retidos', 'Retenção', 'Situação'].map((label) => <th scope="col" key={label} className="p-2.5 text-xs font-display font-semibold uppercase">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {sortedCohorts.flatMap((cohort) => cohort.periods.filter((period) => period.month_offset >= 0 && period.month_offset <= maxMonths).map((period) => {
                const state = cellState(cohort, period, referenceDate);
                return <tr key={`${cohort.cohort}-${period.month_offset}`} className={selectedCohort === cohort.cohort ? 'bg-tint' : 'hover:bg-surface-hover/50'}>
                  <th scope="row" className="p-2.5 font-semibold text-text-primary">{cohort.cohort}</th>
                  <td className="p-2.5">M+{period.month_offset}</td><td className="p-2.5">{formatNumber(cohort.initial_customers)}</td>
                  <td className="p-2.5">{period.eligible_customers == null ? '—' : formatNumber(period.eligible_customers)}</td>
                  <td className="p-2.5">{period.retained_customers == null ? '—' : formatNumber(period.retained_customers)}</td>
                  <td className="p-2.5 font-semibold text-primary">{cellLabel(state, period)}</td>
                  <td className="p-2.5">{{ base: 'Aquisição', open: 'Mês em aberto', future: 'Período futuro', complete: 'Mês completo', unavailable: 'Taxa indisponível' }[state]}</td>
                </tr>;
              }))}
            </tbody>
          </table>
        </HorizontalScroll>
      </details>
    </div>
  );
};
