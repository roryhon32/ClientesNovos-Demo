import React from 'react';
import { Customer } from '../../api/types';
import { formatDate, formatCurrency, formatPercent } from '../../hooks/useFormatters';
import { ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '../common/LoadingSkeleton';
import { HorizontalScroll } from '../common/HorizontalScroll';

export interface SortCriterion {
  field: string;
  order: 'asc' | 'desc';
}

interface CustomerTableProps {
  customers: Customer[];
  loading?: boolean;
  onSelectCustomer?: (customer: Customer) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  sorts?: SortCriterion[];
  onSort?: (column: string, options?: { additive?: boolean }) => void;
  showPagination?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

const UNIFORM_AVATAR_CLASS =
  'w-9 h-9 min-w-[2.25rem] min-h-[2.25rem] shrink-0 rounded-xl bg-tint border border-tint-border text-primary flex items-center justify-center font-display font-bold text-xs shadow-sm';

export const CustomerTable: React.FC<CustomerTableProps> = ({
  customers = [],
  loading = false,
  onSelectCustomer,
  sortBy,
  sortOrder,
  sorts,
  onSort,
  showPagination = false,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}) => {
  const activeSorts: SortCriterion[] =
    sorts && sorts.length > 0
      ? sorts
      : sortBy
      ? [{ field: sortBy, order: sortOrder || 'asc' }]
      : [];

  const getSortEntry = (column: string) => {
    const idx = activeSorts.findIndex((item) => item.field === column);
    return idx >= 0 ? { index: idx, order: activeSorts[idx].order } : null;
  };

  const getAriaSort = (column: string): 'ascending' | 'descending' | 'none' => {
    const entry = getSortEntry(column);
    if (!entry || entry.index !== 0) return 'none';
    return entry.order === 'asc' ? 'ascending' : 'descending';
  };

  const handleHeaderClick = (column: string, event: React.MouseEvent) => {
    if (!onSort) return;
    if (event.shiftKey) {
      onSort(column, { additive: true });
    } else {
      onSort(column);
    }
  };

  const renderSortIcon = (column: string) => {
    const entry = getSortEntry(column);
    if (!entry) {
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-60 ml-1 inline shrink-0" />;
    }
    const isPrimary = entry.index === 0;
    const arrow =
      entry.order === 'asc' ? (
        <ArrowUp className={`w-3.5 h-3.5 ml-0.5 inline shrink-0 ${isPrimary ? 'text-accent' : 'text-white/90'}`} />
      ) : (
        <ArrowDown className={`w-3.5 h-3.5 ml-0.5 inline shrink-0 ${isPrimary ? 'text-accent' : 'text-white/90'}`} />
      );
    if (activeSorts.length <= 1) {
      return arrow;
    }
    return (
      <span aria-hidden="true" className="inline-flex items-center ml-1 align-middle">
        <span
          className={`inline-flex items-center justify-center rounded px-1 text-[10px] leading-tight font-bold ${
            isPrimary ? 'bg-accent text-[#0a1f3d]' : 'bg-white/20 text-white'
          }`}
        >
          {entry.index + 1}º
        </span>
        {arrow}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3.5 rounded-xl bg-surface-elevated border border-border animate-pulse"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="w-32 h-3.5" />
                <Skeleton className="w-20 h-2.5" />
              </div>
            </div>
            <Skeleton className="w-20 h-4" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-16 h-4" />
          </div>
        ))}
      </div>
    );
  }

  if (!customers || customers.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-text-muted">
        Nenhum cliente encontrado com os critérios especificados.
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <HorizontalScroll label="Clientes" className="rounded-xl border border-border overflow-hidden">
      <table className="w-full min-w-[640px] text-left border-collapse">
        <thead>
          <tr className="bg-action text-white text-xs font-display font-semibold uppercase tracking-wide">
            <th
              className="py-2.5 pl-3 pr-1.5 xl:pr-2 cursor-pointer hover:bg-action-hover transition-colors leading-tight"
              aria-sort={getAriaSort('name')}
              onClick={(e) => handleHeaderClick('name', e)}
            >
              Cliente REAL / Nome Cliente {renderSortIcon('name')}
            </th>
            <th
              className="py-2.5 px-1.5 xl:px-2 cursor-pointer hover:bg-action-hover transition-colors leading-tight"
              aria-sort={getAriaSort('first_purchase')}
              onClick={(e) => handleHeaderClick('first_purchase', e)}
            >
              Primeira Compra {renderSortIcon('first_purchase')}
            </th>
            <th
              className="py-2.5 px-1.5 xl:px-2 cursor-pointer hover:bg-action-hover transition-colors leading-tight"
              aria-sort={getAriaSort('last_purchase')}
              onClick={(e) => handleHeaderClick('last_purchase', e)}
            >
              Última Compra {renderSortIcon('last_purchase')}
            </th>
            <th
              className="py-2.5 px-1.5 xl:px-2 cursor-pointer hover:bg-action-hover transition-colors text-right leading-tight"
              aria-sort={getAriaSort('net_revenue')}
              onClick={(e) => handleHeaderClick('net_revenue', e)}
            >
              Receita Gerada {renderSortIcon('net_revenue')}
            </th>
            <th
              className="py-2.5 px-1.5 xl:px-2 cursor-pointer hover:bg-action-hover transition-colors text-right leading-tight"
              onClick={(e) => handleHeaderClick('gross_margin', e)}
              aria-sort={getAriaSort('gross_margin')}
            >
              <button type="button" className="inline-flex items-center justify-end text-right leading-tight">Margem Bruta (R$){renderSortIcon('gross_margin')}</button>
            </th>
            <th
              className="py-2.5 px-1.5 xl:px-2 cursor-pointer hover:bg-action-hover transition-colors text-right leading-tight"
              onClick={(e) => handleHeaderClick('gross_margin_pct', e)}
              aria-sort={getAriaSort('gross_margin_pct')}
            >
              <button type="button" className="inline-flex items-center justify-end text-right leading-tight">Margem Bruta %{renderSortIcon('gross_margin_pct')}</button>
            </th>
            <th className="py-2.5 px-1.5 xl:px-2 text-center">Status</th>
            <th className="py-2.5 pl-1 pr-2 w-6 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-xs bg-surface">
          {customers.map((c) => {
            const realName = c.real_customer_names?.join(' / ') || 'Cliente REAL não informado';
            const customerName = c.customer_names?.join(' / ') || c.name || 'Não informado';
            const initial = realName.charAt(0).toUpperCase();

            return (
              <tr
                key={c.customer_id}
                onClick={() => onSelectCustomer && onSelectCustomer(c)}
                className="group hover:bg-surface-hover/70 transition-colors cursor-pointer"
              >
                {/* Cliente */}
                <td className="py-2.5 pl-3 pr-1.5 xl:pr-2 max-w-[230px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={UNIFORM_AVATAR_CLASS}>
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1 leading-snug">
                      <button type="button" title={realName} className="block max-w-full text-left font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                        {realName}
                      </button>
                      <div className="text-xs text-text-secondary truncate" title={customerName}>
                        Nome Cliente: {customerName}
                      </div>
                      <div className="text-xs text-text-muted font-mono truncate">
                        RAIZ CNPJ: {c.customer_id}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Primeira Compra */}
                <td className="py-2.5 px-1.5 xl:px-2 text-text-secondary whitespace-nowrap tabular-nums">
                  {formatDate(c.first_purchase)}
                </td>

                {/* Última Compra */}
                <td className="py-2.5 px-1.5 xl:px-2 text-text-secondary whitespace-nowrap tabular-nums">
                  {formatDate(c.last_purchase)}
                </td>

                {/* Receita Gerada */}
                <td className="py-2.5 px-1.5 xl:px-2 text-right font-semibold text-text-primary whitespace-nowrap tabular-nums">
                  {formatCurrency(c.faturamento_liquido)}
                </td>

                {/* Margem Bruta */}
                <td className={`py-2.5 px-1.5 xl:px-2 text-right font-medium whitespace-nowrap tabular-nums ${(c.margem_bruta_valor ?? 0) < 0 ? 'text-negative' : 'text-text-primary'}`}>
                  {formatCurrency(c.margem_bruta_valor)}
                </td>
                <td className="py-2.5 px-1.5 xl:px-2 text-right font-medium text-text-primary whitespace-nowrap tabular-nums">
                  {formatPercent(c.margem_bruta_percentual)}
                </td>

                {/* Status */}
                <td className="py-2.5 px-1.5 xl:px-2 text-center whitespace-nowrap">
                  {(() => {
                    const isOnePurchase = (c.valid_purchases ?? 0) <= 1;
                    const displayStatus = c.status;
                    const tooltip =
                      displayStatus === 'NOVO'
                        ? isOnePurchase
                          ? 'Novo: 1ª compra recente (comprou 1 vez, ainda sem recompra)'
                          : 'Novo: Primeira compra faturada na safra de entrada'
                        : displayStatus === 'RECORRENTE'
                        ? `Recorrente: ${c.valid_purchases} compras válidas com recompra ativa em menos de 180 dias`
                        : displayStatus === 'EM RISCO'
                        ? `Em Risco: Entre 180 e 364 dias sem compras (${c.valid_purchases} ${c.valid_purchases === 1 ? 'compra' : 'compras'})`
                        : displayStatus === 'INATIVO'
                        ? `Inativo (Churn): 365 dias ou mais sem compras (${c.valid_purchases} ${c.valid_purchases === 1 ? 'compra' : 'compras'})`
                        : 'Sem compras faturadas válidas';

                    return (
                      <div className="inline-flex flex-col items-center">
                        <span
                          title={tooltip}
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide cursor-help border ${
                            displayStatus === 'NOVO'
                              ? 'bg-tint text-primary border-tint-border'
                              : displayStatus === 'RECORRENTE'
                              ? 'bg-positive/10 text-positive border-positive/30'
                              : displayStatus === 'EM RISCO'
                              ? 'bg-warning/10 text-warning border-warning/30'
                              : displayStatus === 'INATIVO'
                              ? 'bg-negative/10 text-negative border-negative/30'
                              : 'bg-surface-elevated text-text-muted border-border'
                          }`}
                        >
                          {displayStatus}
                        </span>
                        <span className="text-xs text-text-muted mt-0.5 font-medium">
                          {c.valid_purchases === 1 ? '1 compra' : `${c.valid_purchases ?? 0} compras`}
                        </span>
                      </div>
                    );
                  })()}
                </td>

                {/* Arrow Action */}
                <td className="py-3 px-2 text-right">
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all inline" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </HorizontalScroll>

      {/* Pagination Footer */}
      {showPagination && totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-border text-xs text-text-muted">
          <span>
            Página <strong className="text-text-primary">{currentPage}</strong> de{' '}
            <strong className="text-text-primary">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange && onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-text-primary font-medium hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange && onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-text-primary font-medium hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
