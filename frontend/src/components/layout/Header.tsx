import React, { useState, useEffect } from 'react';
import { Calendar, Building2, Briefcase, SlidersHorizontal, ChevronDown, Check, ArrowRight, X, RotateCcw, Sun, Moon } from 'lucide-react';
import { useGlobalFilters, PERIOD_PRESETS } from '../../context/FilterContext';
import { useTheme } from '../../context/ThemeContext';
import { useFilterOptions } from '../../api/queries';
import { SyntheticBadge } from '../common/SyntheticBadge';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  section?: string;
  onToggleFilters?: () => void;
  filtersOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Novos Clientes',
  subtitle = 'Acompanhe a aquisição, evolução e rentabilidade dos clientes.',
  section = 'CLIENTES',
  onToggleFilters,
  filtersOpen = false,
}) => {
  const { filters, setFilter, updateFilters, clearFilters, setPeriodPreset, activePeriodPreset } = useGlobalFilters();
  const { isDark, toggleTheme } = useTheme();
  const [dateError, setDateError] = useState('');
  const filterLabels: Record<string, string> = { start_date: 'De', end_date: 'Até', company: 'Empresa', business_unit: 'BU', seller: 'Vendedor', state: 'UF', city: 'Cidade', sales_channel: 'Canal', customer_status: 'Status', acquisition_cohort: 'Safra', family: 'Família · nesta página', product: 'Produto · nesta página', valid_purchases_gt: 'Compras válidas' };
  const activeFilters = Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== '');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [buOpen, setBuOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);

  const [customStart, setCustomStart] = useState(filters.start_date || '');
  const [customEnd, setCustomEnd] = useState(filters.end_date || '');

  useEffect(() => {
    setCustomStart(filters.start_date || '');
    setCustomEnd(filters.end_date || '');
  }, [filters.start_date, filters.end_date]);

  const { data: buData } = useFilterOptions('business_unit');
  const buOptions = buData?.data?.items?.map((i) => i.value) || [];

  const { data: companyData } = useFilterOptions('company', { ...filters, company: null });
  const companyOptions = companyData?.data?.items?.map((i) => i.value) || [];

  // Count active extra filters
  const activeExtraCount = [
    filters.seller,
    filters.state,
    filters.city,
    filters.sales_channel,
    filters.customer_status,
    filters.acquisition_cohort,
    filters.valid_purchases_gt,
  ].filter(value => value !== null && value !== undefined && value !== '').length;

  const handleApplyCustomDates = () => {
    if (customStart && customEnd && customStart > customEnd) {
      setDateError('A data inicial deve ser anterior à data final.');
      return;
    }
    setDateError('');
    updateFilters({ start_date: customStart || null, end_date: customEnd || null });
    setPeriodOpen(false);
  };

  const getPeriodLabel = () => {
    if (activePeriodPreset !== 'custom') {
      return PERIOD_PRESETS[activePeriodPreset]?.label || 'Período';
    }
    if (filters.start_date || filters.end_date) {
      return `${filters.start_date || '...'} a ${filters.end_date || '...'}`;
    }
    return 'Personalizado';
  };

  return (
    <header className="mb-4 gsap-header relative z-40 space-y-3">
      {/* Row 1: Title + Refresh Status & Theme Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Title and Section */}
        <div className="min-w-0">
          <span className="text-xs font-display uppercase font-bold tracking-wider text-cyan mb-0.5 block">
            {section}
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-text-primary tracking-tight">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-0.5 font-normal">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end shrink-0">
          {/* Update Timestamp / Source Status */}
          <SyntheticBadge />

          {/* Theme Mode Switcher (Light / Dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            aria-pressed={isDark}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-hover border border-border hover:border-primary/50 text-text-primary transition-all duration-200 shadow-sm"
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5 text-accent" strokeWidth={1.9} />
            ) : (
              <Moon className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
            )}
            <span>{isDark ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Unified Quick Filter Toolbar + Active Chips */}
      <div className="bg-surface border border-border rounded-2xl px-3.5 py-2.5 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Selector Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setPeriodOpen(!periodOpen);
                  setBuOpen(false);
                  setCompanyOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-elevated hover:bg-surface-hover border border-border hover:border-primary/50 text-text-primary transition-all duration-200"
                aria-expanded={periodOpen}
              >
                <Calendar className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span className="truncate max-w-[160px]">{getPeriodLabel()}</span>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
              </button>

              {periodOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setPeriodOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 z-50 w-64 rounded-2xl bg-surface border border-border shadow-xl p-2.5 space-y-1 text-xs">
                    <div className="text-xs font-display font-semibold text-text-muted px-2 py-1 uppercase tracking-wider">
                      Períodos Pré-definidos
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                      {Object.entries(PERIOD_PRESETS).map(([key, preset]) => {
                        const isSelected = activePeriodPreset === key;
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              setPeriodPreset(key);
                              setPeriodOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              isSelected
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                            }`}
                          >
                            <span>{preset.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Range Section */}
                    <div className="pt-2 mt-2 border-t border-border">
                      <div className="text-xs font-display font-semibold text-text-muted px-1 py-0.5 uppercase tracking-wider mb-1.5">
                        Intervalo Personalizado
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-muted w-9">De:</span>
                          <input
                            type="date"
                            aria-label="Data inicial global"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="flex-1 bg-surface-elevated border border-border text-text-primary text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-muted w-9">Até:</span>
                          <input
                            type="date"
                            aria-label="Data final global"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="flex-1 bg-surface-elevated border border-border text-text-primary text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                        {dateError && <p role="alert" className="text-xs text-negative font-medium">{dateError}</p>}
                        <button
                          onClick={handleApplyCustomDates}
                          className="w-full mt-1.5 py-2 px-3 rounded-lg bg-action hover:bg-action-hover text-white dark:border dark:border-cyan/35 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <span>Aplicar Datas</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Business Unit Selector Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setBuOpen(!buOpen);
                  setPeriodOpen(false);
                  setCompanyOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-elevated hover:bg-surface-hover border border-border hover:border-primary/50 text-text-primary transition-all duration-200"
                aria-expanded={buOpen}
              >
                <Building2 className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span className="truncate max-w-[130px]">
                  {filters.business_unit || 'Todas as BUs'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
              </button>

              {buOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setBuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 z-50 w-56 rounded-2xl bg-surface border border-border shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto text-xs">
                    <div className="text-xs font-display font-semibold text-text-muted px-2 py-1 uppercase tracking-wider">
                      Business Unit
                    </div>
                    <button
                      onClick={() => {
                        setFilter('business_unit', null);
                        setBuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        !filters.business_unit
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      <span>Todas as BUs</span>
                      {!filters.business_unit && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>

                    {buOptions.map((bu) => {
                      const isSelected = filters.business_unit === bu;
                      return (
                        <button
                          key={bu}
                          onClick={() => {
                            setFilter('business_unit', bu);
                            setBuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                          }`}
                        >
                          <span className="truncate">{bu}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Company Selector Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setCompanyOpen(!companyOpen);
                  setPeriodOpen(false);
                  setBuOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-elevated hover:bg-surface-hover border border-border hover:border-primary/50 text-text-primary transition-all duration-200"
                aria-expanded={companyOpen}
                aria-label="Filtro de Empresa"
              >
                <Briefcase className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span className="truncate max-w-[130px]">
                  {filters.company || 'Todas as Empresas'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
              </button>

              {companyOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setCompanyOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 z-50 w-56 rounded-2xl bg-surface border border-border shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto text-xs">
                    <div className="text-xs font-display font-semibold text-text-muted px-2 py-1 uppercase tracking-wider">
                      Empresa
                    </div>
                    <button
                      onClick={() => {
                        setFilter('company', null);
                        setCompanyOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        !filters.company
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      <span>Todas as Empresas</span>
                      {!filters.company && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>

                    {companyOptions.map((company) => {
                      const isSelected = filters.company === company;
                      return (
                        <button
                          key={company}
                          onClick={() => {
                            setFilter('company', company);
                            setCompanyOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                          }`}
                        >
                          <span className="truncate">{company}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Toggle Expandable Filters Button */}
            {onToggleFilters && (
              <button
                onClick={onToggleFilters}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 ${
                  filtersOpen || activeExtraCount > 0
                    ? 'bg-tint border-primary text-primary font-semibold'
                    : 'bg-surface-elevated hover:bg-surface-hover border-border hover:border-primary/50 text-text-primary'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>Filtros</span>
                {activeExtraCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-action text-white font-bold text-xs flex items-center justify-center">
                    {activeExtraCount}
                  </span>
                )}
              </button>
            )}
          </div>

          {activeFilters.length > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-action hover:bg-action-hover text-white dark:border dark:border-cyan/35 font-semibold text-xs transition-colors shadow-sm shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>

        {/* Active Filters Chips */}
        <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-2 text-xs" aria-label="Filtros ativos">
          <span className="text-text-muted">Filtros globais · aplicados na navegação</span>
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              onClick={() => setFilter(key as keyof typeof filters, null)}
              aria-label={`Remover filtro ${filterLabels[key] || key}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-tint-border bg-tint px-2.5 py-1 text-xs font-medium text-primary hover:bg-tint-hover transition-colors"
            >
              <span className="break-all">
                {filterLabels[key] || key}: {key === 'valid_purchases_gt' ? `> ${value}` : value}
              </span>
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
