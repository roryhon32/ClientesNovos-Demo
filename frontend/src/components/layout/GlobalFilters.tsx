import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useGlobalFilters, VALID_PURCHASES_MAX } from '../../context/FilterContext';
import { useFilterOptions } from '../../api/queries';

interface GlobalFiltersProps {
  isOpen: boolean;
  onClose: () => void;
}
const PURCHASE_THRESHOLDS = [1, 5, 10, 20];

const fieldClass =
  'w-full bg-surface-elevated border border-border text-text-primary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors';

export const GlobalFilters: React.FC<GlobalFiltersProps> = ({ isOpen, onClose }) => {
  const { filters, setFilter, clearFilters } = useGlobalFilters();
  const [customThreshold, setCustomThreshold] = useState(false);
  const [purchaseDraft, setPurchaseDraft] = useState('');
  const [purchaseError, setPurchaseError] = useState('');
  useEffect(() => {
    setPurchaseDraft(filters.valid_purchases_gt == null ? '' : String(filters.valid_purchases_gt));
    setCustomThreshold(filters.valid_purchases_gt != null && !PURCHASE_THRESHOLDS.includes(filters.valid_purchases_gt));
    setPurchaseError('');
  }, [filters.valid_purchases_gt]);
  const applyPurchaseThreshold = () => {
    const threshold = Number(purchaseDraft);
    if (!/^\d+$/.test(purchaseDraft) || !Number.isSafeInteger(threshold) || threshold < 0 || threshold > VALID_PURCHASES_MAX) {
      setPurchaseError(`Informe um número inteiro maior ou igual a zero e menor ou igual a ${VALID_PURCHASES_MAX}.`);
      return;
    }
    setPurchaseError('');
    setFilter('valid_purchases_gt', threshold);
  };

  const { data: companyData } = useFilterOptions('company', { ...filters, company: null });
  const { data: sellerData } = useFilterOptions('seller', filters);
  const { data: stateData } = useFilterOptions('state', filters);
  const { data: channelData } = useFilterOptions('sales_channel', filters);
  const { data: statusData } = useFilterOptions('customer_status', filters);

  const companies = companyData?.data?.items?.map((i) => i.value) || [];
  const sellers = sellerData?.data?.items?.map((i) => i.value) || [];
  const states = stateData?.data?.items?.map((i) => i.value) || [];
  const channels = channelData?.data?.items?.map((i) => i.value) || [];
  const statuses = statusData?.data?.items?.map((i) => i.value) || [];

  if (!isOpen) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 mb-6 relative z-30 animate-fadeIn shadow-md">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider text-text-primary">
            Filtros Globais Analíticos
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-action hover:bg-action-hover text-white dark:border dark:border-cyan/35 transition-colors shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar tudo</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Fechar filtros"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="sm:col-span-2">
          <label htmlFor="global-company" className="block text-xs font-medium text-text-secondary mb-1.5">Empresa</label>
          <select id="global-company" value={filters.company || ''}
            onChange={event => setFilter('company', event.target.value || null)}
            className={fieldClass}>
            <option value="">Todas as Empresas</option>
            {filters.company && !companies.includes(filters.company) && <option value={filters.company}>{filters.company}</option>}
            {companies.map(company => <option key={company} value={company}>{company}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="global-valid-purchases" className="block text-xs font-medium text-text-secondary mb-1.5">Compras válidas</label>
          <select id="global-valid-purchases" value={customThreshold ? 'custom' : filters.valid_purchases_gt == null ? '' : String(filters.valid_purchases_gt)}
            onChange={event => {
              setPurchaseError('');
              if (event.target.value === 'custom') {
                setCustomThreshold(true);
                return;
              }
              setCustomThreshold(false);
              setFilter('valid_purchases_gt', event.target.value === '' ? null : Number(event.target.value));
            }} className={fieldClass}>
            <option value="">Todos os clientes</option>
            {PURCHASE_THRESHOLDS.map(threshold => <option key={threshold} value={threshold}>Mais de {threshold} {threshold === 1 ? 'compra válida' : 'compras válidas'} (&gt;{threshold})</option>)}
            <option value="custom">Limite personalizado</option>
          </select>
          {customThreshold && <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex-1 text-xs text-text-secondary">Total de compras maior que
              <input type="number" min="0" max={VALID_PURCHASES_MAX} step="1" value={purchaseDraft} onChange={event => setPurchaseDraft(event.target.value)} aria-describedby={purchaseError ? 'purchase-threshold-error' : 'purchase-threshold-help'}
                className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary" />
            </label>
            <button type="button" onClick={applyPurchaseThreshold} className="rounded-lg bg-action hover:bg-action-hover dark:border dark:border-cyan/35 px-3 py-2 text-xs font-semibold text-white">Aplicar limite</button>
          </div>}
          <p id="purchase-threshold-help" className="mt-1.5 text-xs text-text-muted">Total de notas distintas válidas do cliente até a data de referência, independente do período selecionado. Devoluções não contam.</p>
          {purchaseError && <p id="purchase-threshold-error" role="alert" className="mt-1 text-xs text-negative font-medium">{purchaseError}</p>}
        </div>
        {/* Vendedor */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Vendedor
          </label>
          <select
            value={filters.seller || ''}
            onChange={(e) => setFilter('seller', e.target.value || null)}
            className={fieldClass}
          >
            <option value="">Todos os Vendedores</option>
            {sellers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Estado (UF)
          </label>
          <select
            value={filters.state || ''}
            onChange={(e) => setFilter('state', e.target.value || null)}
            className={fieldClass}
          >
            <option value="">Todos os Estados</option>
            {states.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* Canal de Venda */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Canal de Venda
          </label>
          <select
            value={filters.sales_channel || ''}
            onChange={(e) => setFilter('sales_channel', e.target.value || null)}
            className={fieldClass}
          >
            <option value="">Todos os Canais</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Status do Cliente */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Status Atual
          </label>
          <select
            value={filters.customer_status || ''}
            onChange={(e) => setFilter('customer_status', e.target.value || null)}
            className={fieldClass}
          >
            <option value="">Todos os Status</option>
            {statuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* Data Inicial */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Data Inicial (Transação)
          </label>
          <input
            type="date"
            value={filters.start_date || ''}
            onChange={(e) => setFilter('start_date', e.target.value || null)}
            className={`${fieldClass} [color-scheme:light]`}
          />
        </div>

        {/* Data Final */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Data Final (Transação)
          </label>
          <input
            type="date"
            value={filters.end_date || ''}
            onChange={(e) => setFilter('end_date', e.target.value || null)}
            className={`${fieldClass} [color-scheme:light]`}
          />
        </div>

        {/* Safra de Aquisição */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Safra de Entrada (Cohort)
          </label>
          <input
            type="text"
            placeholder="Ex: 2024-05"
            value={filters.acquisition_cohort || ''}
            onChange={(e) => setFilter('acquisition_cohort', e.target.value || null)}
            className={`${fieldClass} placeholder:text-text-muted`}
          />
        </div>

        {/* Município */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Município
          </label>
          <input
            type="text"
            placeholder="Ex: São Paulo"
            value={filters.city || ''}
            onChange={(e) => setFilter('city', e.target.value || null)}
            className={`${fieldClass} placeholder:text-text-muted`}
          />
        </div>
      </div>
    </div>
  );
};
