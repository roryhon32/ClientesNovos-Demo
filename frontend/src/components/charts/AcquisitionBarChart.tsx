import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AcquisitionPoint } from '../../api/types';
import { formatDate, formatCurrency, formatNumber, formatPercent } from '../../hooks/useFormatters';
import { ChartSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ChartFilterOptions } from '../common/ChartFilterOptions';
import { useTheme } from '../../context/ThemeContext';

interface AcquisitionBarChartProps {
  data?: AcquisitionPoint[];
  metric?: 'new_customers' | 'first_purchase_net_revenue' | 'first_purchase_gross_margin';
  onMetricChange?: (metric: 'new_customers' | 'first_purchase_net_revenue' | 'first_purchase_gross_margin') => void;
  loading?: boolean;
  height?: number;
  onSelectPeriod?: (period: string) => void;
  selectedPeriod?: string | null;
}

export const AcquisitionBarChart: React.FC<AcquisitionBarChartProps> = ({
  data = [],
  metric = 'new_customers',
  onMetricChange,
  loading = false,
  height = 290,
  onSelectPeriod,
  selectedPeriod,
}) => {
  const { isDark } = useTheme();
  const chartOptions = useMemo(() => {
    if (!data || data.length === 0) return null;

    const periods = data.map((d) => formatDate(d.period, 'month-year'));
    const values = data.map((d) => {
      if (metric === 'new_customers') return d.new_customers;
      if (metric === 'first_purchase_net_revenue') return d.first_purchase_net_revenue;
      return d.first_purchase_gross_margin;
    });

    const isCurrency = metric !== 'new_customers';

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 14,
        right: 12,
        bottom: 8,
        left: 8,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: {
            color: 'rgba(10, 31, 61, 0.06)',
          },
        },
        backgroundColor: '#0a1f3d',
        borderColor: '#123063',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#FFFFFF',
          fontFamily: '"Work Sans", "Segoe UI", sans-serif',
          fontSize: 12,
        },
        formatter: (params: any[]) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const item = data[idx];
          if (!item) return '';

          const periodLabel = formatDate(item.period, 'month-year');
          const valLabel = isCurrency
            ? formatCurrency(params[0].value, { decimals: 0 })
            : `${formatNumber(params[0].value)} novos clientes`;

          let growthHtml = '';
          if (item.growth_pct !== null && item.growth_pct !== undefined) {
            const isPos = item.growth_pct > 0;
            const sign = isPos ? '↑' : item.growth_pct < 0 ? '↓' : '';
            const color = isPos ? '#4ade80' : item.growth_pct < 0 ? '#f87171' : '#cbd5e1';
            growthHtml = `<div style="font-size: 12px; color: ${color}; margin-top: 4px; font-weight: 600;">
              ${sign} ${formatPercent(item.growth_pct, { decimals: 1 })} vs. mês anterior
            </div>`;
          }

          return `
            <div style="font-weight: 600; font-size: 12px; color: #c7d5eb; margin-bottom: 3px;">
              ${periodLabel}
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #ffd30b; font-family: Outfit, sans-serif;">
              ${valLabel}
            </div>
            ${growthHtml}
          `;
        },
      },
      xAxis: {
        type: 'category',
        data: periods,
        axisLine: {
          lineStyle: {
            color: isDark ? '#244575' : '#CBD5E1',
          },
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: isDark ? '#cbd5e1' : '#334155',
          fontSize: 12,
          fontFamily: '"Work Sans", "Segoe UI", sans-serif',
          margin: 12,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: isDark ? '#1c3863' : '#E2E8F0',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: isDark ? '#94a3b8' : '#475569',
          fontSize: 12,
          fontFamily: '"Work Sans", "Segoe UI", sans-serif',
          formatter: (value: number) => {
            if (isCurrency) {
              if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} M`;
              if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
              return `R$ ${value}`;
            }
            return value >= 1000 ? `${(value / 1000).toFixed(0)} mil` : String(value);
          },
        },
      },
      series: [
        {
          name: 'Novos Clientes',
          type: 'bar',
          data: values.map((value, index) => ({
            value,
            itemStyle: { opacity: selectedPeriod && data[index].period.slice(0, 7) !== selectedPeriod.slice(0, 7) ? 0.3 : 1 },
          })),
          barMaxWidth: 34,
          itemStyle: {
            borderRadius: [5, 5, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: isDark
                ? [
                    { offset: 0, color: '#5787cf' },
                    { offset: 1, color: '#1d4b94' },
                  ]
                : [
                    { offset: 0, color: '#0a1f3d' },
                    { offset: 1, color: '#123063' },
                  ],
            },
          },
          emphasis: {
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: isDark
                  ? [
                      { offset: 0, color: '#83a8de' },
                      { offset: 1, color: '#396ec0' },
                    ]
                  : [
                      { offset: 0, color: '#123063' },
                      { offset: 1, color: '#5787cf' },
                    ],
              },
              shadowBlur: 10,
              shadowColor: isDark ? 'rgba(87, 135, 207, 0.35)' : 'rgba(10, 31, 61, 0.25)',
            },
          },
        },
      ],
    };
  }, [data, metric, selectedPeriod, isDark]);

  if (loading) {
    return <ChartSkeleton height={`h-[${height}px]`} />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Sem dados de aquisição"
        message="Não há registros de novos clientes para o período selecionado."
      />
    );
  }

  return (
    <div className="min-w-0 bg-surface border border-border rounded-2xl p-4 sm:p-5 relative shadow-sm h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-display font-bold text-text-primary tracking-tight">
              Evolução de Novos Clientes
            </h3>
            <p className="text-xs text-text-muted">
              Série temporal mensal de clientes adquiridos e primeira compra
            </p>
          </div>
        </div>

        {onMetricChange && (
          <div className="inline-flex flex-wrap rounded-xl bg-surface-elevated p-1 border border-border self-start sm:self-auto gap-1">
            <button
              onClick={() => onMetricChange('new_customers')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                metric === 'new_customers'
                  ? 'bg-action text-white dark:border dark:border-cyan/35 font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Clientes
            </button>
            <button
              onClick={() => onMetricChange('first_purchase_net_revenue')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                metric === 'first_purchase_net_revenue'
                  ? 'bg-action text-white dark:border dark:border-cyan/35 font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Receita Líquida
            </button>
            <button
              onClick={() => onMetricChange('first_purchase_gross_margin')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                metric === 'first_purchase_gross_margin'
                  ? 'bg-action text-white dark:border dark:border-cyan/35 font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Margem Bruta
            </button>
          </div>
        )}
      </div>

      <div style={{ height }}>
        {chartOptions && (
          <ReactECharts
            option={chartOptions}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge={true}
            onEvents={onSelectPeriod ? { click: (event: { componentType?: string; dataIndex?: number }) => {
              if (event.componentType === 'series' && event.dataIndex !== undefined && data[event.dataIndex]) onSelectPeriod(data[event.dataIndex].period);
            } } : undefined}
          />
        )}
      </div>
      {onSelectPeriod && <ChartFilterOptions
        label="Filtrar mês pelo gráfico"
        options={data.map((item) => ({ value: item.period, label: formatDate(item.period, 'month-year') }))}
        selected={data.find((item) => selectedPeriod && item.period.slice(0, 7) === selectedPeriod.slice(0, 7))?.period}
        onSelect={onSelectPeriod}
      />}
    </div>
  );
};
