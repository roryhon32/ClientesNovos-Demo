import React, { useState } from 'react';
import {
  UserPlus,
  DollarSign,
  TrendingUp,
  Award,
  Building2,
  Users,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { MetricCard } from '../components/common/MetricCard';
import { acquisitionPeriodLabel } from '../components/common/AcquisitionPeriod';
import { AcquisitionBarChart } from '../components/charts/AcquisitionBarChart';
import { DistributionDonutChart } from '../components/charts/DistributionDonutChart';
import { ProfitabilityBarChart } from '../components/charts/ProfitabilityBarChart';
import { useGlobalFilters } from '../context/FilterContext';
import { useOverview, useAcquisition, useProfitability } from '../api/queries';
import { formatCurrency, formatPercent, formatNumber, selectedSingleMonth } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { ErrorState } from '../components/common/ErrorState';

export const AcquisitionPage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const { filters, toggleFilter, toggleMonth } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<
    'new_customers' | 'first_purchase_net_revenue' | 'first_purchase_gross_margin'
  >('new_customers');

  const { data: overviewData, isLoading: overviewLoading, error, refetch } = useOverview(filters);
  const { data: acqData, isLoading: acqLoading } = useAcquisition(filters);
  const { data: buData, isLoading: buLoading } = useProfitability(filters, 'business_unit', 10);
  const { data: sellerData, isLoading: sellerLoading } = useProfitability(filters, 'seller', 10);

  const overview = overviewData?.data;
  const points = acqData?.data || [];

  // Total metrics of first purchases
  const totalNewCustomers = overview?.acquired_customers ?? 0;
  const firstPurchaseNetRevenue = overview?.acquisition_month_net_revenue;
  const lifetimeRevenue = overview?.acquired_customer_lifetime_revenue?.faturamento_liquido;

  // Donut data by BU sorted by share so top BUs hold the anchor colors
  const buDonut = [...(buData?.data || [])]
    .map((b) => ({
      name: b.dimension || 'Outros',
      value: b.clientes_identificados || 0,
    }))
    .sort((a, b) => b.value - a.value);


  return (
    <div ref={containerRef} className="space-y-6">
      <Header
        title="Aquisição de Clientes"
        subtitle="Análise profunda da entrada de novas contas, primeiras compras e canais de tração."
        section="AQUISIÇÃO & EXPANSÃO"
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
      />

      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
      {error && <ErrorState title="Erro ao carregar dados de Aquisição" message="Não foi possível consultar o serviço analítico local." onRetry={() => refetch()} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 gsap-kpi">
        <MetricCard
          title="Novos Clientes"
          value={formatNumber(totalNewCustomers)}
          icon={UserPlus}
          trend={overview?.acquisition_growth_previous_period_pct}
          comparisonLabel="vs. período anterior"
          loading={overviewLoading}
          subtitle={acquisitionPeriodLabel(filters, overviewData?.meta.reference_date)}
          tooltip="Clientes únicos (raiz CNPJ) cuja primeira compra válida no histórico ocorreu no período selecionado. Não é a quantidade de clientes com status atual NOVO."
        />

        <MetricCard
          title="Fat. 1ª Compra Líquido"
          value={formatCurrency(firstPurchaseNetRevenue, { compact: true, unitStyle: 'bi' })}
          icon={DollarSign}
          subtitle={firstPurchaseNetRevenue ? formatCurrency(firstPurchaseNetRevenue, { decimals: Math.abs(firstPurchaseNetRevenue) >= 1000 ? 0 : 2 }) : undefined}
          comparisonLabel="Faturamento na data de entrada"
          loading={overviewLoading}
          tooltip="Soma do faturamento líquido dos documentos válidos na primeira data de compra."
        />

        <MetricCard
          title="Receita Acumulada da Safra"
          value={formatCurrency(lifetimeRevenue, { compact: true, unitStyle: 'bi' })}
          icon={TrendingUp}
          subtitle="Até a data de referência"
          comparisonLabel="Evolução pós-aquisição"
          loading={overviewLoading}
          tooltip="Receita líquida total acumulada pelos clientes adquiridos até hoje."
        />

        <MetricCard
          title="Recompra em 90 Dias"
          value={formatPercent(overview?.repurchase_90d?.rate_pct)}
          icon={Award}
          comparisonLabel={
            overview?.repurchase_90d
              ? `${overview.repurchase_90d.repurchased_customers} de ${overview.repurchase_90d.eligible_customers} elegíveis`
              : 'Janela 90d'
          }
          loading={overviewLoading}
          subtitle={overview?.repurchase_90d?.mature ? 'Janela Madura' : 'Em maturação'}
          tooltip="Taxa oficial de recompra com segundo documento distinto observado."
        />
      </div>

      {/* Main Bar Chart with metric switcher */}
      <div className="gsap-chart">
        <AcquisitionBarChart
          data={points}
          onSelectPeriod={toggleMonth}
          selectedPeriod={selectedSingleMonth(filters.start_date, filters.end_date)}
          metric={activeMetric}
          onMetricChange={setActiveMetric}
          loading={acqLoading}
          height={320}
        />
      </div>

      {/* Secondary Row: Acquisition by BU + Acquisition by Seller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 gsap-section">
        <div className="lg:col-span-5">
          <DistributionDonutChart
            title="Clientes por Business Unit"
            subtitle="Presença transacional no período; clientes podem aparecer em várias BUs"
            data={buDonut}
            totalLabel="presenças em BUs"
            onSelect={(name) => toggleFilter('business_unit', name)}
            selectedName={filters.business_unit}
            loading={buLoading}
            height={320}
          />
        </div>

        <div className="lg:col-span-7">
          <ProfitabilityBarChart
            data={sellerData?.data || []}
            onSelect={(name) => toggleFilter('seller', name)}
            selectedName={filters.seller}
            dimensionLabel="Vendedor"
            loading={sellerLoading}
            height={320}
          />
        </div>
      </div>
    </div>
  );
};
