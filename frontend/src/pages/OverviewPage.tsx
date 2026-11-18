import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { MetricCard } from '../components/common/MetricCard';
import { acquisitionPeriodLabel } from '../components/common/AcquisitionPeriod';
import { AcquisitionBarChart } from '../components/charts/AcquisitionBarChart';
import { DistributionDonutChart } from '../components/charts/DistributionDonutChart';
import { CustomerTable } from '../components/customers/CustomerTable';
import { CustomerDetailDrawer } from '../components/customers/CustomerDetailDrawer';
import { ContextualInsightCard } from '../components/common/ContextualInsightCard';
import { ErrorState } from '../components/common/ErrorState';
import { useGlobalFilters } from '../context/FilterContext';
import {
  useOverview,
  useAcquisition,
  useProfitability,
  useCustomers,
} from '../api/queries';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  selectedSingleMonth,
} from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { Customer } from '../api/types';

export const OverviewPage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const navigate = useNavigate();
  const { filters, toggleFilter, toggleMonth } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Queries
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useOverview(filters);

  const {
    data: acquisitionData,
    isLoading: acquisitionLoading,
  } = useAcquisition(filters);

  const {
    data: profitabilityData,
    isLoading: profitabilityLoading,
  } = useProfitability(filters, 'business_unit', 10);

  const {
    data: customersData,
    isLoading: customersLoading,
  } = useCustomers({
    ...filters,
    page: 1,
    page_size: 5,
    sort_by: 'net_revenue',
    sort_order: 'desc',
  });

  const overview = overviewData?.data;
  const acquisitionPoints = acquisitionData?.data || [];
  const buProfitability = profitabilityData?.data || [];
  const topCustomers = customersData?.data?.items || [];

  // Sparklines from real acquisition history (last 12 points)
  const sparklineCustomers = acquisitionPoints.slice(-8).map((d) => d.new_customers);
  const sparklineRevenue = acquisitionPoints
    .slice(-8)
    .map((d) => d.first_purchase_net_revenue ?? 0);

  // Donut data: Distribution by BU sorted by share so top BUs hold the anchor colors
  const donutData = [...buProfitability]
    .map((item) => ({
      name: item.dimension || 'Outros',
      value: item.clientes_identificados || 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Contextual insight derived from real data
  const totalAcquired = overview?.acquired_customers ?? 0;
  const periodRevenue =
    overview?.acquired_customer_period_revenue?.faturamento_liquido ??
    overview?.acquisition_month_net_revenue;
  const repurchaseRate = overview?.repurchase_90d?.rate_pct;

  let insightText = 'Acompanhamento analítico da safra de novos clientes.';
  let detailText = 'Os indicadores refletem transações consolidadas do banco sintético auditável.';

  if (overview?.acquisition_growth_previous_period_pct !== null && overview?.acquisition_growth_previous_period_pct !== undefined) {
    const growth = overview.acquisition_growth_previous_period_pct;
    insightText = `A aquisição de clientes variou ${formatPercent(growth, { includeSign: true })} em relação ao período anterior.`;
    detailText = `${formatNumber(totalAcquired)} novos clientes foram adicionados na safra analisada.`;
  } else if (repurchaseRate !== null && repurchaseRate !== undefined) {
    insightText = `${formatPercent(repurchaseRate)} dos clientes elegíveis recompraram em até 90 dias.`;
    detailText = `De ${overview?.repurchase_90d?.eligible_customers ?? 0} elegíveis, ${overview?.repurchase_90d?.repurchased_customers ?? 0} registraram novo pedido.`;
  } else if (totalAcquired > 0) {
    insightText = `Foram identificados ${formatNumber(totalAcquired)} novos clientes no histórico filtrado.`;
    detailText = `Receita atribuída ao mês de aquisição de ${formatCurrency(overview?.acquisition_month_net_revenue, { compact: true })}.`;
  }

  // Margin % from acquired period revenue or company transaction revenue
  const marginPct =
    overview?.acquired_customer_period_revenue?.margem_bruta_percentual ??
    overview?.company_transaction_revenue?.margem_bruta_percentual;


  const singleMonth = selectedSingleMonth(filters.start_date, filters.end_date);

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Header with quick filters */}
      <Header
        title="Novos Clientes"
        subtitle="Acompanhe a evolução, o faturamento e a rentabilidade dos novos clientes."
        section="CLIENTES"
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
      />

      {/* Expandable Global Filters Bar */}
      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
      {overviewError && <ErrorState title="Não foi possível carregar a Visão Geral" message="Não foi possível consultar o serviço analítico local." onRetry={() => refetchOverview()} />}

      {/* 4 KPIs Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 gsap-kpi">
        {/* Card 1: Novos Clientes */}
        <MetricCard
          title="Novos Clientes"
          value={formatNumber(overview?.acquired_customers)}
          icon={Users}
          trend={overview?.acquisition_growth_previous_period_pct}
          comparisonLabel="vs. período anterior"
          isFavorablePositive={true}
          sparklineData={sparklineCustomers}
          loading={overviewLoading}
          subtitle={acquisitionPeriodLabel(filters, overviewData?.meta.reference_date)}
          tooltip="Clientes únicos (raiz CNPJ) cuja primeira compra válida no histórico ocorreu no período selecionado. O status atual do cliente não define a data de entrada."
        />

        {/* Card 2: Receita Gerada */}
        <MetricCard
          title="Receita Gerada"
          value={formatCurrency(periodRevenue, { compact: true, unitStyle: 'bi' })}
          icon={DollarSign}
          trend={null}
          comparisonLabel="Mês de aquisição"
          sparklineData={sparklineRevenue}
          loading={overviewLoading}
          subtitle={periodRevenue ? formatCurrency(periodRevenue, { decimals: Math.abs(periodRevenue) >= 1000 ? 0 : 2 }) : undefined}
          tooltip="Faturamento líquido atribuído à população de novos clientes na sua entrada."
        />

        {/* Card 3: Margem Bruta (%) */}
        <MetricCard
          title="Margem Bruta (%)"
          value={formatPercent(marginPct)}
          icon={TrendingUp}
          trend={null}
          comparisonLabel="Margem oficial MB%"
          isFavorablePositive={true}
          loading={overviewLoading}
          subtitle="SUM(Margem R$) / SUM(Líquido)"
          tooltip="Margem bruta percentual calculada oficialmente pela API."
        />

        {/* Card 4: Taxa de Recompra 90d */}
        <MetricCard
          title="Taxa de Recompra 90d"
          value={formatPercent(overview?.repurchase_90d?.rate_pct)}
          icon={Percent}
          trend={null}
          comparisonLabel={
            overview?.repurchase_90d
              ? `${overview.repurchase_90d.repurchased_customers} de ${overview.repurchase_90d.eligible_customers} elegíveis`
              : 'Janela 90 dias'
          }
          loading={overviewLoading}
          isFavorablePositive={true}
          subtitle={overview?.repurchase_90d?.mature ? 'Janela madura' : 'Em maturação'}
          tooltip="Taxa de recompra de clientes com janela elegível de 90 dias completada."
        />
      </div>

      {/* Main Charts Row: Bar Chart (Left 7 cols) + Donut (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 gsap-chart">
        <div className="lg:col-span-7">
          <AcquisitionBarChart
            data={acquisitionPoints}
            onSelectPeriod={toggleMonth}
            selectedPeriod={singleMonth}
            loading={acquisitionLoading}
            height={280}
          />
        </div>
        <div className="lg:col-span-5">
          <DistributionDonutChart
            title="Clientes por Business Unit"
            subtitle="Clientes com transações no período; podem pertencer a várias BUs"
            data={donutData}
            totalLabel="presenças em BUs"
            onSelect={(name) => toggleFilter('business_unit', name)}
            selectedName={filters.business_unit}
            loading={profitabilityLoading}
            height={280}
          />
        </div>
      </div>

      {/* Bottom Row: Top Customers Table (Left 8 cols) + Contextual Insight Card (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start gsap-section">
        {/* Table Container */}
        <div className="lg:col-span-8 bg-surface border border-border rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-display font-bold text-text-primary tracking-tight">
                    Principais Novos Clientes
                  </h3>
                  <p className="text-xs text-text-muted">
                    Maiores aquisições por faturamento líquido acumulado
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate('/customers')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-cyan transition-colors"
              >
                <span>Ver todos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <CustomerTable
              customers={topCustomers}
              loading={customersLoading}
              onSelectCustomer={(c) => setSelectedCustomerId(c.customer_id)}
            />
          </div>
        </div>

        {/* Contextual Insight Card */}
        <div className="lg:col-span-4">
          <ContextualInsightCard
            title="Destaque do período"
            insightText={insightText}
            detailText={detailText}
            actionLabel="Analisar retenção"
            onAction={() => navigate('/retention')}
            className="h-full"
          />
        </div>
      </div>

      {/* Customer Detail Drawer */}
      <CustomerDetailDrawer
        filters={filters}
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />
    </div>
  );
};
