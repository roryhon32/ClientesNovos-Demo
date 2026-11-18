export function formatCurrency(
  value: number | null | undefined,
  options?: { compact?: boolean; prefix?: string; unitStyle?: 'legacy' | 'bi'; decimals?: number }
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  const prefix = options?.prefix ?? 'R$ ';

  if (options?.compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const isBi = options?.unitStyle === 'bi';
    if (abs >= 1_000_000_000) {
      return `${prefix}${sign}${(abs / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${isBi ? 'B' : 'bi'}`;
    }
    if (abs >= 1_000_000) {
      if (isBi) {
        const millions = abs / 1_000_000;
        const isWholeOrLarge = millions >= 100 || Math.abs(millions - Math.round(millions)) < 0.005;
        return `${prefix}${sign}${millions.toLocaleString('pt-BR', {
          minimumFractionDigits: isWholeOrLarge ? 0 : 1,
          maximumFractionDigits: isWholeOrLarge ? 0 : 2,
        })} M`;
      }
      return `${prefix}${sign}${(abs / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} mi`;
    }
    if (abs >= 1_000) {
      if (isBi) {
        return `${prefix}${sign}${Math.round(abs).toLocaleString('pt-BR')}`;
      }
      return `${prefix}${sign}${(abs / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
    }
  }

  const decimals = options?.decimals ?? 2;
  return `${prefix}${value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(
  value: number | null | undefined,
  options?: { includeSign?: boolean; decimals?: number }
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  const decimals = options?.decimals ?? 1;
  const formatted = Math.abs(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = options?.includeSign ? (value > 0 ? '+' : value < 0 ? '-' : '') : value < 0 ? '-' : '';
  return `${sign}${formatted}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('pt-BR');
}

export function formatDate(
  dateStr: string | null | undefined,
  format: 'short' | 'month-year' | 'iso' = 'short'
): string {
  if (!dateStr) return '—';

  // Expecting ISO YYYY-MM-DD or YYYY-MM
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;

  if (format === 'month-year') {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${monthNames[month]} ${year}`;
  }

  if (format === 'short') {
    const d = String(day).padStart(2, '0');
    const m = String(month + 1).padStart(2, '0');
    return `${d}/${m}/${year}`;
  }

  return dateStr;
}

export function getMonthLabel(monthIndex: number): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return months[monthIndex] || '';
}

export function selectedSingleMonth(
  startDate?: string | null,
  endDate?: string | null
): string | undefined {
  if (!startDate || !endDate) return undefined;
  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth) || startMonth !== endMonth) {
    return undefined;
  }
  return startMonth;
}
