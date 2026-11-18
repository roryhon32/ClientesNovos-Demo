import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryFilters } from '../api/types';

export const GLOBAL_FILTER_KEYS = ['start_date', 'end_date', 'company', 'business_unit', 'seller', 'state', 'city', 'sales_channel', 'customer_status', 'acquisition_cohort', 'valid_purchases_gt'] as const;
export const VALID_PURCHASES_MAX = 2_147_483_647;
const FILTER_KEYS = [...GLOBAL_FILTER_KEYS, 'family', 'product'] as const;
interface FilterContextType {
  filters: QueryFilters;
  setFilter: (key: keyof QueryFilters, value: string | number | null) => void;
  updateFilters: (values: Partial<QueryFilters>) => void;
  toggleFilter: (key: keyof QueryFilters, value: string) => void;
  toggleMonth: (period: string) => void;
  setPeriodPreset: (presetKey: string) => void;
  activePeriodPreset: string;
  clearFilters: () => void;
}
const FilterContext = createContext<FilterContextType | undefined>(undefined);
export const PERIOD_PRESETS: Record<string, { label: string; start: string | null; end: string | null }> = {
  all: { label: 'Todo o Histórico', start: null, end: null },
  ...Object.fromEntries([2026, 2025, 2024, 2023, 2022, 2021, 2020].map(year => [String(year), { label: `Ano ${year}`, start: `${year}-01-01`, end: `${year}-12-31` }])),
};
function read(params: URLSearchParams): QueryFilters {
  return Object.fromEntries(FILTER_KEYS.map(key => [key, key === 'valid_purchases_gt'
    ? purchaseThreshold(params.get(key)) : params.get(key) || null]));
}
function purchaseThreshold(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || !/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= VALID_PURCHASES_MAX ? number : null;
}
function globalOnly(filters: QueryFilters): QueryFilters {
  return Object.fromEntries(GLOBAL_FILTER_KEYS.map(key => [key, filters[key] ?? null]));
}

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [shared, setShared] = useState(() => globalOnly(read(params)));
  const lastPath = useRef(location.pathname);
  const inherit = lastPath.current !== location.pathname && !GLOBAL_FILTER_KEYS.some(key => params.has(key));
  const effectiveParams = new URLSearchParams(params);
  if (inherit) GLOBAL_FILTER_KEYS.forEach(key => { if (shared[key] !== null && shared[key] !== undefined) effectiveParams.set(key, String(shared[key])); });
  if (effectiveParams.has('valid_purchases_gt')) {
    const threshold = purchaseThreshold(effectiveParams.get('valid_purchases_gt'));
    if (threshold === null) effectiveParams.delete('valid_purchases_gt');
    else effectiveParams.set('valid_purchases_gt', String(threshold));
  }
  const filters = read(effectiveParams);
  const paramsRef = useRef(effectiveParams);
  paramsRef.current = effectiveParams;
  const canonical = effectiveParams.toString();

  useLayoutEffect(() => {
    lastPath.current = location.pathname;
    const next = globalOnly(read(new URLSearchParams(canonical)));
    setShared(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, [location.pathname, canonical, params, setParams]);
  useEffect(() => {
    if (canonical !== params.toString()) setParams(new URLSearchParams(canonical), { replace: true });
  }, [canonical, params, setParams]);

  const updateFilters = (values: Partial<QueryFilters>) => {
    const next = new URLSearchParams(paramsRef.current);
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'valid_purchases_gt') {
        const threshold = purchaseThreshold(value);
        if (threshold !== null) next.set(key, String(threshold));
        else if (value === null || value === undefined || value === '') next.delete(key);
      } else if (typeof value === 'string' && value !== 'ALL' && value.trim()) next.set(key, value.trim());
      else next.delete(key);
    });
    paramsRef.current = next;
    setShared(globalOnly(read(next)));
    setParams(next, { replace: true });
  };
  const setFilter = (key: keyof QueryFilters, value: string | number | null) => updateFilters({ [key]: value });
  const toggleFilter = (key: keyof QueryFilters, value: string) => setFilter(key, paramsRef.current.get(key) === value ? null : value);
  const toggleMonth = (period: string) => {
    const start = `${period.slice(0, 7)}-01`;
    const [year, month] = start.split('-').map(Number);
    const end = `${period.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    const selected = paramsRef.current.get('start_date') === start && paramsRef.current.get('end_date') === end;
    updateFilters({ start_date: selected ? null : start, end_date: selected ? null : end });
  };
  const setPeriodPreset = (key: string) => {
    const preset = PERIOD_PRESETS[key] || PERIOD_PRESETS.all;
    updateFilters({ start_date: preset.start, end_date: preset.end });
  };
  const activePeriodPreset = useMemo(() => {
    if (!filters.start_date && !filters.end_date) return 'all';
    return Object.entries(PERIOD_PRESETS).find(([, preset]) => preset.start === filters.start_date && preset.end === filters.end_date)?.[0] || 'custom';
  }, [filters.start_date, filters.end_date]);
  const clearFilters = () => updateFilters(Object.fromEntries(FILTER_KEYS.map(key => [key, null])));
  return <FilterContext.Provider value={{ filters, setFilter, updateFilters, toggleFilter, toggleMonth, setPeriodPreset, activePeriodPreset, clearFilters }}>{children}</FilterContext.Provider>;
};
export function useGlobalFilters() {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useGlobalFilters must be used within a FilterProvider');
  return context;
}
