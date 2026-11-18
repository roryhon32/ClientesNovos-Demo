import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Profit } from '../../api/types';
import { formatCurrency, formatPercent, formatNumber } from '../../hooks/useFormatters';
import { ChartSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ChartFilterOptions } from '../common/ChartFilterOptions';
import { useTheme } from '../../context/ThemeContext';

interface ProfitabilityBarChartProps {
  data: Profit[];
  dimensionLabel?: string;
  loading?: boolean;
  height?: number;
  onSelect?: (name: string) => void;
  selectedName?: string | null;
}

export const ProfitabilityBarChart: React.FC<ProfitabilityBarChartProps> = ({
  data = [],
  dimensionLabel = 'Business Unit',
  loading = false,
  height = 360,
  onSelect,
  selectedName,
}) => {
  const { isDark } = useTheme();
  const sorted = useMemo(() => [...data]
    .filter((item) => item.dimension)
    .sort((a, b) => (b.faturamento_liquido ?? 0) - (a.faturamento_liquido ?? 0))
    .slice(0, 15), [data]);
  const chartOptions = useMemo(() => {
    if (!data || data.length === 0) return null;

    const categories = sorted.map((d) => d.dimension || 'Sem Identificação');
    const values = (key: 'faturamento_liquido' | 'margem_bruta_valor' | 'impostos') => sorted.map((item) => ({
      value: item[key],
      itemStyle: { opacity: selectedName && selectedName !== item.dimension ? 0.3 : 1 },
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(10, 31, 61, 0.06)' } },
        backgroundColor: '#0a1f3d',
        borderColor: '#123063',
        borderWidth: 1,
        padding: [12, 16],
        textStyle: {
          color: '#FFFFFF',
          fontFamily: '"Work Sans", "Segoe UI", sans-serif',
          fontSize: 12,
        },
        formatter: (params: any[]) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const item = sorted[idx];
          if (!item) return '';

          return `
            <div style="font-weight: 700; color: #ffd30b; font-size: 13px; margin-bottom: 6px; font-family: Outfit, sans-serif;">
              ${String(item.dimension || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)}
            </div>
            <div style="font-size: 12px; color: #d8e3f5; display: flex; flex-direction: column; gap: 3px;">
              <div>Fat. Líquido: <strong style="color: #FFFFFF;">${formatCurrency(item.faturamento_liquido, { decimals: 0 })}</strong></div>
              <div>Fat. Contábil: <strong style="color: #FFFFFF;">${formatCurrency(item.faturamento_contabil, { decimals: 0 })}</strong></div>
              <div>Margem Bruta (R$): <strong style="color: #8ab1e6;">${formatCurrency(item.margem_bruta_valor, { decimals: 0 })}</strong></div>
              <div>Margem Bruta (%): <strong style="color: #ffd30b;">${formatPercent(item.margem_bruta_percentual)}</strong></div>
              <div>Impostos: <strong style="color: #ffe26a;">${formatCurrency(item.impostos, { decimals: 0 })} (${formatPercent(item.percentual_impostos)})</strong></div>
              <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
                Clientes: <strong style="color: #FFFFFF;">${formatNumber(item.clientes_identificados)}</strong> | Documentos: <strong style="color: #FFFFFF;">${formatNumber(item.documentos_distintos)}</strong>
              </div>
            </div>
          `;
        },
      },
      legend: {
        data: ['Fat. Líquido', 'Margem Bruta R$', 'Impostos'],
        textStyle: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, fontFamily: '"Work Sans", sans-serif' },
        top: 0,
        right: 10,
        icon: 'roundRect',
      },
      grid: {
        top: 40,
        right: 20,
        bottom: 24,
        left: 40,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: isDark ? '#244575' : '#CBD5E1' } },
        axisTick: { show: false },
        axisLabel: {
          color: isDark ? '#cbd5e1' : '#334155',
          fontSize: 12,
          fontFamily: '"Work Sans", sans-serif',
          interval: 0,
          rotate: categories.length > 5 ? 25 : 0,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: isDark ? '#1c3863' : '#E2E8F0', type: 'dashed' },
        },
        axisLabel: {
          color: isDark ? '#94a3b8' : '#475569',
          fontSize: 12,
          fontFamily: '"Work Sans", sans-serif',
          formatter: (v: number) => {
            if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} M`;
            if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} mil`;
            return `R$ ${v}`;
          },
        },
      },
      series: [
        {
          name: 'Fat. Líquido',
          type: 'bar',
          data: values('faturamento_liquido'),
          itemStyle: {
            color: isDark ? '#2a5ca8' : '#0a1f3d',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Margem Bruta R$',
          type: 'bar',
          data: values('margem_bruta_valor'),
          itemStyle: {
            color: '#5787cf',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Impostos',
          type: 'bar',
          data: values('impostos'),
          itemStyle: {
            color: '#dea712',
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [data, sorted, selectedName, isDark]);

  if (loading) {
    return <ChartSkeleton height={`h-[${height}px]`} />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Sem dados financeiros"
        message={`Não há registros agrupados por ${dimensionLabel} no período.`}
      />
    );
  }

  return (
    <div className="min-w-0 bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-display font-bold text-text-primary tracking-tight">
            Rentabilidade por {dimensionLabel}
          </h3>
          <p className="text-xs text-text-muted">
            Top {sorted.length} dimensões ordenadas por faturamento líquido gerado
          </p>
        </div>
      </div>

      <div style={{ height }}>
        {chartOptions && (
          <ReactECharts
            option={chartOptions}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge={true}
            onEvents={onSelect ? { click: (event: { componentType?: string; dataIndex?: number }) => {
              if (event.componentType === 'series' && event.dataIndex !== undefined && sorted[event.dataIndex]?.dimension) onSelect(sorted[event.dataIndex].dimension!);
            } } : undefined}
          />
        )}
      </div>
      {onSelect && <ChartFilterOptions
        label={`Filtrar ${dimensionLabel} pelo gráfico`}
        options={sorted.map((item) => ({ value: item.dimension!, label: item.dimension! }))}
        selected={selectedName}
        onSelect={onSelect}
      />}
    </div>
  );
};
