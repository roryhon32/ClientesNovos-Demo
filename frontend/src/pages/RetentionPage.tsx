import React, { useState } from 'react';
import { Clock, Info } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { CohortHeatmapChart } from '../components/charts/CohortHeatmapChart';
import { useGlobalFilters } from '../context/FilterContext';
import { useRetention, useCohorts } from '../api/queries';
import { formatPercent, formatNumber, formatDate } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { ErrorState } from '../components/common/ErrorState';
import { CardSkeleton } from '../components/common/LoadingSkeleton';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

export const RetentionPage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const { filters, toggleFilter } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxMonths, setMaxMonths] = useState(12);
  const { data: retentionData, isLoading: retentionLoading, error: retError, refetch: refetchRet } = useRetention(filters);
  const { data: cohortsData, isLoading: cohortsLoading, error: cohError, refetch: refetchCoh } = useCohorts(filters, maxMonths);
  const retention = retentionData?.data;
  const windows = retention?.windows ?? [];
  const referenceDate = cohortsData?.meta?.reference_date ?? retentionData?.meta?.reference_date;

  return (
    <div ref={containerRef} className="space-y-6">
      <Header
        title="Retenção e Cohorts"
        subtitle="Recompra por documentos distintos e acompanhamento mensal das safras de aquisição."
        section="RETENÇÃO ANALÍTICA"
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
      />
      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <div className="bg-tint border border-tint-border rounded-xl p-4 flex gap-3 text-xs text-text-secondary">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Os filtros de período selecionam a aquisição do cliente. As janelas medem recompra acumulada até 30, 60, 90 e 180 dias;
          clientes sem tempo suficiente ficam fora do denominador. Retenção após 90/180 dias segue pendente de definição da janela.
          {referenceDate && <span className="block mt-1 font-medium text-primary">Data de referência: {formatDate(referenceDate)}.</span>}
        </p>
      </div>
      <section aria-label="Indicadores de recompra" className="space-y-4">
        {retError ? (
          <ErrorState
            title="Erro ao carregar indicadores de recompra"
            message={errorMessage(retError, 'Não foi possível consultar as janelas. Ajuste os filtros ou tente novamente.')}
            onRetry={() => { void refetchRet(); }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 gsap-kpi" aria-busy={retentionLoading}>
              {[30, 60, 90, 180].map((days) => {
                const window = windows.find((item) => item.days === days);
                if (retentionLoading) return <CardSkeleton key={days} height="h-48" />;
                return (
                  <article key={days} className="bg-surface border border-border rounded-2xl p-5 pt-6 relative overflow-hidden shadow-sm" aria-label={`Recompra ${days}d`}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0a1f3d] via-[#123063] to-[#5787cf]" />
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                      <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
                    </div>
                    <h2 className="text-xs font-display font-semibold text-text-muted uppercase tracking-wider">Recompra {days}d</h2>
                    <p className="text-3xl font-display font-bold text-text-primary my-2">{window?.rate_pct == null ? '—' : formatPercent(window.rate_pct)}</p>
                    <p className="text-xs text-text-secondary font-medium">
                      {window ? `${formatNumber(window.repurchased_customers)} de ${formatNumber(window.eligible_customers)} elegíveis` : 'Indicador indisponível'}
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      {!window ? 'Sem dados para esta janela' : window.eligible_customers === 0 ? 'Sem clientes com janela completa' : 'Taxa entre clientes com janela completa'}
                      {window && window.immature_customers > 0 && <span className="block">{formatNumber(window.immature_customers)} sem maturidade, excluídos da taxa</span>}
                    </p>
                  </article>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: 'Tempo médio até a 2ª compra', value: retention?.mean_days_to_second_purchase },
                { title: 'Mediana até a 2ª compra', value: retention?.median_days_to_second_purchase },
              ].map(({ title, value }) => (
                <div key={title} className="bg-surface border border-border rounded-xl p-4 shadow-sm">
                  <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
                  <p className="text-xl font-display font-bold text-text-primary mt-1" aria-live="polite">
                    {retentionLoading ? 'Carregando…' : value == null ? '—' : `${formatNumber(Math.round(value))} dias`}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Calculado entre clientes com segundo documento observado, inclusive no mesmo dia.</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <section aria-label="Acompanhamento de safras" className="gsap-chart space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="cohort-max-months" className="text-xs font-medium text-text-secondary">Meses de acompanhamento:</label>
          <select
            id="cohort-max-months"
            value={maxMonths}
            onChange={(e) => setMaxMonths(Number(e.target.value))}
            className="bg-surface border border-border text-text-primary text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value={6}>Até M+6</option>
            <option value={12}>Até M+12 (1 ano)</option>
            <option value={18}>Até M+18</option>
            <option value={24}>Até M+24 (2 anos)</option>
          </select>
        </div>
        {cohError ? (
          <ErrorState
            title="Erro ao carregar matriz de safras"
            message={errorMessage(cohError, 'Não foi possível consultar os cohorts. Reduza o período ou os meses de acompanhamento e tente novamente.')}
            onRetry={() => { void refetchCoh(); }}
          />
        ) : (
          <CohortHeatmapChart cohorts={cohortsData?.data ?? []} loading={cohortsLoading} maxMonths={maxMonths} referenceDate={referenceDate} height={520} onSelectCohort={(cohort) => toggleFilter('acquisition_cohort', cohort)} selectedCohort={filters.acquisition_cohort} />
        )}
      </section>
    </div>
  );
};
