import React, { useEffect, useRef, useState } from 'react';
import { useCustomerDetail, useCustomerPublicCnpj } from '../../api/queries';
import { CustomerItemsPanel } from './CustomerItemsPanel';
import { CustomerBehaviorPanel } from './CustomerBehaviorPanel';
import { QueryFilters } from '../../api/types';
import { HorizontalScroll } from '../common/HorizontalScroll';
import { formatDate, formatCurrency, formatPercent, formatNumber } from '../../hooks/useFormatters';
import { X, CheckCircle2, Building2, RefreshCw } from 'lucide-react';
import { Skeleton } from '../common/LoadingSkeleton';
import { ErrorState } from '../common/ErrorState';

interface CustomerDetailDrawerProps {
  customerId: string | null;
  onClose: () => void;
  filters?: QueryFilters;
}

export const CustomerDetailDrawer: React.FC<CustomerDetailDrawerProps> = ({
  customerId,
  onClose,
  filters = {},
}) => {
  const { data: detailData, isLoading, error, refetch } = useCustomerDetail(customerId, filters);
  const [tab, setTab] = useState<'summary' | 'items' | 'behavior'>('summary');
  const [publicCnpjEnabled, setPublicCnpjEnabled] = useState(false);
  const [publicCnpjRefresh, setPublicCnpjRefresh] = useState(false);
  const {
    data: publicCnpjData,
    isLoading: publicCnpjLoading,
    isFetching: publicCnpjFetching,
    error: publicCnpjError,
    refetch: refetchPublicCnpj,
  } = useCustomerPublicCnpj(customerId, publicCnpjEnabled, publicCnpjRefresh);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    setTab('summary');
    setPublicCnpjEnabled(false);
    setPublicCnpjRefresh(false);
    if (!customerId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [customerId]);

  if (!customerId) return null;

  const detail = detailData?.data;
  const customer = detail?.customer;
  const indicators = detail?.purchase_indicators;
  const profile = detail?.commercial_profile;
  const history = detail?.monthly_history || [];
  const ticketMedioLiquido =
    customer && customer.documentos_distintos > 0 && customer.faturamento_liquido != null
      ? customer.faturamento_liquido / customer.documentos_distintos
      : null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#050e1c]/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex sm:pl-10">
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" className="w-screen max-w-5xl h-full bg-surface border-l border-border shadow-2xl flex flex-col min-h-0">
          {/* Header (Dark Blue Institutional Top Banner) */}
          <div className="p-6 border-b border-primary/20 bg-gradient-to-r from-[#0a1f3d] to-[#123063] dark:from-[#081731] dark:to-[#123063] text-white shrink-0 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-xs font-display font-semibold uppercase tracking-wider text-accent">
                  Dossiê Analítico do Cliente
                </span>
              </div>
              <span className="text-xs text-[#c7d5eb]">Cliente REAL:</span>
              <h2 id="customer-detail-title" className="text-xl font-display font-bold text-white tracking-tight">
                {customer?.real_customer_names?.join(' / ') || `Cliente ${customerId}`}
              </h2>
              <p className="text-xs text-[#dce7f7] mt-1">Nome Cliente: {customer?.customer_names?.join(' / ') || customer?.name || 'Não informado'}</p>
              <p className="text-xs text-[#b3c6e4] font-mono mt-0.5">
                Raiz CNPJ: {customerId}
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors"
              aria-label="Fechar gaveta"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-3 border-b border-border bg-surface-elevated shrink-0 flex gap-2 flex-wrap" aria-label="Seções do cliente">
            <button type="button" aria-pressed={tab === 'summary'} onClick={() => setTab('summary')} className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${tab === 'summary' ? 'border-action bg-action dark:border-cyan/50 text-white font-semibold' : 'border-border bg-surface text-text-secondary hover:border-primary/40'}`}>Resumo e histórico</button>
            <button type="button" aria-pressed={tab === 'items'} onClick={() => setTab('items')} className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${tab === 'items' ? 'border-action bg-action dark:border-cyan/50 text-white font-semibold' : 'border-border bg-surface text-text-secondary hover:border-primary/40'}`}>Produtos e notas</button>
            <button type="button" aria-pressed={tab === 'behavior'} onClick={() => setTab('behavior')} className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${tab === 'behavior' ? 'border-action bg-action dark:border-cyan/50 text-white font-semibold' : 'border-border bg-surface text-text-secondary hover:border-primary/40'}`}>Comportamento de compra</button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0 bg-background/40">
            {tab === 'behavior' ? <CustomerBehaviorPanel key={customerId} customerId={customerId} filters={filters} /> : tab === 'items' ? <CustomerItemsPanel key={customerId} customerId={customerId} filters={filters} /> : isLoading ? (
              <div className="space-y-4">
                <Skeleton className="w-full h-24 rounded-2xl" />
                <Skeleton className="w-full h-32 rounded-2xl" />
                <Skeleton className="w-full h-48 rounded-2xl" />
              </div>
            ) : error || !customer ? (
              <ErrorState title="Erro ao carregar o cliente" message="Não foi possível carregar os detalhes do cliente." onRetry={() => refetch()} />
            ) : (
              <>
                <p className="text-xs text-text-muted">Resumo oficial de todo o histórico do cliente até a data de referência. As abas Produtos e notas e Comportamento de compra aplicam o período e os filtros da página.</p>
                {/* Status & Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Status Atual
                    </span>
                    {(() => {
                      const isOnePurchase = (customer.valid_purchases ?? 0) <= 1;
                      const displayStatus = customer.status;
                      const statusColor =
                        displayStatus === 'NOVO'
                          ? 'text-primary'
                          : displayStatus === 'RECORRENTE'
                          ? 'text-positive'
                          : displayStatus === 'EM RISCO'
                          ? 'text-warning'
                          : displayStatus === 'INATIVO'
                          ? 'text-negative'
                          : 'text-text-muted';

                      const statusSub =
                        displayStatus === 'NOVO'
                          ? isOnePurchase
                            ? '1ª compra recente (sem recompra)'
                            : `${customer.valid_purchases} compras (fase inicial ≤ 5)`
                          : displayStatus === 'RECORRENTE'
                          ? `${customer.valid_purchases} compras (> 5 compras, < 180d)`
                          : displayStatus === 'EM RISCO'
                          ? '180 a 364 dias sem compras'
                          : displayStatus === 'INATIVO'
                          ? '≥ 365 dias sem compras'
                          : 'Sem compras válidas';

                      return (
                        <>
                          <span className={`text-xs font-bold block ${statusColor}`}>
                            {displayStatus}
                          </span>
                          <span className="text-xs text-text-muted block mt-0.5">
                            {statusSub}
                          </span>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Compras Válidas
                    </span>
                    <span className="text-sm font-display font-bold text-text-primary">
                      {formatNumber(customer.valid_purchases)}
                    </span>
                    <span className="text-xs text-text-muted block mt-0.5">
                      {formatNumber(customer.documentos_distintos)} notas distintas
                    </span>
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Fat. Líquido
                    </span>
                    <span className="text-sm font-display font-bold text-primary">
                      {formatCurrency(customer.faturamento_liquido)}
                    </span>
                    <span className="text-xs text-text-muted block mt-0.5">
                      Contábil: {formatCurrency(customer.faturamento_contabil)}
                    </span>
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Margem Bruta %
                    </span>
                    <span className={`text-sm font-display font-bold ${(customer.margem_bruta_percentual ?? 0) < 0 ? 'text-negative' : 'text-text-primary'}`}>
                      {formatPercent(customer.margem_bruta_percentual)}
                    </span>
                    <span className="text-xs text-text-muted block mt-0.5">
                      Valor: {formatCurrency(customer.margem_bruta_valor)}
                    </span>
                  </div>
                </div>

                {/* Secondary Financial & Cadence Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Ticket Médio Líq.
                    </span>
                    <span className="text-sm font-display font-bold text-text-primary">
                      {formatCurrency(ticketMedioLiquido)}
                    </span>
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Impostos
                    </span>
                    <span className="text-sm font-display font-bold text-text-primary">
                      {formatCurrency(customer.impostos)}
                    </span>
                    <span className="text-xs text-text-muted block mt-0.5">
                      {formatPercent(customer.percentual_impostos)} sobre contábil
                    </span>
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Safra Aquisição
                    </span>
                    <span className="text-sm font-display font-bold text-text-primary">
                      {profile?.safra_aquisicao || (customer.first_purchase ? customer.first_purchase.slice(0, 7) : '—')}
                    </span>
                  </div>

                  <div className="bg-surface border border-border p-3.5 rounded-xl shadow-sm">
                    <span className="text-xs font-display font-semibold text-text-muted uppercase block mb-1">
                      Intervalo Médio
                    </span>
                    <span className="text-sm font-display font-bold text-text-primary">
                      {profile?.intervalo_medio_entre_compras != null
                        ? `${Math.round(profile.intervalo_medio_entre_compras)} dias`
                        : profile?.dias_ate_segunda_compra != null
                        ? `${profile.dias_ate_segunda_compra} dias (2ª)`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Commercial Channels, Location, Companies & Families */}
                {profile && (
                  <div className="bg-surface border border-border rounded-xl p-4 space-y-4 text-xs shadow-sm">
                    <h4 className="text-xs font-display font-semibold uppercase tracking-wider text-text-muted">
                      Canais de Venda, Localização e Atendimento
                    </h4>

                    {profile.channel_breakdown && profile.channel_breakdown.length > 0 && (
                      <div>
                        <span className="text-text-muted block mb-1.5">Canais de Venda (Histórico):</span>
                        <div className="flex flex-wrap gap-2">
                          {profile.channel_breakdown.map((ch) => (
                            <div
                              key={ch.channel}
                              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border"
                            >
                              <span className="font-semibold text-text-primary">{ch.channel}</span>
                              <span className="text-text-muted">·</span>
                              <span className="font-medium text-primary">{formatCurrency(ch.faturamento_liquido)}</span>
                              <span className="text-text-muted">({ch.documents} {ch.documents === 1 ? 'nota' : 'notas'})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/60">
                      <div>
                        <span className="text-text-muted block mb-0.5">Canal de Venda na Aquisição:</span>
                        <span className="font-medium text-text-primary">
                          {profile.acquisition_channels?.join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block mb-0.5">Empresas Faturadoras:</span>
                        <span className="font-medium text-text-primary">
                          {profile.companies?.join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block mb-0.5">Estados (UF):</span>
                        <span className="font-medium text-text-primary">
                          {profile.states?.join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block mb-0.5">Municípios:</span>
                        <span className="font-medium text-text-primary">
                          {profile.cities?.join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block mb-0.5">BUs com Compras (Histórico):</span>
                        <span className="font-medium text-text-primary">
                          {profile.business_units?.join(', ') || customer.acquisition_business_units?.join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block mb-0.5">Vendedores (Histórico):</span>
                        <span className="font-medium text-text-primary">
                          {profile.sellers?.join(', ') || customer.acquisition_sellers?.join(', ') || '—'}
                        </span>
                      </div>
                    </div>

                    {profile.families && profile.families.length > 0 && (
                      <div className="pt-2 border-t border-border/60">
                        <span className="text-text-muted block mb-1.5">Famílias de Produto:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.families.map((fam) => (
                            <span
                              key={fam}
                              className="px-2 py-0.5 rounded-md bg-tint border border-tint-border text-primary font-medium"
                            >
                              {fam}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Relational & Attribution Info */}
                <div className="bg-surface border border-border rounded-xl p-4 space-y-2.5 text-xs shadow-sm">
                  <div className="flex justify-between gap-4 py-1 border-b border-border/60">
                    <span className="text-text-muted shrink-0">Nome Cliente:</span>
                    <span className="font-medium text-text-primary text-right">{customer.customer_names?.join(' / ') || customer.name || 'Não informado'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-text-muted">Primeira Compra (Aquisição):</span>
                    <span className="font-medium text-text-primary">
                      {formatDate(customer.first_purchase)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-text-muted">Segunda Compra Observada:</span>
                    <span className="font-medium text-text-primary">
                      {formatDate(customer.second_purchase)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-text-muted">Última Compra Observada:</span>
                    <span className="font-medium text-text-primary">
                      {formatDate(customer.last_purchase)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-text-muted">Dias sem Compra (Recência):</span>
                    <span className="font-medium text-text-primary">
                      {customer.days_without_purchase !== null
                        ? `${customer.days_without_purchase} dias`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-text-muted">BUs de Aquisição:</span>
                    <span className="font-medium text-text-primary text-right">
                      {customer.acquisition_business_units?.join(', ') || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-text-muted">Vendedores de Aquisição:</span>
                    <span className="font-medium text-text-primary text-right">
                      {customer.acquisition_sellers?.join(', ') || '—'}
                    </span>
                  </div>
                </div>

                {/* On-demand Public CNPJ Registry Lookup (BrasilAPI + local cache) */}
                {(() => {
                  const publicProfile = publicCnpjData?.data;
                  const statusText = publicProfile?.situacao_cadastral?.toUpperCase() || '';
                  const statusTone = statusText.includes('ATIVA')
                    ? 'bg-positive/10 text-positive border-positive/30'
                    : statusText.includes('BAIXADA') || statusText.includes('INAPTA') || statusText.includes('NULA')
                    ? 'bg-negative/10 text-negative border-negative/30'
                    : 'bg-warning/10 text-warning border-warning/30';

                  return (
                    <div className="bg-surface border border-border rounded-xl p-4 space-y-3 text-xs shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-primary" />
                          <h4 className="text-xs font-display font-semibold uppercase tracking-wider text-text-muted">
                            Dados Públicos da Matriz (Receita Federal)
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {publicProfile && (
                            <span className="px-2 py-0.5 rounded-full bg-surface-elevated border border-border text-text-muted font-medium">
                              {publicProfile.cached ? 'Cache local' : 'BrasilAPI'}
                            </span>
                          )}
                          {!publicCnpjEnabled ? (
                            <button
                              type="button"
                              onClick={() => setPublicCnpjEnabled(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-action hover:bg-action-hover text-white font-semibold transition-colors"
                            >
                              Consultar Receita Federal
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={publicCnpjLoading || publicCnpjFetching}
                              onClick={() => {
                                if (publicCnpjRefresh) {
                                  refetchPublicCnpj();
                                } else {
                                  setPublicCnpjRefresh(true);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border text-primary font-medium disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${publicCnpjLoading || publicCnpjFetching ? 'animate-spin' : ''}`} />
                              Atualizar
                            </button>
                          )}
                        </div>
                      </div>

                      {!publicCnpjEnabled ? (
                        <p className="text-text-muted">
                          Consulta sob demanda pela raiz <span className="font-mono text-text-primary">{customerId}</span> (matriz 0001) com cache local para evitar consultas repetidas.
                        </p>
                      ) : publicCnpjLoading || publicCnpjFetching ? (
                        <div className="space-y-2">
                          <Skeleton className="w-2/3 h-4 rounded" />
                          <Skeleton className="w-full h-10 rounded" />
                        </div>
                      ) : publicCnpjError ? (
                        <p className="text-negative font-medium" role="alert">
                          {publicCnpjError instanceof Error
                            ? publicCnpjError.message
                            : 'Não foi possível consultar os dados públicos deste CNPJ no momento.'}
                        </p>
                      ) : publicProfile ? (
                        <div className="space-y-3 pt-1 border-t border-border/60">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-text-muted block">Razão Social Oficial:</span>
                              <span className="font-semibold text-text-primary text-sm">
                                {publicProfile.razao_social || '—'}
                              </span>
                              {publicProfile.nome_fantasia && (
                                <span className="block text-text-secondary mt-0.5">
                                  Fantasia: {publicProfile.nome_fantasia}
                                </span>
                              )}
                            </div>
                            {publicProfile.situacao_cadastral && (
                              <span className={`px-2.5 py-0.5 rounded-full font-semibold border ${statusTone}`}>
                                {publicProfile.situacao_cadastral}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="text-text-muted block mb-0.5">CNPJ da Matriz:</span>
                              <span className="font-mono font-medium text-text-primary">{publicProfile.cnpj_formatted}</span>
                            </div>
                            <div>
                              <span className="text-text-muted block mb-0.5">Abertura / Situação:</span>
                              <span className="font-medium text-text-primary">
                                {publicProfile.data_inicio_atividade ? formatDate(publicProfile.data_inicio_atividade) : '—'}
                                {publicProfile.data_situacao_cadastral ? ` · Sit. ${formatDate(publicProfile.data_situacao_cadastral)}` : ''}
                              </span>
                            </div>
                            <div>
                              <span className="text-text-muted block mb-0.5">Porte / Natureza Jurídica:</span>
                              <span className="font-medium text-text-primary">
                                {[publicProfile.porte, publicProfile.natureza_juridica].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-text-muted block mb-0.5">Capital Social:</span>
                              <span className="font-medium text-text-primary">
                                {publicProfile.capital_social != null ? formatCurrency(publicProfile.capital_social) : '—'}
                              </span>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-text-muted block mb-0.5">CNAE Principal:</span>
                              <span className="font-medium text-text-primary">
                                {publicProfile.cnae_principal_codigo ? `${publicProfile.cnae_principal_codigo} — ` : ''}
                                {publicProfile.cnae_principal_descricao || '—'}
                              </span>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-text-muted block mb-0.5">Endereço da Matriz:</span>
                              <span className="font-medium text-text-primary">
                                {[
                                  [publicProfile.logradouro, publicProfile.numero].filter(Boolean).join(', '),
                                  publicProfile.complemento,
                                  publicProfile.bairro,
                                  [publicProfile.municipio, publicProfile.uf].filter(Boolean).join('/'),
                                  publicProfile.cep ? `CEP ${publicProfile.cep}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </div>
                          </div>

                          {publicProfile.cnaes_secundarios.length > 0 && (
                            <details className="pt-1 border-t border-border/60">
                              <summary className="cursor-pointer text-primary font-medium select-none">
                                CNAEs secundários ({publicProfile.cnaes_secundarios.length})
                              </summary>
                              <ul className="mt-2 space-y-1 text-text-secondary">
                                {publicProfile.cnaes_secundarios.map((cnae) => (
                                  <li key={`${cnae.codigo}-${cnae.descricao}`}>
                                    <span className="font-mono text-text-muted">{cnae.codigo}</span> — {cnae.descricao}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Repurchase Windows Indicators */}
                {indicators && (
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                    <h4 className="text-xs font-display font-semibold uppercase tracking-wider text-text-muted mb-3">
                      Indicadores de Recompra
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-center">
                      {[
                        { label: '30 Dias', repurchased: indicators.recompra_30d, mature: indicators.maturidade_30d },
                        { label: '60 Dias', repurchased: indicators.recompra_60d, mature: indicators.maturidade_60d },
                        { label: '90 Dias', repurchased: indicators.recompra_90d, mature: indicators.maturidade_90d },
                        { label: '180 Dias', repurchased: indicators.recompra_180d, mature: indicators.maturidade_180d },
                      ].map((w) => (
                        <div
                          key={w.label}
                          className="p-2.5 rounded-lg bg-surface-elevated border border-border flex flex-col items-center justify-between"
                        >
                          <span className="text-xs text-text-muted font-medium">{w.label}</span>
                          <span className="my-1">
                            {!w.mature ? (
                              <span className="text-xs text-text-muted font-medium">Imaturo</span>
                            ) : w.repurchased ? (
                              <span className="text-xs text-primary font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 inline" /> Recomprou
                              </span>
                            ) : (
                              <span className="text-xs text-text-secondary font-medium">Não</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monthly History Table */}
                <div>
                  <h4 className="text-xs font-display font-semibold uppercase tracking-wider text-text-muted mb-2.5">
                    Histórico Mensal Oficial
                  </h4>
                  <HorizontalScroll label="Histórico mensal do cliente" className="border border-border rounded-xl bg-surface overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-action text-white text-xs font-display font-semibold uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Mês</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-center">Notas</th>
                          <th className="py-2.5 px-3 text-right">Fat. Líquido</th>
                          <th className="py-2.5 px-3 text-right">Margem %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {history.map((h) => (
                          <tr key={h.mes_referencia} className="hover:bg-surface-hover/50">
                            <td className="py-2.5 px-3 font-medium text-text-secondary whitespace-nowrap">
                              {formatDate(h.mes_referencia, 'month-year')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="text-xs font-semibold text-text-primary">
                                {h.status_historico}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {h.quantidade_notas_mes}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                              {formatCurrency(h.faturamento_liquido_mes)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                              {formatPercent(h.margem_bruta_percentual_mes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </HorizontalScroll>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-surface text-right shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-action hover:bg-action-hover dark:border dark:border-cyan/35 text-white transition-colors shadow-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
