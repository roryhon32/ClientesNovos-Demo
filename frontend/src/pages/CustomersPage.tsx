import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { CustomerTable, SortCriterion } from '../components/customers/CustomerTable';
import { CustomerDetailDrawer } from '../components/customers/CustomerDetailDrawer';
import { useGlobalFilters } from '../context/FilterContext';
import { useCustomers } from '../api/queries';
import { formatNumber } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { ErrorState } from '../components/common/ErrorState';

interface SortFieldConfig {
  field: string;
  label: string;
  defaultOrder: 'asc' | 'desc';
  descLabel: string;
  ascLabel: string;
}

const SORT_FIELDS: SortFieldConfig[] = [
  { field: 'net_revenue', label: 'Receita Gerada', defaultOrder: 'desc', descLabel: 'Maior', ascLabel: 'Menor' },
  { field: 'last_purchase', label: 'Última Compra', defaultOrder: 'desc', descLabel: 'Mais recente', ascLabel: 'Mais antiga' },
  { field: 'first_purchase', label: 'Primeira Compra', defaultOrder: 'desc', descLabel: 'Mais recente', ascLabel: 'Mais antiga' },
  { field: 'gross_margin', label: 'Margem Bruta (R$)', defaultOrder: 'desc', descLabel: 'Maior', ascLabel: 'Menor' },
  { field: 'gross_margin_pct', label: 'Margem Bruta %', defaultOrder: 'desc', descLabel: 'Maior', ascLabel: 'Menor' },
  { field: 'name', label: 'Cliente', defaultOrder: 'asc', descLabel: 'Z → A', ascLabel: 'A → Z' },
];

const SORT_META = Object.fromEntries(SORT_FIELDS.map((item) => [item.field, item]));

export const CustomersPage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const { filters } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sorts, setSorts] = useState<SortCriterion[]>([{ field: 'net_revenue', order: 'desc' }]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Cancela a busca anterior ao continuar digitando ou desmontar a página.
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(handler);
  }, [search]);
  const [queryPage, setQueryPage] = useState({ key: '', page: 1 });
  const queryKey = JSON.stringify([filters, debouncedSearch, sorts]);
  const currentPage = queryPage.key === queryKey ? queryPage.page : 1;
  const changePage = (next: number) => setQueryPage({ key: queryKey, page: next });

  const updateSorts = (next: SortCriterion[]) => {
    setSorts(next);
    setQueryPage({ key: JSON.stringify([filters, debouncedSearch, next]), page: 1 });
  };

  const handleSort = (column: string, options?: { additive?: boolean }) => {
    const defaultOrder = SORT_META[column]?.defaultOrder ?? 'desc';
    if (options?.additive) {
      const existingIdx = sorts.findIndex((item) => item.field === column);
      if (existingIdx >= 0) {
        updateSorts(
          sorts.map((item, idx) => (idx === existingIdx ? { ...item, order: item.order === 'asc' ? 'desc' : 'asc' } : item))
        );
      } else if (sorts.length < 4) {
        updateSorts([...sorts, { field: column, order: defaultOrder }]);
      }
      return;
    }

    if (sorts[0]?.field === column) {
      updateSorts([
        { ...sorts[0], order: sorts[0].order === 'asc' ? 'desc' : 'asc' },
        ...sorts.slice(1),
      ]);
    } else {
      updateSorts([{ field: column, order: defaultOrder }]);
    }
  };

  const toggleSortDirection = (index: number) => {
    updateSorts(
      sorts.map((item, idx) => (idx === index ? { ...item, order: item.order === 'asc' ? 'desc' : 'asc' } : item))
    );
  };

  const promoteToPreferred = (index: number) => {
    if (index <= 0 || index >= sorts.length) return;
    const chosen = sorts[index];
    const remaining = sorts.filter((_, idx) => idx !== index);
    updateSorts([chosen, ...remaining]);
  };

  const addSortCriterion = (field: string) => {
    if (!field || sorts.some((item) => item.field === field) || sorts.length >= 4) return;
    const defaultOrder = SORT_META[field]?.defaultOrder ?? 'desc';
    updateSorts([...sorts, { field, order: defaultOrder }]);
  };

  const removeSortCriterion = (index: number) => {
    if (sorts.length <= 1) return;
    updateSorts(sorts.filter((_, idx) => idx !== index));
  };

  const primarySort = sorts[0] || { field: 'net_revenue', order: 'desc' as const };
  const multiSortParam = sorts.length > 1 ? sorts.map((item) => `${item.field}:${item.order}`).join(',') : undefined;
  const availableSortFields = SORT_FIELDS.filter((cfg) => !sorts.some((item) => item.field === cfg.field));

  const { data, isLoading, error, refetch } = useCustomers({
    ...filters,
    page: currentPage,
    page_size: 15,
    sort_by: primarySort.field,
    sort_order: primarySort.order,
    ...(multiSortParam ? { sort: multiSortParam } : {}),
    search: debouncedSearch || undefined,
  });

  const pageData = data?.data;
  const customers = pageData?.items || [];
  const pagination = pageData?.pagination || { page: 1, page_size: 15, total_items: 0, total_pages: 1 };

  return (
    <div ref={containerRef} className="space-y-6">
      <Header
        title="Base de Clientes"
        subtitle="Exploração cadastral, financeira e histórica individual de clientes."
        section="CLIENTES B2B"
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
      />

      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />

      {/* Main Table Container */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 gsap-section shadow-sm">
        {/* Search & Actions Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-primary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar clientes"
              placeholder="Buscar por Nome Cliente, Cliente REAL ou raiz CNPJ..."
              className="w-full bg-surface-elevated border border-border focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl pl-10 pr-4 py-2.5 text-xs text-text-primary placeholder:text-text-muted transition-colors outline-none"
            />
          </div>

          {/* Counts & Status */}
          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-text-muted">
            <span>
              Total localizado: <strong className="text-text-primary">{formatNumber(pagination.total_items)}</strong> clientes
            </span>
          </div>
        </div>

        {/* Multi-column Sort Priority Bar */}
        <div
          className="mb-4 rounded-xl bg-surface-elevated/70 border border-border px-3 py-2 flex flex-wrap items-center gap-2 text-xs"
          aria-label="Critérios de ordenação da tabela"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-text-secondary shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
            Ordenação:
          </span>

          {sorts.map((criterion, idx) => {
            const meta = SORT_META[criterion.field] || {
              field: criterion.field,
              label: criterion.field,
              defaultOrder: 'desc' as const,
              descLabel: 'Maior',
              ascLabel: 'Menor',
            };
            const dirLabel = criterion.order === 'desc' ? meta.descLabel : meta.ascLabel;
            const isPrimary = idx === 0;

            return (
              <React.Fragment key={criterion.field}>
                {idx === 1 && (
                  <button
                    type="button"
                    onClick={() => promoteToPreferred(1)}
                    title="Trocar qual coluna é a preferencial (1ª ↔ 2ª)"
                    aria-label="Trocar coluna preferencial"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border hover:border-primary text-primary font-medium transition-colors"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span className="hidden sm:inline">Trocar preferencial</span>
                  </button>
                )}

                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                    isPrimary
                      ? 'bg-tint border-tint-border text-text-primary font-semibold'
                      : 'bg-surface border-border text-text-secondary font-medium'
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] leading-none font-bold ${
                      isPrimary ? 'bg-action text-white' : 'bg-surface-elevated text-text-muted border border-border'
                    }`}
                  >
                    {isPrimary ? '1ª Preferencial' : `${idx + 1}ª`}
                  </span>
                  <span>{meta.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleSortDirection(idx)}
                    aria-label={`Inverter direção de ${meta.label}`}
                    title="Alternar crescente/decrescente"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface/80 hover:bg-surface-hover border border-border/70 text-primary font-medium transition-colors"
                  >
                    {criterion.order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    <span>{dirLabel}</span>
                  </button>
                  {idx > 1 && (
                    <button
                      type="button"
                      onClick={() => promoteToPreferred(idx)}
                      aria-label={`Definir ${meta.label} como preferencial`}
                      title="Tornar preferencial (1ª)"
                      className="px-1.5 py-0.5 rounded hover:bg-surface-hover text-primary font-medium transition-colors"
                    >
                      1ª
                    </button>
                  )}
                  {sorts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSortCriterion(idx)}
                      aria-label={`Remover ordenação por ${meta.label}`}
                      title="Remover critério"
                      className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-negative transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {sorts.length < 4 && availableSortFields.length > 0 && (
            <select
              aria-label="Adicionar critério de ordenação"
              value=""
              onChange={(e) => addSortCriterion(e.target.value)}
              className="bg-surface border border-border hover:border-primary/50 rounded-lg px-2.5 py-1 text-xs text-text-primary cursor-pointer outline-none focus:border-primary transition-colors"
            >
              <option value="">+ Adicionar coluna...</option>
              {availableSortFields.map((cfg) => (
                <option key={cfg.field} value={cfg.field}>
                  {cfg.label}
                </option>
              ))}
            </select>
          )}

          <span className="hidden xl:inline text-text-muted ml-auto">
            Shift + clique no cabeçalho adiciona critério
          </span>
        </div>

        {error ? (
          <ErrorState
            title="Erro ao listar clientes"
            message="Ocorreu um erro ao consultar os clientes no banco analítico."
            onRetry={() => refetch()}
          />
        ) : (
          <CustomerTable
            customers={customers}
            loading={isLoading}
            onSelectCustomer={(c) => setSelectedCustomerId(c.customer_id)}
            sorts={sorts}
            onSort={handleSort}
            showPagination={true}
            currentPage={pagination.page}
            totalPages={pagination.total_pages}
            onPageChange={changePage}
          />
        )}
      </div>

      {/* Customer Detail Drawer */}
      <CustomerDetailDrawer
        filters={filters}
        key={selectedCustomerId || 'closed'}
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />
    </div>
  );
};
