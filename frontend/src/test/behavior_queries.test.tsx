import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCustomerBehavior, useProductRepurchase } from '../api/behavior';
import { fetchApi } from '../api/client';

vi.mock('../api/client', () => ({ fetchApi: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Provider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('Consultas de comportamento', () => {
  it('não consulta cliente fechado ou identificador inválido e envia filtros combinados quando aberto', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: { summary: { valid_documents: 2 } } });
    const filters = { start_date: '2026-09-01', end_date: '2026-09-30', business_unit: 'Corporativo' };
    const { result, rerender } = renderHook(({ id, enabled }) => useCustomerBehavior(id, filters, enabled), { wrapper: provider(), initialProps: { id: null as string | null, enabled: false } });
    await act(async () => {});
    expect(fetchApi).not.toHaveBeenCalled();
    rerender({ id: 'inválido', enabled: true });
    expect(fetchApi).not.toHaveBeenCalled();
    rerender({ id: '00000001', enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchApi).toHaveBeenCalledWith('/customers/00000001/behavior', filters, expect.any(AbortSignal));
  });

  it('atualiza o ranking com período, BU, maturidade e paginação sem reutilizar resposta de outra seleção', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: { items: [], pagination: { page: 1 } } });
    const filters = { start_date: '2026-09-01', end_date: '2026-09-30', business_unit: 'Corporativo' };
    const { result, rerender } = renderHook(({ businessUnit, page }) => useProductRepurchase({ ...filters, business_unit: businessUnit }, { page, page_size: 15, min_observation_days: 90 }), { wrapper: provider(), initialProps: { businessUnit: 'Corporativo', page: 1 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchApi).toHaveBeenLastCalledWith('/products/repurchase', { ...filters, page: 1, page_size: 15, min_observation_days: 90 }, expect.any(AbortSignal));
    rerender({ businessUnit: 'Sintética', page: 2 });
    await waitFor(() => expect(fetchApi).toHaveBeenLastCalledWith('/products/repurchase', { ...filters, business_unit: 'Sintética', page: 2, page_size: 15, min_observation_days: 90 }, expect.any(AbortSignal)));
  });
});
