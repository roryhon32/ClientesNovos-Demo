import React from 'react';
import { LucideIcon } from 'lucide-react';
import { TrendBadge } from './TrendBadge';
import { Sparkline } from './Sparkline';
import { useTheme } from '../../context/ThemeContext';

interface MetricCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: number | null;
  comparisonLabel?: string;
  isFavorablePositive?: boolean;
  sparklineData?: number[];
  loading?: boolean;
  subtitle?: string;
  tooltip?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  comparisonLabel = 'vs. período anterior',
  isFavorablePositive = true,
  sparklineData,
  loading = false,
  subtitle,
  tooltip,
}) => {
  const { isDark } = useTheme();

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden animate-pulse shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-border" />
          <div className="w-16 h-4 rounded bg-surface-elevated" />
        </div>
        <div className="w-28 h-8 rounded bg-surface-elevated mb-3" />
        <div className="w-36 h-4 rounded bg-surface-elevated" />
      </div>
    );
  }

  return (
    <div
      className="group bg-surface hover:bg-surface-hover/50 border border-border hover:border-primary/50 rounded-2xl p-4 pt-5 transition-all duration-200 relative overflow-hidden flex flex-col justify-between shadow-sm"
      title={tooltip}
    >
      {/* Institutional Dark Blue accent strip */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0a1f3d] via-[#123063] to-[#5787cf]" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 group-hover:border-primary/40 flex items-center justify-center transition-colors">
            <Icon className="w-5 h-5 text-primary" strokeWidth={1.8} />
          </div>
          {sparklineData && sparklineData.length >= 2 && (
            <div className="opacity-85 group-hover:opacity-100 transition-opacity">
              <Sparkline
                data={sparklineData}
                width={80}
                height={32}
                color={trend && trend < 0 ? (isDark ? '#f87171' : '#dc2626') : (isDark ? '#5787cf' : '#0a1f3d')}
              />
            </div>
          )}
        </div>

        <p className="text-xs font-display font-semibold text-text-muted uppercase tracking-wider mb-1">
          {title}
        </p>

        <h3 className="text-2xl sm:text-3xl font-display font-bold text-text-primary tracking-tight mb-2">
          {value}
        </h3>
      </div>

      <div className="pt-2.5 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        <TrendBadge
          value={trend}
          comparisonLabel={comparisonLabel}
          isFavorablePositive={isFavorablePositive}
        />
        {subtitle && (
          <span className="text-xs text-text-muted font-medium">{subtitle}</span>
        )}
      </div>
    </div>
  );
};
