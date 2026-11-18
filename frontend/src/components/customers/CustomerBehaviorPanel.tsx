import { useState } from 'react';
import { useCustomerBehavior } from '../../api/behavior';
import type { ProductBehavior } from '../../api/behavior';
import type { QueryFilters } from '../../api/types';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../../hooks/useFormatters';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/LoadingSkeleton';
import { HorizontalScroll } from '../common/HorizontalScroll';

const cell = 'px-3 py-2.5';
const heading = 'text-sm font-display font-semibold text-text-primary';
const description = 'text-xs text-text-muted leading-relaxed';
const tableClass = 'w-full min-w-[680px] text-xs text-left text-text-secondary bg-surface';
const yesNo = (value: boolean) => value ? 'Sim' : 'Não';
const interval = (value: number | null) => value === null ? 'Sem intervalo observado' : `${formatNumber(Math.round(value * 10) / 10)} dias`;

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 rounded-xl border border-border bg-surface p-3 shadow-sm">
    <p className="text-xs font-display font-semibold uppercase text-text-muted">{label}</p>
    <p className="text-sm text-text-primary font-bold mt-1 break-words">{value}</p>
    {note && <p className="text-xs text-text-muted mt-1">{note}</p>}
  </div>;
}

function ProductLeaders({ title, rows, measure }: { title: string; rows: ProductBehavior[]; measure: 'quantity' | 'revenue' }) {
  return <div className="rounded-xl border border-border bg-surface p-4 space-y-3 min-w-0 shadow-sm">
    <h4 className={heading}>{title}</h4>
    {rows.length ? <ul className="space-y-3">{rows.map(row => <li key={row.product_id ?? 'unknown'} className="flex justify-between gap-3 text-xs">
      <div className="min-w-0"><strong className="block text-text-primary break-words">{row.descriptions.join(' / ') || 'Produto sem descrição'}</strong><span className="text-text-muted">{row.product_id || 'Sem código'} · {row.business_units.join(', ') || 'BU não informada'}</span></div>
      <span className="text-primary font-mono font-semibold shrink-0">{measure === 'quantity' ? formatNumber(row.quantity) : formatCurrency(row.faturamento_liquido)}</span>
    </li>)}</ul> : <p className={description}>Nenhum produto no recorte.</p>}
  </div>;
}

function ProductFrequency({ products }: { products: ProductBehavior[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = search.toLocaleLowerCase('pt-BR').trim();
  const matches = products.filter(row => `${row.product_id} ${row.descriptions.join(' ')} ${row.business_units.join(' ')}`.toLocaleLowerCase('pt-BR').includes(term));
  const pages = Math.max(1, Math.ceil(matches.length / 15));
  const currentPage = Math.min(page, pages);
  return <section className="space-y-3" aria-label="Frequência por produto">
    <div><h4 className={heading}>Frequência por produto</h4><p className={description}>Compras por documentos distintos. Recompra do mesmo produto e intervalos consideram datas de emissão distintas; itens da mesma nota são agrupados.</p></div>
    <label className="text-xs text-text-secondary font-medium block">Buscar no mix do cliente<input value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary" placeholder="Produto, descrição ou BU" /></label>
    {!matches.length ? <EmptyState title="Nenhum produto encontrado" message="Ajuste a busca no mix deste cliente." action={<button type="button" onClick={() => setSearch('')} className="text-primary font-semibold text-xs underline">Limpar busca</button>} /> : <>
      <HorizontalScroll label="Frequência de compras por produto" className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className={tableClass}><thead className="bg-action text-white font-display"><tr>
          <th className={cell} scope="col">Produto / BU</th><th className={cell} scope="col">Compras (notas)</th><th className={cell} scope="col">Datas distintas</th><th className={cell} scope="col">Intervalo médio</th><th className={cell} scope="col">Recompra</th><th className={cell} scope="col">Quantidade</th><th className={cell} scope="col">Fat. líquido</th><th className={cell} scope="col">Primeira / última no recorte</th>
        </tr></thead><tbody className="divide-y divide-border">{matches.slice((currentPage - 1) * 15, currentPage * 15).map(row => <tr key={row.product_id ?? 'unknown'} className="hover:bg-surface-hover/50">
          <td className={cell}><strong className="block text-text-primary">{row.descriptions.join(' / ') || 'Produto sem descrição'}</strong><span>{row.product_id || 'Sem código'}</span><span className="block text-text-muted">{row.business_units.join(', ') || 'BU não informada'}</span></td>
          <td className={cell}>{formatNumber(row.documents)}</td><td className={cell}>{formatNumber(row.occasions)}</td><td className={`${cell} whitespace-nowrap`}>{interval(row.mean_days_between_purchases)}</td><td className={cell}>{yesNo(row.repurchased)}</td><td className={cell}>{formatNumber(row.quantity)}</td><td className={`${cell} whitespace-nowrap font-medium text-text-primary`}>{formatCurrency(row.faturamento_liquido)}</td><td className={`${cell} whitespace-nowrap`}>{formatDate(row.first_purchase)}<span className="block">{formatDate(row.last_purchase)}</span></td>
        </tr>)}</tbody></table>
      </HorizontalScroll>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-text-muted"><span>{formatNumber(matches.length)} produtos · Página {currentPage} de {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage <= 1} className="border border-border bg-surface rounded-lg px-3 py-2 text-text-primary disabled:opacity-40" onClick={() => setPage(currentPage - 1)}>Produtos anteriores</button><button type="button" disabled={currentPage >= pages} className="border border-border bg-surface rounded-lg px-3 py-2 text-text-primary disabled:opacity-40" onClick={() => setPage(currentPage + 1)}>Próximos produtos</button></div></div>
    </>}
  </section>;
}

export function CustomerBehaviorPanel({ customerId, filters = {} }: { customerId: string; filters?: QueryFilters }) {
  const { data, isLoading, isFetching, error, refetch } = useCustomerBehavior(customerId, filters);
  if (isLoading) return <div role="status" aria-label="Carregando comportamento de compra" className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <ErrorState title="Erro ao carregar comportamento de compra" message="Não foi possível consultar as compras deste cliente no recorte selecionado." onRetry={() => refetch()} />;
  const behavior = data?.data;
  if (!behavior) return <EmptyState title="Nenhuma compra válida no recorte" message="Altere os filtros globais ou o período para consultar o comportamento deste cliente." action={<button type="button" onClick={() => refetch()} className="text-primary font-semibold text-xs underline">Atualizar análise</button>} />;
  const { summary, mix } = behavior;
  if (summary.valid_documents === 0) return <section className="space-y-4" aria-label="Movimentos financeiros sem compras válidas">
    <EmptyState title="Nenhuma compra válida no recorte" message="Os movimentos financeiros deste recorte continuam preservados abaixo. Devoluções e outros movimentos sem compra válida não são contados como novas compras." action={<button type="button" onClick={() => refetch()} className="text-primary font-semibold text-xs underline">Atualizar análise</button>} />
    <h3 className={heading}>Movimentos financeiros no recorte</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Metric label="Faturamento contábil" value={formatCurrency(summary.faturamento_contabil)} />
      <Metric label="Faturamento líquido" value={formatCurrency(summary.faturamento_liquido)} />
      <Metric label="Impostos" value={formatCurrency(summary.impostos)} />
      <Metric label="Margem bruta" value={formatCurrency(summary.margem_bruta_valor)} />
    </div>
  </section>;
  const productName = (id: string) => {
    const product = behavior.products.find(row => row.product_id === id);
    return product?.descriptions.length ? `${id} · ${product.descriptions.join(' / ')}` : id;
  };
  return <section aria-label="Comportamento de compra do cliente" className="space-y-6 min-w-0">
    <div><h3 className="font-display font-semibold text-text-primary text-base">Comportamento de compra</h3><p className={description}>Compras válidas no período e filtros selecionados. Aquisição abaixo preserva a primeira data de todo o histórico. Referência: {formatDate(data?.meta.reference_date)}.</p>{isFetching && <p role="status" className="text-xs text-primary mt-1 font-medium">Atualizando análise…</p>}</div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Metric label="BU predominante em faturamento líquido" value={summary.predominant_business_units.map(bu => bu || 'BU não informada').join(' / ') || 'Não definida'} note="Todos os empates são preservados." />
      <Metric label="Compras válidas" value={formatNumber(summary.valid_documents)} note={`${formatNumber(summary.occasions)} documentos distintos`} />
      <Metric label="Intervalo médio entre compras" value={interval(summary.mean_days_between_purchases)} note="Por documentos; notas na mesma data geram intervalo zero." />
    </div>
    <section className="space-y-3" aria-label="Modalidades de recompra"><h4 className={heading}>Modalidades de recompra no recorte</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Metric label="Recompra geral do cliente" value={yesNo(summary.general_repurchase)} note="Pelo menos dois documentos válidos." /><Metric label="Recompra na mesma BU" value={yesNo(summary.same_bu_repurchase)} note="Pelo menos dois documentos na mesma BU." /><Metric label="Recompra do mesmo produto" value={yesNo(summary.same_product_repurchase)} note="Mesmo produto em pelo menos duas datas distintas." /></div>
    </section>
    <section className="space-y-3"><h4 className={heading}>Distribuição por BU</h4><p className={description}>Participação no faturamento líquido do recorte. Valores financeiros incluem os movimentos originais; documentos de compra excluem devoluções e cancelamentos.</p>
      <HorizontalScroll label="Distribuição das compras por BU" className="rounded-xl border border-border bg-surface overflow-hidden"><table className={tableClass}><thead className="bg-action text-white font-display"><tr><th className={cell} scope="col">BU</th><th className={cell} scope="col">Fat. líquido</th><th className={cell} scope="col">Participação</th><th className={cell} scope="col">Compras (notas)</th><th className={cell} scope="col">Mesma BU: recompra</th><th className={cell} scope="col">Margem bruta</th></tr></thead><tbody className="divide-y divide-border">{behavior.business_units.map(row => <tr key={row.business_unit ?? 'unknown'} className="hover:bg-surface-hover/50"><td className={`${cell} font-semibold text-text-primary`}>{row.business_unit || 'BU não informada'}</td><td className={`${cell} whitespace-nowrap font-medium text-text-primary`}>{formatCurrency(row.faturamento_liquido)}</td><td className={cell}>{formatPercent(row.net_share_pct)}</td><td className={cell}>{formatNumber(row.documents)}</td><td className={cell}>{yesNo(row.repurchased)}</td><td className={cell}>{formatCurrency(row.margem_bruta_valor)}</td></tr>)}</tbody></table></HorizontalScroll>
      <details className="rounded-xl border border-border bg-surface p-3"><summary className="cursor-pointer text-xs font-semibold text-primary">Ver evolução mensal por BU</summary><HorizontalScroll label="Evolução mensal de compras por BU" className="mt-3 rounded-xl border border-border overflow-hidden"><table className={tableClass}><thead className="bg-action text-white font-display"><tr><th className={cell} scope="col">Mês</th><th className={cell} scope="col">BU</th><th className={cell} scope="col">Compras (notas)</th><th className={cell} scope="col">Fat. líquido</th><th className={cell} scope="col">Margem bruta</th></tr></thead><tbody className="divide-y divide-border">{behavior.monthly_business_units.map(row => <tr key={`${row.month}-${row.business_unit}`} className="hover:bg-surface-hover/50"><td className={cell}>{formatDate(row.month, 'month-year')}</td><td className={cell}>{row.business_unit || 'BU não informada'}</td><td className={cell}>{formatNumber(row.documents)}</td><td className={cell}>{formatCurrency(row.faturamento_liquido)}</td><td className={cell}>{formatCurrency(row.margem_bruta_valor)}</td></tr>)}</tbody></table></HorizontalScroll></details>
    </section>
    <section className="space-y-3"><h4 className={heading}>Primeiros produtos adquiridos</h4><p className={description}>Todos os produtos e BUs da primeira data de compra do histórico, incluindo notas simultâneas. Esta seção preserva a aquisição mesmo quando ela antecede o período selecionado.</p><ul className="divide-y divide-border rounded-xl border border-border bg-surface">{behavior.first_products.map(row => <li key={`${row.product_id}-${row.date}`} className="p-3 text-xs"><strong className="text-text-primary">{row.descriptions.join(' / ') || 'Produto sem descrição'}</strong><p className="text-text-secondary mt-1">{row.product_id || 'Sem código'} · {formatDate(row.date)} · {row.business_units.join(', ') || 'BU não informada'} · {formatNumber(row.documents)} nota(s)</p></li>)}</ul></section>
    <div><p className={`${description} mb-3`}>Quantidade líquida dos itens de compras válidas. Os valores financeiros preservam também os movimentos originais de devolução.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><ProductLeaders title="Mais comprado em quantidade" rows={behavior.top_products_quantity} measure="quantity" /><ProductLeaders title="Mais comprado em valor líquido" rows={behavior.top_products_revenue} measure="revenue" /></div></div>
    <ProductFrequency key={JSON.stringify(filters)} products={behavior.products} />
    <section className="space-y-3" aria-label="Evolução do mix"><h4 className={heading}>Evolução do mix</h4><p className={description}>Atual: {formatDate(mix.current_start)} a {formatDate(mix.current_end)}. Anterior: {formatDate(mix.previous_start)} a {formatDate(mix.previous_end)}.</p>{!mix.previous_period_complete && <p className="text-xs text-warning font-medium">O histórico disponível não cobre todo o período anterior; a comparação é parcial.</p>}
      <div className="grid grid-cols-2 gap-3"><Metric label="Produtos no período atual / anterior" value={`${formatNumber(mix.current_products)} / ${formatNumber(mix.previous_products)}`} /><Metric label="Concentração no maior produto" value={`${formatPercent(mix.current_top_product_share_pct)} / ${formatPercent(mix.previous_top_product_share_pct)}`} note="Atual / anterior · participação no faturamento líquido de compras válidas." /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[
        { title: 'Novos no histórico do cliente', rows: mix.new_in_period },
        { title: 'Voltaram ao mix', rows: mix.resumed_products ?? [] },
        { title: 'Presentes nos dois períodos', rows: mix.retained_products },
        { title: 'Sem compra no período atual', rows: mix.not_observed_in_period },
      ].map(group => <div key={group.title} className="rounded-xl border border-border bg-surface p-3 min-w-0 shadow-sm"><h5 className="text-xs font-display font-semibold text-text-primary">{group.title} ({group.rows.length})</h5><ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs text-text-muted">{group.rows.length ? group.rows.map(id => <li key={id} className="break-words">{productName(id)}</li>) : <li>Nenhum produto</li>}</ul></div>)}</div><p className={description}>Ausência no período atual é uma observação da janela comparada e não determina abandono. Clientes com compras recentes podem ter pouco tempo de observação para recomprar.</p>
    </section>
  </section>;
}
