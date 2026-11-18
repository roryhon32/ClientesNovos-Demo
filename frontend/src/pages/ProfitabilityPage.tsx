import React, { useState } from 'react';
import {
  Coins,
  DollarSign,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { GlobalFilters } from '../components/layout/GlobalFilters';
import { MetricCard } from '../components/common/MetricCard';
import { ProfitabilityBarChart } from '../components/charts/ProfitabilityBarChart';
import { useGlobalFilters } from '../context/FilterContext';
import { useFinancialSummary, useProfitability } from '../api/queries';
import { HorizontalScroll } from '../components/common/HorizontalScroll';
import type { QueryFilters } from '../api/types';
import { formatCurrency, formatPercent, formatNumber } from '../hooks/useFormatters';
import { useGsapPageEntrance } from '../hooks/useGsapEntrance';
import { ErrorState } from '../components/common/ErrorState';

export const ProfitabilityPage: React.FC = () => {
  const containerRef = useGsapPageEntrance();
  const { filters, toggleFilter } = useGlobalFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('business_unit');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const { data: financeData, isLoading: overviewLoading, error: financeError, refetch: refetchFinance } = useFinancialSummary(filters);
  const { data: profitData, isLoading: profitLoading, error, refetch } = useProfitability(filters, groupBy, 50);

  const allItems = profitData?.data || [];
  const items = groupBy === 'customer' && selectedCustomer ? allItems.filter(item => item.dimension === selectedCustomer) : allItems;
  const companyFinance = groupBy === 'customer' && selectedCustomer ? items[0] : financeData?.data;
  const selectDimension = (name: string) => {
    if (groupBy === 'customer') setSelectedCustomer(current => current === name ? null : name);
    else toggleFilter(groupBy as keyof QueryFilters, name);
  };

  const DIMENSIONS = [
    { key: 'business_unit', label: 'Business Unit' },
    { key: 'seller', label: 'Vendedor' },
    { key: 'sales_channel', label: 'Canal de Venda' },
    { key: 'state', label: 'Estado (UF)' },
    { key: 'family', label: 'Família de Produtos' },
    { key: 'product', label: 'Produto' },
    { key: 'customer', label: 'Cliente (Raiz CNPJ)' },
    { key: 'acquisition_cohort', label: 'Safra de Aquisição' },
  ];

  const currentDimensionLabel = DIMENSIONS.find((d) => d.key === groupBy)?.label || 'Dimensão';

  return (
    <div ref={containerRef} className="space-y-6">
      <Header
        title="Rentabilidade & Margem"
        subtitle="Decomposição analítica de faturamento, margem bruta oficial e carga tributária."
        section="FINANCEIRO & MARGEM"
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
      />

      <GlobalFilters isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
      {(error || financeError) && <ErrorState title="Erro ao carregar rentabilidade" message="Não foi possível obter o resumo financeiro das transações." onRetry={() => { refetch(); refetchFinance(); }} />}
      {selectedCustomer && groupBy === 'customer' && <button onClick={() => setSelectedCustomer(null)} className="text-xs text-primary border border-primary/30 rounded-lg px-3 py-2">Cliente nesta página: {selectedCustomer} · remover</button>}

      {/* Global Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 gsap-kpi">
        <MetricCard
          title="Fat. Líquido Total"
          value={formatCurrency(companyFinance?.faturamento_liquido, { compact: true })}
          icon={DollarSign}
          comparisonLabel="Transações do período"
          subtitle={companyFinance?.faturamento_liquido ? formatCurrency(companyFinance.faturamento_liquido) : undefined}
          loading={overviewLoading}
          tooltip="Soma do faturamento líquido de todas as transações válidas do escopo."
        />

        <MetricCard
          title="Fat. Contábil Total"
          value={formatCurrency(companyFinance?.faturamento_contabil, { compact: true })}
          icon={FileSpreadsheet}
          comparisonLabel="Valor contábil bruto"
          subtitle={companyFinance?.faturamento_contabil ? formatCurrency(companyFinance.faturamento_contabil) : undefined}
          loading={overviewLoading}
          tooltip="Valor contábil total das notas fiscais e documentos de venda."
        />

        <MetricCard
          title="Impostos Fiscais"
          value={formatCurrency(companyFinance?.impostos, { compact: true })}
          icon={Receipt}
          comparisonLabel={
            companyFinance?.percentual_impostos
              ? `${formatPercent(companyFinance.percentual_impostos)} da receita contábil`
              : 'Dedução Contábil - Líquido'
          }
          isFavorablePositive={false}
          loading={overviewLoading}
          tooltip="Impostos calculados oficialmente como: Valor Contábil - Fat. Líquido."
        />

        <MetricCard
          title="Margem Bruta (MB%)"
          value={formatPercent(companyFinance?.margem_bruta_percentual)}
          icon={TrendingUp}
          comparisonLabel="Margem oficial ponderada"
          subtitle={formatCurrency(companyFinance?.margem_bruta_valor, { compact: true })}
          isFavorablePositive={true}
          loading={overviewLoading}
          tooltip="Fórmula oficial: SUM(Margem Bruta R$) / SUM(Fat. Líquido) * 100."
        />
      </div>

      {/* Dimension Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs font-semibold text-text-muted mr-2">Agrupar por:</span>
        {DIMENSIONS.map((dim) => (
          <button
            key={dim.key}
            onClick={() => { setGroupBy(dim.key); setSelectedCustomer(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              groupBy === dim.key
                ? 'bg-action text-white border border-action dark:border-cyan/40 font-semibold shadow-sm'
                : 'bg-surface hover:bg-surface-elevated border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {dim.label}
          </button>
        ))}
      </div>

      {/* Profitability Bar Chart */}
      <div className="gsap-chart">
        <ProfitabilityBarChart
          data={items}
          onSelect={selectDimension}
          selectedName={groupBy === 'customer' ? selectedCustomer : filters[groupBy as keyof Omit<QueryFilters, 'valid_purchases_gt'>]}
          dimensionLabel={currentDimensionLabel}
          loading={profitLoading}
          height={350}
        />
      </div>

      {/* Detailed Breakdown Table */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm gsap-section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-text-primary tracking-tight">
              Tabela Analítica por {currentDimensionLabel}
            </h3>
            <p className="text-xs text-text-muted">
              Medidas financeiras sem distorções nem rateios arbitrários
            </p>
          </div>
          <span className="text-xs text-text-muted">
            {items.length} registros
          </span>
        </div>

        <HorizontalScroll label="Tabela analítica de rentabilidade">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-action text-white text-xs font-display font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 rounded-tl-lg">{currentDimensionLabel}</th>
                <th className="py-3 px-4 text-right">Fat. Líquido</th>
                <th className="py-3 px-4 text-right">Fat. Contábil</th>
                <th className="py-3 px-4 text-right">Impostos</th>
                <th className="py-3 px-4 text-right">Margem Bruta (R$)</th>
                <th className="py-3 px-4 text-right">MB (%)</th>
                <th className="py-3 px-4 text-center">Clientes</th>
                <th className="py-3 px-4 text-center rounded-tr-lg">Documentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((it, idx) => (
                <tr key={idx} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary">
                    {it.dimension || 'Sem Identificação'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-primary font-semibold">
                    {formatCurrency(it.faturamento_liquido)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-secondary">
                    {formatCurrency(it.faturamento_contabil)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-secondary">
                    {formatCurrency(it.impostos)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-cyan font-semibold">
                    {formatCurrency(it.margem_bruta_valor)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-text-primary">
                    {formatPercent(it.margem_bruta_percentual)}
                  </td>
                  <td className="py-3 px-4 text-center text-text-secondary">
                    {formatNumber(it.clientes_identificados)}
                  </td>
                  <td className="py-3 px-4 text-center text-text-secondary">
                    {formatNumber(it.documentos_distintos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>
    </div>
  );
};
