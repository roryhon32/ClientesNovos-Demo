import { useEffect, useState } from 'react';
import { useCustomerItems } from '../../api/queries';
import { QueryFilters } from '../../api/types';
import { HorizontalScroll } from '../common/HorizontalScroll';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../../hooks/useFormatters';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/LoadingSkeleton';

export function CustomerItemsPanel({ customerId, filters = {} }: { customerId: string; filters?: QueryFilters }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pageState, setPage] = useState({ key: '', page: 1 });
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const queryKey = JSON.stringify([customerId, term, start, end, filters]);
  const page = pageState.key === queryKey ? pageState.page : 1;
  const effectiveStart = start || filters.start_date || '';
  const effectiveEnd = end || filters.end_date || '';
  const invalidPeriod = Boolean(effectiveStart && effectiveEnd && effectiveStart > effectiveEnd);
  const { data, isLoading, isFetching, error, refetch } = useCustomerItems(customerId, {
    ...filters, business_unit: filters.business_unit || undefined, page, page_size: 15, search: term || undefined,
    // Um intervalo invertido permanece local para não disparar consulta inválida.
    start_date: !invalidPeriod && effectiveStart ? effectiveStart : undefined,
    end_date: !invalidPeriod && effectiveEnd ? effectiveEnd : undefined,
  }, !invalidPeriod);
  const rows = data?.data.items ?? [];
  const pagination = data?.data.pagination;
  const setCurrentPage = (next: number) => setPage({ key: queryKey, page: next });

  return <section aria-label="Produtos e notas do cliente" className="space-y-4">
    <div>
      <h3 className="font-display font-semibold text-text-primary text-base">Produtos e notas fiscais</h3>
      <p className="text-xs text-text-muted mt-1">Uma linha por item de nota. Devoluções permanecem no financeiro e não contam como compra válida. Histórico até {formatDate(data?.meta?.reference_date)}.</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-xs text-text-secondary font-medium">Buscar produto ou nota
        <input value={search} onChange={e => setSearch(e.target.value)} maxLength={100} placeholder="Código, descrição ou número da nota" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary" />
      </label>
      <label className="text-xs text-text-secondary font-medium">Emissão de
        <input type="date" value={effectiveStart} onChange={e => setStart(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]" />
      </label>
      <label className="text-xs text-text-secondary font-medium">Emissão até
        <input type="date" value={effectiveEnd} onChange={e => setEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]" />
      </label>
    </div>
    {invalidPeriod ? <p role="alert" className="text-warning text-sm font-medium">A data inicial deve ser anterior ou igual à data final.</p> : error ?
      <ErrorState title="Erro ao carregar produtos e notas" message="Não foi possível consultar os itens deste cliente." onRetry={() => refetch()} /> : isLoading ?
      <div role="status" aria-label="Carregando itens"><Skeleton className="h-48 w-full" /></div> : rows.length === 0 ?
      <EmptyState title="Nenhum item encontrado" message="Ajuste a busca ou o período de emissão para consultar outros itens deste cliente." /> : <>
      <div className="flex justify-between text-xs text-text-muted" aria-live="polite">
        <span>{formatNumber(pagination?.total_items)} itens localizados</span>
        <span>{isFetching ? 'Atualizando itens…' : 'Valores originais do faturamento'}</span>
      </div>
      <HorizontalScroll label="Produtos e notas fiscais" className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <caption className="sr-only">Itens das notas fiscais do cliente {customerId}</caption>
          <thead className="bg-action text-white font-display"><tr>
            <th scope="col" className="p-3">Produto / família</th><th scope="col" className="p-3">Nota / emissão</th>
            <th scope="col" className="p-3">BU / vendedor</th><th scope="col" className="p-3 text-right">Qtd. faturada</th>
            <th scope="col" className="p-3 text-right">Qtd. devolvida</th><th scope="col" className="p-3">Compra válida</th>
            <th scope="col" className="p-3 text-right">Qtd. líquida</th><th scope="col" className="p-3 text-right">Fat. líquido</th>
            <th scope="col" className="p-3 text-right">MB%</th><th scope="col" className="p-3">Detalhes</th>
          </tr></thead>
          <tbody className="divide-y divide-border">{rows.map(row => <tr key={row.identificador_item} className="align-top hover:bg-surface-hover/50">
            <td className="p-3"><strong className="text-text-primary block">{row.descricao_produto || 'Produto sem descrição'}</strong><span className="font-mono text-primary font-semibold">{row.codigo_produto || '—'}</span><span className="block text-text-muted mt-1">{row.familia || 'Família não informada'}{row.subfamilia ? ` · ${row.subfamilia}` : ''}</span></td>
            <td className="p-3 whitespace-nowrap text-text-primary">{row.document_number || 'Nota não informada'}<span className="block text-text-muted">{formatDate(row.data_emissao)}</span><span className="block text-text-muted">Filial {row.branch || '—'} · Item {row.item || '—'}</span></td>
            <td className="p-3 text-text-primary">{row.business_unit || 'BU não informada'}<span className="block text-text-muted mt-1">{row.vendedor || 'Vendedor não informado'}</span></td>
            <td className="p-3 text-right font-mono text-text-primary">{formatNumber(row.quantidade_faturada)}</td>
            <td className="p-3 text-right font-mono text-text-primary">{formatNumber(row.quantidade_devolvida)}</td>
            <td className={`p-3 font-semibold whitespace-nowrap ${row.compra_valida ? 'text-primary' : 'text-text-muted'}`}>{row.compra_valida ? 'Sim' : 'Não'}</td>
            <td className="p-3 text-right font-mono text-text-primary">{formatNumber(row.quantidade_liquida)}</td>
            <td className="p-3 text-right font-mono whitespace-nowrap text-text-primary font-medium">{formatCurrency(row.faturamento_liquido)}</td>
            <td className={`p-3 text-right font-mono font-medium ${(row.margem_bruta_percentual ?? 0) < 0 ? 'text-negative' : 'text-text-primary'}`}>{formatPercent(row.margem_bruta_percentual)}</td>
            <td className="p-3"><details><summary className="cursor-pointer font-semibold text-primary whitespace-nowrap hover:underline">Ver detalhes</summary>
              <dl className="mt-2 space-y-1 min-w-44 text-text-secondary">
                <dt className="text-text-muted">Cliente REAL</dt><dd className="text-text-primary font-medium">{row.cliente_real || 'Não informado'}</dd>
                <dt className="text-text-muted">Nome Cliente</dt><dd className="text-text-primary">{row.nome_cliente || 'Não informado'}</dd>
                <dt className="text-text-muted">Empresa / cliente</dt><dd className="text-text-primary">{row.company || '—'} / {row.customer_code || '—'}</dd>
                <dt className="text-text-muted">Canal / localidade</dt><dd className="text-text-primary">{row.canal_venda || '—'} · {row.municipio || '—'} / {row.estado || '—'}</dd>
                <dt className="text-text-muted">Fat. contábil</dt><dd className="font-mono">{formatCurrency(row.faturamento_contabil)}</dd>
                <dt className="text-text-muted">Impostos</dt><dd className="font-mono">{formatCurrency(row.impostos)}</dd>
                <dt className="text-text-muted">Margem Bruta (R$)</dt><dd className="font-mono">{formatCurrency(row.margem_bruta_valor)}</dd>
                <dt className="text-text-muted">Status da transação</dt><dd>{row.status_origem || '—'}</dd>
                <dt className="text-text-muted">Origem</dt><dd>{row.origem_transacao || '—'}</dd>
              </dl>
            </details></td>
          </tr>)}</tbody>
        </table>
      </HorizontalScroll>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Página {page} de {pagination?.total_pages || 1}</span>
        <div className="flex gap-2"><button type="button" disabled={page <= 1 || isFetching} onClick={() => setCurrentPage(page - 1)} className="border border-border bg-surface rounded-lg px-3 py-2 text-text-primary disabled:opacity-40">Itens anteriores</button>
          <button type="button" disabled={page >= (pagination?.total_pages || 1) || isFetching} onClick={() => setCurrentPage(page + 1)} className="border border-border bg-surface rounded-lg px-3 py-2 text-text-primary disabled:opacity-40">Próximos itens</button></div>
      </div>
    </>}
  </section>;
}
