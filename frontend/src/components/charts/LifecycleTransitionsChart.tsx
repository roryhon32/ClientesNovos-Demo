import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Transition } from '../../api/types';
import { formatDate } from '../../hooks/useFormatters';
import { ChartSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ChartFilterOptions } from '../common/ChartFilterOptions';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  transitions: Transition[];
  loading?: boolean;
  height?: number;
  onSelect?: (period: string, status: string) => void;
  selectedPeriod?: string | null;
  selectedStatus?: string | null;
}

export const LifecycleTransitionsChart: React.FC<Props> = ({ transitions = [], loading = false, height = 340, onSelect, selectedPeriod, selectedStatus }) => {
  const { isDark } = useTheme();
  const periods = Array.from(new Set(transitions.map(t => t.period))).sort();
  const types = Array.from(new Set(transitions.map(t => JSON.stringify([t.previous_status, t.status]))));
  const options = useMemo(() => {
    const colors = isDark
      ? ['#5787cf', '#2a5ca8', '#89ade2', '#173e7a', '#dea712', '#94a3b8']
      : ['#0a1f3d', '#123063', '#5787cf', '#89ade2', '#dea712', '#64748b'];
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' }, backgroundColor: '#0a1f3d', borderColor: '#123063', textStyle: { color: '#FFFFFF', fontSize: 12, fontFamily: '"Work Sans", sans-serif' } },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, fontFamily: '"Work Sans", sans-serif' }, pageTextStyle: { color: isDark ? '#cbd5e1' : '#334155' }, icon: 'circle' },
      grid: { top: 20, right: 16, bottom: 65, left: 30, containLabel: true },
      xAxis: { type: 'category', data: periods.map(period => formatDate(period, 'month-year')), axisLine: { lineStyle: { color: isDark ? '#244575' : '#CBD5E1' } }, axisLabel: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, fontFamily: '"Work Sans", sans-serif' } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: isDark ? '#94a3b8' : '#475569', fontSize: 12, fontFamily: '"Work Sans", sans-serif' }, splitLine: { lineStyle: { color: isDark ? '#1c3863' : '#E2E8F0', type: 'dashed' } } },
      series: types.map((key, index) => {
        const [previous, status] = JSON.parse(key) as string[];
        return { name: `${previous} → ${status}`, type: 'bar', stack: 'total', barMaxWidth: 28,
          data: periods.map(period => ({
            value: transitions.filter(t => t.period === period && t.previous_status === previous && t.status === status).reduce((sum, t) => sum + t.customers, 0),
            itemStyle: { color: colors[index % colors.length], opacity: (!selectedPeriod || period.startsWith(selectedPeriod.slice(0, 7))) && (!selectedStatus || selectedStatus === status) ? 1 : 0.35 },
          })),
        };
      }),
    };
  }, [transitions, selectedPeriod, selectedStatus, isDark]);
  if (loading) return <ChartSkeleton height={`h-[${height}px]`} />;
  if (!transitions.length) return <EmptyState title="Sem histórico de transições" message="Não foram observadas mudanças de status na janela selecionada." />;
  const choices = Array.from(new Set(transitions.map(t => JSON.stringify([t.period, t.status]))));
  return <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 min-w-0 shadow-sm">
    <h3 className="text-sm sm:text-base font-display font-bold text-text-primary">Transições Históricas de Ciclo de Vida</h3>
    <p className="text-xs text-text-muted mb-4">Selecione uma barra para combinar mês e status de destino. Contagens representam transições observadas.</p>
    <ReactECharts option={options} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} notMerge onEvents={{ click: (event: { dataIndex: number; seriesIndex: number }) => {
      const period = periods[event.dataIndex];
      const key = types[event.seriesIndex];
      if (period && key && onSelect) onSelect(period, (JSON.parse(key) as string[])[1]);
    } }} />
    {onSelect && <ChartFilterOptions label="Filtrar transições pelo gráfico" options={choices.map(value => { const [period, status] = JSON.parse(value) as string[]; return { value, label: `${formatDate(period, 'month-year')} · ${status}` }; })} selected={choices.find(value => { const [period, status] = JSON.parse(value) as string[]; return period.startsWith(selectedPeriod?.slice(0, 7) || '!') && status === selectedStatus; })} onSelect={value => { const [period, status] = JSON.parse(value) as string[]; onSelect(period, status); }} />}
  </div>;
};
