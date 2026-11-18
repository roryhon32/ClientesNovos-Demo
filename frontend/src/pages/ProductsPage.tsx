import { Fragment, useEffect, useState } from 'react';
import { Package, CalendarDays, ChevronDown, FileText } from 'lucide-react';
import { useProductRepurchase, useProductInvoices } from '../api/behavior';
import type { ProductRepurchaseParams } from '../api/behavior';
import type { QueryFilters } from '../api/types';
import { useFilterOptions } from '../api/queries';
import { useGlobalFilters } from '../context/FilterContext';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { MetricCard } from '../components/common/MetricCard';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { Skeleton } from '../components/common/LoadingSkeleton';
import { HorizontalScroll } from '../components/common/HorizontalScroll';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';

const control = 'mt-1 w-full bg-surface-elevated border border-border text-text-primary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary';
const cell = 'p-3';

interface CodeInvoicesSubtableProps {
  code: string;
  codeDesc?: string;
  filters: QueryFilters;
}

export function CodeInvoicesSubtable({ code, codeDesc, filters }: CodeInvoicesSubtableProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [sortBy, setSortBy] = useState<'data_emissao' | 'num_docto' | 'cliente_real' | 'faturamento_liquido' | 'margem_bruta_valor' | 'margem_bruta_percentual'>('data_emissao');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error, refetch, isFetching } = useProductInvoices(code, filters, {
    page,
    page_size: pageSize,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  const pageData = data?.data;
  const invoices = pageData?.items ?? [];
  const pagination = pageData?.pagination;

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-surface-elevated p-3.5 space-y-3 shadow-inner my-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-display font-semibold text-text-primary">Notas Fiscais do Código {code}</span>
          {codeDesc && <span className="text-text-muted text-xs truncate max-w-sm">({codeDesc})</span>}
          {pagination?.total_items !== undefined && (
            <span className="text-xs bg-action text-white dark:border dark:border-cyan/35 px-2.5 py-0.5 rounded-full font-semibold">
              {formatNumber(pagination.total_items)} {pagination.total_items === 1 ? 'nota' : 'notas'}
            </span>
          )}
        </div>
        {isFetching && <span className="text-xs text-primary font-medium animate-pulse">Atualizando notas…</span>}
      </div>

      {error ? (
        <div className="text-xs text-negative p-3 bg-negative/10 rounded-lg flex items-center justify-between">
          <span>Não foi possível carregar as notas deste código.</span>
          <button type="button" onClick={() => refetch()} className="text-primary underline font-semibold">Tentar novamente</button>
        </div>
      ) : isLoading ? (
        <div className="py-4 text-center text-xs text-text-muted">
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : !invoices.length ? (
        <div className="py-4 text-center text-xs text-text-muted bg-surface rounded-lg border border-border">
          Nenhuma nota fiscal encontrada para o código {code} no recorte selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-xs text-left">
            <thead className="bg-action text-white font-display text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('num_docto')}>
                  Nota / Série {sortBy === 'num_docto' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('data_emissao')}>
                  Emissão {sortBy === 'data_emissao' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('cliente_real')}>
                  Cliente Real {sortBy === 'cliente_real' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 text-right cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('faturamento_liquido')}>
                  Faturamento {sortBy === 'faturamento_liquido' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 text-right cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('margem_bruta_valor')}>
                  MB (R$) {sortBy === 'margem_bruta_valor' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 text-right cursor-pointer hover:bg-action-hover" onClick={() => toggleSort('margem_bruta_percentual')}>
                  MB (%) {sortBy === 'margem_bruta_percentual' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="py-2.5 px-3 text-right">Itens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv, idx) => (
                <tr key={`${inv.num_docto}_${inv.serie}_${inv.data_emissao}_${idx}`} className="hover:bg-surface-hover/50">
                  <td className="py-2.5 px-3 font-mono text-xs font-medium text-text-primary whitespace-nowrap">
                    {inv.num_docto}{inv.serie ? ` - ${inv.serie}` : ''}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-text-secondary whitespace-nowrap">
                    {formatDate(inv.data_emissao)}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    <div className="font-semibold text-text-primary">{inv.cliente_real}</div>
                    {inv.nome_cliente && inv.nome_cliente !== inv.cliente_real && (
                      <div className="text-xs text-text-muted truncate max-w-xs">{inv.nome_cliente}</div>
                    )}
                    {inv.raiz_cnpj && (
                      <div className="text-xs font-mono text-text-muted">CNPJ: {inv.raiz_cnpj}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-primary font-semibold whitespace-nowrap">
                    {formatCurrency(inv.faturamento_liquido)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-primary whitespace-nowrap">
                    {formatCurrency(inv.margem_bruta_valor)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-primary whitespace-nowrap">
                    {formatPercent(inv.margem_bruta_percentual)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-muted text-xs">
                    {inv.itens}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && pagination.total_pages > 1 && (
            <div className="p-2.5 bg-surface-elevated border-t border-border flex items-center justify-between text-xs text-text-muted">
              <span>Página {page} de {pagination.total_pages} ({formatNumber(pagination.total_items)} notas)</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage(p => p - 1)}
                  className="px-2.5 py-1 rounded-lg border border-border bg-surface text-text-primary font-medium disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.total_pages || isFetching}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2.5 py-1 rounded-lg border border-border bg-surface text-text-primary font-medium disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProductsPage() {
  const containerRef = useGsapPageEntrance();
  const { filters, setFilter, toggleFilter } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [minDays, setMinDays] = useState(0);
  const [groupBy, setGroupBy] = useState<'product' | 'product_id'>('product');
  const [sortBy, setSortBy] = useState<ProductRepurchaseParams['sort_by']>('repurchase_rate_pct');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  const toggleExpand = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleExpandCode = (code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const selectionKey = JSON.stringify([filters, term, minDays, sortBy, sortOrder, groupBy]);
  const page = pageState.key === selectionKey ? pageState.page : 1;
  const { data, error, isLoading, isFetching, refetch } = useProductRepurchase(filters, {
    page, page_size: 15, search: term || undefined, min_observation_days: minDays, sort_by: sortBy, sort_order: sortOrder, group_by: groupBy,
  });
  const { data: familyData } = useFilterOptions('family', { ...filters, family: null, product: null });
  const families = familyData?.data.items.map(row => row.value) ?? [];
  const result = data?.data;
  const rows = result?.items ?? [];
  const pagination = result?.pagination;

  return (
    <div ref={containerRef} className="space-y-6 min-w-0">
      <Header title="Produtos e Recompra" subtitle="Frequência e fidelização por produto, com clientes únicos e datas de compra distintas." section="COMPORTAMENTO DE COMPRA" filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(!filtersOpen)} />
      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 gsap-kpi">
        <MetricCard title="Produtos no recorte" value={formatNumber(pagination?.total_items)} icon={Package} loading={isLoading} comparisonLabel="Após filtros e busca selecionados" />
        <MetricCard title="Observação mínima selecionada" value={`${formatNumber(result?.min_observation_days ?? minDays)} dias`} icon={CalendarDays} loading={isLoading} comparisonLabel={`Até ${formatDate(result?.observation_end)}`} subtitle="0 dias mantém todos os clientes na análise" />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-sm">
        <h2 className="font-display font-semibold text-base text-text-primary">Ranking de recompra por produto</h2>
        <p className="text-xs text-text-secondary leading-relaxed">Taxa = clientes únicos que compraram o mesmo produto em pelo menos duas datas de emissão distintas ÷ clientes únicos elegíveis que compraram o produto × 100. A raiz CNPJ identifica o cliente; itens da mesma compra não geram recompra.</p>
        <p className="text-xs text-text-muted leading-relaxed">O período limita as compras observadas. Compras válidas excluem devoluções e cancelamentos. O tempo de observação vai da primeira compra do produto no recorte até o final observado. O mínimo começa em zero, sem excluir clientes por uma janela arbitrária; aumente-o para comparar clientes com mais tempo para recomprar.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <label className="text-xs font-medium text-text-secondary">Buscar produto<input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} className={control} placeholder="Nome do produto ou código" /></label>
          <label className="text-xs font-medium text-text-secondary">Visualizar por<select value={groupBy} onChange={event => setGroupBy(event.target.value as 'product' | 'product_id')} className={control}><option value="product">Por Produto (com detalhe por código)</option><option value="product_id">Por Código do produto</option></select></label>
          <label className="text-xs font-medium text-text-secondary">Família · nesta página<select value={filters.family || ''} onChange={event => setFilter('family', event.target.value || null)} className={control}><option value="">Todas as famílias</option>{filters.family && !families.includes(filters.family) && <option value={filters.family}>{filters.family}</option>}{families.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs font-medium text-text-secondary">Observação mínima (dias)<input type="number" min={0} max={36500} step={1} value={minDays} onChange={event => setMinDays(Math.max(0, Math.min(36500, Math.floor(Number(event.target.value) || 0))))} className={control} /></label>
          <label className="text-xs font-medium text-text-secondary">Ordenar por<select value={sortBy} onChange={event => setSortBy(event.target.value as ProductRepurchaseParams['sort_by'])} className={control}><option value="repurchase_rate_pct">Taxa de recompra</option><option value="customers">Clientes compradores</option><option value="repurchased_customers">Clientes que recompraram</option><option value="product">Nome do produto (A-Z)</option><option value="product_id">Código do produto</option></select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted pt-1">
          <p>Clique no produto para filtrar a página. Clique na seta para expandir o detalhamento por código e depois visualizar as notas fiscais correspondentes.</p>
          <button type="button" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="rounded-lg border border-border bg-surface-elevated hover:border-primary px-3 py-2 text-text-primary font-medium transition-colors">Ordem: {sortOrder === 'desc' ? 'decrescente' : 'crescente'}</button>
        </div>
      </div>
      {error ? <ErrorState title="Erro ao carregar recompra por produto" message="Não foi possível consultar o ranking neste recorte." onRetry={() => refetch()} /> : isLoading ? <div role="status" aria-label="Carregando recompra por produto"><Skeleton className="h-80 w-full rounded-2xl" /></div> : !rows.length ? <EmptyState title="Nenhum produto encontrado" message="Ajuste o período, os filtros ou a busca para consultar outros produtos." action={<button type="button" className="text-primary font-semibold text-xs underline" onClick={() => { setSearch(''); setTerm(''); refetch(); }}>Atualizar ranking</button>} /> : <>
        <p className="text-xs text-text-muted" aria-live="polite">{isFetching ? 'Atualizando ranking…' : `${formatNumber(pagination?.total_items)} produtos localizados. Taxas sem clientes elegíveis são exibidas como indisponíveis.`}</p>
        <HorizontalScroll label="Ranking de recompra por produto" className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <table className="w-full min-w-[900px] text-xs text-left"><caption className="sr-only">Recompra do mesmo produto por clientes únicos em datas distintas</caption><thead className="bg-action text-white font-display uppercase tracking-wider"><tr><th className={cell} scope="col">Produto</th><th className={`${cell} text-right`} scope="col">Clientes compradores</th><th className={`${cell} text-right`} scope="col">Elegíveis</th><th className={`${cell} text-right`} scope="col">Recentes excluídos</th><th className={`${cell} text-right`} scope="col">Recompraram</th><th className={`${cell} text-right`} scope="col">Taxa de recompra</th><th className={`${cell} text-right`} scope="col">Observação mín. / máx.</th></tr></thead>
            <tbody className="divide-y divide-border bg-surface">{rows.map(row => {
              const title = row.product_name || row.descriptions[0] || (row.descriptions.length ? row.descriptions.join(' / ') : row.product_id);
              const codesText = row.codes && row.codes.length > 0
                ? row.codes.join(', ')
                : (row.product_id !== title ? row.product_id : '');
              const filterVal = row.product_id;
              const isSelected = filters.product === filterVal || (row.codes && row.codes.includes(filters.product || ''));
              const isExpanded = expandedProducts.has(row.product_id);
              return (
                <Fragment key={row.product_id}>
                  <tr className={isSelected ? 'bg-tint' : 'hover:bg-surface-hover/60'}>
                    <td className={cell}>
                      <div className="flex items-start gap-2">
                        {groupBy === 'product' && (
                          <button
                            type="button"
                            aria-label={isExpanded ? `Recolher códigos de ${title}` : `Expandir códigos de ${title}`}
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(row.product_id)}
                            className="p-1 -ml-1 text-primary hover:bg-tint rounded transition-colors flex-shrink-0"
                            title={isExpanded ? "Recolher detalhamento" : "Expandir códigos deste produto"}
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                            />
                          </button>
                        )}
                        {groupBy === 'product_id' && (
                          <button
                            type="button"
                            aria-label={isExpanded ? `Recolher notas de ${row.product_id}` : `Expandir notas de ${row.product_id}`}
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(row.product_id)}
                            className="p-1 -ml-1 text-primary hover:bg-tint rounded transition-colors flex-shrink-0"
                            title={isExpanded ? "Recolher notas fiscais" : "Ver notas fiscais deste código"}
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                            />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            aria-label={`${row.descriptions.join(' / ') || title || 'Produto'} ${row.product_id}`}
                            aria-pressed={isSelected}
                            onClick={() => toggleFilter('product', filterVal)}
                            className="text-left text-primary hover:underline focus-visible:outline focus-visible:outline-primary rounded block"
                          >
                            <strong className="block text-xs">{title || 'Produto sem descrição'}</strong>
                          </button>
                          {groupBy === 'product' && (
                            <span className="text-xs text-text-muted block mt-0.5">
                              {row.code_details?.length ?? row.codes?.length ?? 0} código(s) associado(s)
                            </span>
                          )}
                          {groupBy === 'product_id' && codesText && (
                            <span className="font-mono text-xs text-text-muted block">
                              Cód: {codesText}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`${cell} text-right text-text-primary`}>{formatNumber(row.customers)}</td>
                    <td className={`${cell} text-right text-text-primary`}>{formatNumber(row.eligible_customers)}</td>
                    <td className={`${cell} text-right text-text-secondary font-medium`}>{formatNumber(row.excluded_recent_customers)}</td>
                    <td className={`${cell} text-right text-text-primary`}>{formatNumber(row.repurchased_customers)}</td>
                    <td className={`${cell} text-right text-primary font-bold`}>{formatPercent(row.repurchase_rate_pct)}</td>
                    <td className={`${cell} text-right text-text-secondary whitespace-nowrap`}>{formatNumber(row.minimum_observation_days)} / {formatNumber(row.maximum_observation_days)} dias</td>
                  </tr>
                  {groupBy === 'product_id' && isExpanded && (
                    <tr className="bg-surface-elevated border-t border-b border-border">
                      <td colSpan={7} className="p-3 pl-8">
                        <CodeInvoicesSubtable code={row.product_id} codeDesc={title} filters={filters} />
                      </td>
                    </tr>
                  )}
                  {groupBy === 'product' && isExpanded && (
                    <tr className="bg-surface-elevated border-t border-b border-border">
                      <td colSpan={7} className="p-3 pl-8">
                        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
                          <div className="px-3.5 py-2.5 bg-tint border-b border-border text-xs font-display font-semibold text-primary flex flex-wrap justify-between items-center gap-2">
                            <span>Detalhamento por código do produto ({row.code_details?.length ?? 0} códigos)</span>
                            <span className="text-xs text-text-secondary font-sans font-normal">Recompra por clientes únicos · clique na seta do código para ver notas fiscais</span>
                          </div>
                          <table className="w-full text-xs text-left">
                            <thead className="bg-navy-mid text-white font-display text-xs uppercase tracking-wider">
                              <tr>
                                <th className="py-2.5 px-3">Código</th>
                                <th className="py-2.5 px-3">Descrição do item</th>
                                <th className="py-2.5 px-3 text-right">Clientes compradores</th>
                                <th className="py-2.5 px-3 text-right">Elegíveis</th>
                                <th className="py-2.5 px-3 text-right">Recompraram</th>
                                <th className="py-2.5 px-3 text-right">Taxa de recompra</th>
                                <th className="py-2.5 px-3 text-right">Obs. mín / máx</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {row.code_details && row.code_details.length > 0 ? (
                                row.code_details.map(cd => {
                                  const isCodeExpanded = expandedCodes.has(cd.code);
                                  return (
                                    <Fragment key={cd.code}>
                                      <tr className={`hover:bg-surface-hover/50 ${isCodeExpanded ? 'bg-tint' : ''}`}>
                                        <td className="py-2.5 px-3 font-mono font-semibold text-text-primary text-xs">
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              aria-label={isCodeExpanded ? `Recolher notas do código ${cd.code}` : `Expandir notas do código ${cd.code}`}
                                              aria-expanded={isCodeExpanded}
                                              onClick={() => toggleExpandCode(cd.code)}
                                              className="p-1 -ml-1 text-primary hover:bg-surface-hover rounded transition-colors"
                                              title={isCodeExpanded ? "Recolher notas fiscais" : "Ver notas fiscais (cliente real, faturamento, MB e MB%)"}
                                            >
                                              <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-200 ${isCodeExpanded ? 'rotate-0' : '-rotate-90'}`}
                                              />
                                            </button>
                                            <span>{cd.code}</span>
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-3 text-text-secondary text-xs max-w-xs truncate" title={cd.description}>{cd.description}</td>
                                        <td className="py-2.5 px-3 text-right text-text-primary">{formatNumber(cd.customers)}</td>
                                        <td className="py-2.5 px-3 text-right text-text-primary">{formatNumber(cd.eligible_customers)}</td>
                                        <td className="py-2.5 px-3 text-right text-text-primary">{formatNumber(cd.repurchased_customers)}</td>
                                        <td className="py-2.5 px-3 text-right font-semibold text-primary">{formatPercent(cd.repurchase_rate_pct)}</td>
                                        <td className="py-2.5 px-3 text-right text-text-muted text-xs whitespace-nowrap">
                                          {formatNumber(cd.minimum_observation_days)} / {formatNumber(cd.maximum_observation_days)} dias
                                        </td>
                                      </tr>
                                      {isCodeExpanded && (
                                        <tr className="bg-surface-elevated border-t border-b border-border">
                                          <td colSpan={7} className="p-3 pl-6">
                                            <CodeInvoicesSubtable code={cd.code} codeDesc={cd.description} filters={filters} />
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={7} className="py-3 px-3 text-center text-text-muted">
                                    Nenhum código detalhado disponível para este produto.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        </HorizontalScroll>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted"><span>Página {page} de {pagination?.total_pages || 1}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || isFetching} className="rounded-lg border border-border bg-surface px-3 py-2 text-text-primary font-medium disabled:opacity-40" onClick={() => setPageState({ key: selectionKey, page: page - 1 })}>Ranking anterior</button><button type="button" disabled={page >= (pagination?.total_pages || 1) || isFetching} className="rounded-lg border border-border bg-surface px-3 py-2 text-text-primary font-medium disabled:opacity-40" onClick={() => setPageState({ key: selectionKey, page: page + 1 })}>Próximo ranking</button></div></div>
      </>}
    </div>
  );
}
