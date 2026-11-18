import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { formatPercent } from '../../hooks/useFormatters';

interface TrendBadgeProps {
  value: number | null | undefined;
  comparisonLabel?: string;
  isFavorablePositive?: boolean;
  className?: string;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({
  value,
  comparisonLabel = 'vs. período anterior',
  isFavorablePositive = true,
  className = '',
}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-text-muted ${className}`}>
        <Minus className="w-3.5 h-3.5 text-text-muted shrink-0" strokeWidth={1.75} />
        <span className="text-xs">Sem comparação válida</span>
      </div>
    );
  }

  const isPositive = value > 0;
  const isZero = Math.abs(value) < 0.0001;
  const isFavorable = isZero ? true : isFavorablePositive ? isPositive : !isPositive;

  const colorClass = isZero
    ? 'text-text-muted'
    : isFavorable
    ? 'text-positive'
    : 'text-negative';

  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <span className={`inline-flex items-center font-semibold ${colorClass}`}>
        {isPositive ? (
          <ArrowUp className="w-3.5 h-3.5 mr-0.5 inline" strokeWidth={2} />
        ) : isZero ? (
          <Minus className="w-3.5 h-3.5 mr-0.5 inline" strokeWidth={2} />
        ) : (
          <ArrowDown className="w-3.5 h-3.5 mr-0.5 inline" strokeWidth={2} />
        )}
        {formatPercent(value, { decimals: 1 })}
      </span>
      {comparisonLabel && (
        <span className="text-text-muted text-xs truncate">{comparisonLabel}</span>
      )}
    </div>
  );
};
