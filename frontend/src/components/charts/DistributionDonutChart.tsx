import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { PieChart } from 'lucide-react';
import { formatNumber } from '../../hooks/useFormatters';
import { ChartSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { useTheme } from '../../context/ThemeContext';

export interface DistributionItem {
  name: string;
  value: number;
}

interface DistributionDonutChartProps {
  title?: string;
  subtitle?: string;
  data: DistributionItem[];
  totalLabel?: string;
  loading?: boolean;
  height?: number;
  onSelect?: (name: string) => void;
  selectedName?: string | null;
}

// Paleta de alta distinção ancorada em Azul Escuro (#0a1f3d), Azul Claro (#5787cf) e Amarelo (#ffd30b/#dea712)
const LIGHT_PALETTE = [
  '#0a1f3d', // Azul Escuro (priority)
  '#5787cf', // Azul Claro oficial
  '#ffd30b', // Amarelo oficial
  '#0d9488', // Teal Executivo
  '#1d4ed8', // Azul Royal Profundo
  '#dea712', // Amarelo Escuro / Ouro
  '#0284c7', // Azul Oceano
  '#475569', // Ardósia Executiva
  '#4338ca', // Índigo Profundo
  '#c26a1b', // Bronze Âmbar
  '#0f766e', // Petróleo Escuro
  '#64748b', // Ardósia Média
];

// No modo escuro (#0b1b33), cada fatia mantém contraste >= 3.8:1 sem desaparecer no fundo nem estourar para branco
const DARK_PALETTE = [
  '#3b78e7', // Azul Royal Luminoso
  '#38bdf8', // Azul Celeste
  '#ffd30b', // Amarelo oficial
  '#14b8a6', // Turquesa Executivo
  '#818cf8', // Índigo Luminoso
  '#f0b429', // Ouro Âmbar
  '#6ba3ef', // Azul Claro Luminoso
  '#94a3b8', // Ardósia Clara
  '#22d3ee', // Ciano Vivo
  '#fb923c', // Cobre Suave
  '#2dd4bf', // Turquesa Claro
  '#788aa3', // Ardósia Média
];

export const DistributionDonutChart: React.FC<DistributionDonutChartProps> = ({
  title = 'Origem dos Novos Clientes',
  subtitle = 'Distribuição por Business Unit de aquisição',
  data = [],
  totalLabel = 'novos clientes',
  loading = false,
  height = 290,
  onSelect,
  selectedName,
}) => {
  const { isDark } = useTheme();
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const total = useMemo(() => {
    return data.reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [data]);

  const chartOptions = useMemo(() => {
    if (!data || data.length === 0) return null;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0a1f3d',
        borderColor: '#123063',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: '#FFFFFF',
          fontFamily: '"Work Sans", "Segoe UI", sans-serif',
          fontSize: 12,
        },
        formatter: (params: { name: string; value: number; color?: string }) => {
          const pct = total > 0 ? ((params.value / total) * 100).toFixed(1) : '0';
          const name = params.name.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
          const swatch = typeof params.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(params.color) ? params.color : '#5787cf';
          return `
            <div style="font-weight: 600; font-size: 12px; color: #c7d5eb; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background-color:${swatch};flex-shrink:0;"></span>
              <span>${name}</span>
            </div>
            <div style="font-size: 13px; font-weight: 700; color: #ffd30b; font-family: Outfit, sans-serif;">
              ${formatNumber(params.value)} (${pct.replace('.', ',')}%)
            </div>
          `;
        },
      },
      legend: {
        show: false,
      },
      series: [
        {
          name: title,
          type: 'pie',
          radius: ['62%', '86%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: isDark ? '#0b1b33' : '#FFFFFF',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 12,
              shadowColor: isDark ? 'rgba(87, 135, 207, 0.35)' : 'rgba(10, 31, 61, 0.28)',
            },
          },
          data: data.map((item, idx) => ({
            name: item.name,
            value: item.value,
            itemStyle: {
              color: palette[idx % palette.length],
              opacity: selectedName && selectedName !== item.name ? 0.35 : 1,
            },
          })),
        },
      ],
    };
  }, [data, title, total, selectedName, isDark, palette]);

  if (loading) {
    return <ChartSkeleton height={`h-[${height}px]`} />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Sem dados de distribuição"
        message="Não há registros de segmentação disponíveis no momento."
      />
    );
  }

  return (
    <div className="distribution-donut bg-surface border border-border rounded-2xl p-4 sm:p-5 relative flex flex-col shadow-sm h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <PieChart className="w-5 h-5 text-primary" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-display font-bold text-text-primary tracking-tight truncate">
              {title}
            </h3>
            <p className="text-xs text-text-muted leading-snug">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs text-primary font-semibold bg-tint px-2.5 py-0.5 rounded-full border border-tint-border shrink-0">
          {formatNumber(total)} Total
        </span>
      </div>

      {/* Main Container: Donut on Left, Legend on Right */}
      <div className="distribution-donut-layout flex-1 items-center">
        {/* Donut with Center Text */}
        <div className="distribution-donut-plot flex items-center justify-center" style={{ height: Math.max(205, height - 45) }}>
          {chartOptions && (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge={true}
              onEvents={onSelect ? { click: (event: { name?: string; componentType?: string }) => {
                if (event.componentType === 'series' && event.name) onSelect(event.name);
              } } : undefined}
            />
          )}

          {/* Center Callout */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-5">
            <span className="text-lg sm:text-xl font-display font-extrabold text-text-primary tracking-tight">
              {formatNumber(total)}
            </span>
            <span className="text-xs max-w-[110px] text-text-muted uppercase tracking-wide font-medium leading-tight mt-0.5">
              {totalLabel}
            </span>
          </div>
        </div>

        {/* Legend List on Right */}
        <div className="distribution-donut-legend" aria-label={`Legenda: ${title}`}>
          {data.map((item, idx) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
            const color = palette[idx % palette.length];
            const content = <>
              <span className="w-3 h-3 rounded-full shrink-0 mt-1 ring-1 ring-inset ring-black/15 dark:ring-white/20" style={{ backgroundColor: color }} />
              <span className="distribution-donut-label flex-1 min-w-0 text-text-secondary text-xs text-left font-medium">{item.name}</span>
              <span className="font-semibold text-text-primary text-xs shrink-0 text-right">
                {pct}%
                <span className="block text-xs font-normal text-text-muted">{formatNumber(item.value)}</span>
              </span>
            </>;
            const className = `flex items-start gap-2 w-full text-xs p-2 rounded-lg transition-colors border ${selectedName === item.name ? 'border-primary bg-tint' : 'border-transparent hover:bg-surface-elevated'}`;
            return onSelect ? (
              <button
                type="button"
                key={item.name}
                className={className}
                aria-pressed={selectedName === item.name}
                aria-label={`Filtrar ${item.name}`}
                onClick={() => onSelect(item.name)}
              >
                {content}
              </button>
            ) : (
              <div key={item.name} className={className}>{content}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
