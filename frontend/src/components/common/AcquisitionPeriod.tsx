import type { QueryFilters } from '../../api/types';
import { formatDate } from '../../hooks/useFormatters';

export function acquisitionPeriodLabel(filters: QueryFilters, reference?: string) {
  const end = filters.end_date && (!reference || filters.end_date < reference) ? filters.end_date : reference;
  if (reference && filters.start_date && filters.start_date > reference) return `Período posterior à referência (${formatDate(reference)})`;
  if (filters.start_date && end) return `1ª compra de ${formatDate(filters.start_date)} a ${formatDate(end)}`;
  if (end) return `1ª compra no histórico até ${formatDate(end)}`;
  return 'Clientes com primeira compra válida no período';
}
