import React, { useState } from 'react';
import { CalendarClock, RotateCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { DistributionDonutChart } from '../components/charts/DistributionDonutChart';
import { LifecycleTransitionsChart } from '../components/charts/LifecycleTransitionsChart';
import { useGlobalFilters } from '../context/FilterContext';
import { useLifecycle, useLifecycleTransitions, useMetadata } from '../api/queries';
import { formatNumber, selectedSingleMonth } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { ErrorState } from '../components/common/ErrorState';

export function lifecycleReference(end: string | null | undefined, snapshot: string | undefined) {
  if (!snapshot || !end || end >= snapshot) return snapshot;
  const date = new Date(`${end}T00:00:00Z`);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  if (next.toISOString().slice(0, 10) === end) return end;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)).toISOString().slice(0, 10);
}
const CRITERIA = [
  { status: 'NOVO', rule: 'Primeira compra ou até 5 compras recentes', color: 'text-primary' },
  { status: 'RECORRENTE', rule: 'Mais de 5 compras e menos de 180 dias sem compra', color: 'text-positive' },
  { status: 'EM RISCO', rule: '180 a 364 dias sem compra válida', color: 'text-warning' },
  { status: 'INATIVO', rule: '365 dias ou mais sem compra válida', color: 'text-negative' },
  { status: 'SEM FATURAMENTO', rule: 'Sem compra válida observada', color: 'text-text-secondary' },
  { status: 'SEM CLASSIFICAÇÃO', rule: 'Condição especial preservada da origem, sem inferir a causa', color: 'text-text-muted' },
];
export const LifecyclePage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const { filters, toggleFilter, updateFilters } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: metadata } = useMetadata();
  const reference = lifecycleReference(filters.end_date, metadata?.meta.reference_date);
  const { data: statusData, isLoading: statusLoading, error: statusError, refetch: refetchStatus } = useLifecycle(reference, filters);
  const { data: transitionsData, isLoading: transLoading, error: transError, refetch: refetchTrans } = useLifecycleTransitions(filters);
  const statuses = statusData?.data || [];
  const transitions = transitionsData?.data || [];
  const enteredRisk = transitions.filter(t => t.status === 'EM RISCO').reduce((sum, t) => sum + t.customers, 0);
  const reactivated = transitions.filter(t => t.previous_status === 'INATIVO' && t.status === 'RECORRENTE').reduce((sum, t) => sum + t.customers, 0);
  const selectTransition = (period: string, status: string) => {
    const start = `${period.slice(0, 7)}-01`;
    const [year, month] = start.split('-').map(Number);
    const end = `${period.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    const selected = filters.start_date === start && filters.end_date === end && filters.customer_status === status;
    updateFilters({ start_date: selected ? null : start, end_date: selected ? null : end, customer_status: selected ? null : status });
  };
  return <div ref={containerRef} className="space-y-6">
    <Header title="Ciclo de Vida do Cliente" subtitle="Recência da carteira e mudanças de status observadas." section="GESTÃO DE CARTEIRA" filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(!filtersOpen)} />
    <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
    <p className="text-xs text-text-secondary flex items-center gap-2"><CalendarClock className="w-4 h-4 shrink-0 text-primary" />Carteira em {reference || statusData?.meta.reference_date || 'carregamento'}. O fim do período global define o último fechamento disponível; as transições usam o intervalo inteiro.</p>
    {statusError ? <ErrorState title="Erro ao carregar distribuição de status" message="A referência selecionada deve possuir um fechamento mensal observado." onRetry={() => refetchStatus()} /> : <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 gsap-kpi">
        {CRITERIA.map(item => <button key={item.status} onClick={() => toggleFilter('customer_status', item.status)} aria-pressed={filters.customer_status === item.status} title={item.rule} className={`bg-surface border rounded-2xl p-4 text-left shadow-sm transition-[border-color,box-shadow] ${filters.customer_status === item.status ? 'border-primary ring-2 ring-primary/20 bg-tint' : 'border-border hover:border-primary/40'}`}>
          <span className="text-xs font-display text-text-muted font-bold block">{item.status}</span>
          <div className={`text-2xl font-display font-bold my-2 ${item.color}`}>{formatNumber(statuses.find(s => s.status === item.status)?.customers ?? 0)}</div>
          <span className="text-xs text-text-secondary leading-snug block">{item.rule}</span>
        </button>)}
      </div>
    </>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-surface border border-border rounded-xl p-4 shadow-sm"><span className="text-xs font-display font-semibold text-text-secondary">Transições para Em Risco</span><div className="text-xl font-display font-bold text-warning my-1">{formatNumber(enteredRisk)}</div><p className="text-xs text-text-muted">Ocorrências no período, podendo incluir o mesmo cliente em meses diferentes.</p></div>
      <div className="bg-surface border border-border rounded-xl p-4 shadow-sm"><span className="text-xs font-display font-semibold text-text-secondary flex gap-2 items-center"><RotateCw className="w-4 h-4 text-primary" />Reativações observadas</span><div className="text-xl font-display font-bold text-positive my-1">{formatNumber(reactivated)}</div><p className="text-xs text-text-muted">Transições de Inativo para Recorrente após nova compra válida.</p></div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 gsap-chart">
      <div className="lg:col-span-5 min-w-0"><DistributionDonutChart title="Distribuição da Base" subtitle={`Status no fechamento ${reference || statusData?.meta.reference_date || ''}`} data={[...statuses].map(s => ({ name: s.status, value: s.customers })).sort((a, b) => b.value - a.value)} totalLabel="clientes classificados" loading={statusLoading} height={340} onSelect={name => toggleFilter('customer_status', name)} selectedName={filters.customer_status} /></div>
      <div className="lg:col-span-7 min-w-0">{transError ? <ErrorState title="Erro ao carregar transições" message="Não foi possível consultar as mudanças de status." onRetry={() => refetchTrans()} /> : <LifecycleTransitionsChart transitions={transitions} loading={transLoading} height={340} onSelect={selectTransition} selectedPeriod={selectedSingleMonth(filters.start_date, filters.end_date)} selectedStatus={filters.customer_status} />}</div>
    </div>
  </div>;
};
