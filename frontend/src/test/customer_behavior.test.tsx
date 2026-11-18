import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerBehaviorPanel } from '../components/customers/CustomerBehaviorPanel';
import { CustomerDetailDrawer } from '../components/customers/CustomerDetailDrawer';
import type { CustomerBehavior, ProductBehavior } from '../api/behavior';

const mocks = vi.hoisted(() => ({ behavior: vi.fn(), detail: vi.fn(), items: vi.fn() }));
vi.mock('../api/behavior', () => ({ useCustomerBehavior: mocks.behavior }));
vi.mock('../api/queries', () => ({
  useCustomerDetail: mocks.detail,
  useCustomerItems: mocks.items,
  useCustomerPublicCnpj: () => ({ data: null, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }),
}));

const finance = { faturamento_contabil: 100, faturamento_liquido: 80, impostos: 20, percentual_impostos: 20, margem_bruta_valor: 16, margem_bruta_percentual: 20 };
const product: ProductBehavior = {
  ...finance, product_id: 'P-SYN-1', descriptions: ['Produto sintético 1'], business_units: ['BU Sintética A'], quantity: 10,
  documents: 3, occasions: 2, first_purchase: '2026-01-10', last_purchase: '2026-02-10', mean_days_between_purchases: 31, repurchased: true,
};
const behavior: CustomerBehavior = {
  summary: { ...finance, valid_documents: 3, occasions: 3, general_repurchase: true, same_bu_repurchase: true, same_product_repurchase: true, mean_days_between_purchases: 15.5, predominant_business_units: ['BU Sintética A', 'BU Sintética B'], occasion_mode: 'dates' },
  business_units: [{ ...finance, business_unit: 'BU Sintética A', documents: 3, occasions: 2, repurchased: true, net_share_pct: 50 }],
  monthly_business_units: [{ ...finance, month: '2026-01-01', business_unit: 'BU Sintética A', documents: 2 }],
  first_products: [
    { product_id: 'P-SYN-1', descriptions: ['Primeiro produto sintético'], business_units: ['BU Sintética A'], date: '2026-01-10', documents: 1 },
    { product_id: 'P-SYN-2', descriptions: ['Outro primeiro produto sintético'], business_units: ['BU Sintética B'], date: '2026-01-10', documents: 1 },
  ],
  top_products_quantity: [product], top_products_revenue: [product], products: [product],
  mix: { current_start: '2026-02-01', current_end: '2026-02-28', previous_start: '2026-01-04', previous_end: '2026-01-31', period_basis: 'explicit_equal_days', previous_period_complete: false, new_in_period: ['P-SYN-1'], resumed_products: ['P-SYN-3'], not_observed_in_period: ['P-SYN-2'], retained_products: [], current_products: 1, previous_products: 1, current_top_product_share_pct: 100, previous_top_product_share_pct: 100, concentration_basis: 'valid_purchase_net_revenue' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.behavior.mockReturnValue({ data: { meta: { reference_date: '2026-02-28' }, data: behavior }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
  mocks.detail.mockReturnValue({ data: { data: { customer: { customer_id: '00000001', name: 'Nome Sintético', customer_names: ['Nome Sintético'], real_customer_names: ['Cliente REAL Sintético'], valid_purchases: 3, status: 'RECORRENTE', ...finance }, monthly_history: [] } }, isLoading: false, error: null, refetch: vi.fn() });
});
afterEach(cleanup);

describe('Dossiê de comportamento de compra', () => {
  it('preserva empates da BU e primeiros produtos, e distingue bases de recompra', () => {
    render(<CustomerBehaviorPanel customerId="00000001" />);
    expect(screen.getByText('BU Sintética A / BU Sintética B')).toBeInTheDocument();
    expect(screen.getByText('Primeiro produto sintético')).toBeInTheDocument();
    expect(screen.getByText('Outro primeiro produto sintético')).toBeInTheDocument();
    expect(screen.getByText('3 documentos distintos')).toBeInTheDocument();
    expect(screen.getByText('Mesmo produto em pelo menos duas datas distintas.')).toBeInTheDocument();
    expect(screen.getByText('Pelo menos dois documentos na mesma BU.')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Datas distintas' })).toBeInTheDocument();
    expect(screen.getByText('31 dias')).toBeInTheDocument();
    expect(screen.getByText(/não determina abandono/)).toBeInTheDocument();
    expect(screen.getByText(/a comparação é parcial/)).toBeInTheDocument();
    expect(screen.getByText('Voltaram ao mix (1)')).toBeInTheDocument();
  });

  it('repassa o período e filtros combinados sem recalcular métricas no frontend', () => {
    const filters = { start_date: '2026-02-01', end_date: '2026-02-28', business_unit: 'BU Sintética A', seller: 'Vendedor Sintético' };
    const view = render(<CustomerBehaviorPanel customerId="00000001" filters={filters} />);
    expect(mocks.behavior).toHaveBeenLastCalledWith('00000001', filters);
    view.rerender(<CustomerBehaviorPanel customerId="00000001" filters={{ ...filters, business_unit: 'BU Sintética B' }} />);
    expect(mocks.behavior).toHaveBeenLastCalledWith('00000001', { ...filters, business_unit: 'BU Sintética B' });
  });

  it('busca no mix sem esconder os indicadores e permite limpar resultados vazios', () => {
    render(<CustomerBehaviorPanel customerId="00000001" />);
    fireEvent.change(screen.getByLabelText('Buscar no mix do cliente'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum produto encontrado')).toBeInTheDocument();
    expect(screen.getByText('Modalidades de recompra no recorte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByRole('columnheader', { name: 'Intervalo médio' })).toBeInTheDocument();
  });

  it('apresenta carregamento, recuperação de erro e estado sem compras válidas', () => {
    const refetch = vi.fn();
    mocks.behavior.mockReturnValue({ isLoading: true });
    const view = render(<CustomerBehaviorPanel customerId="00000001" />);
    expect(screen.getByRole('status', { name: 'Carregando comportamento de compra' })).toBeInTheDocument();
    mocks.behavior.mockReturnValue({ error: new Error('synthetic failure'), refetch });
    view.rerender(<CustomerBehaviorPanel customerId="00000001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
    mocks.behavior.mockReturnValue({ data: { data: { ...behavior, summary: { ...behavior.summary, valid_documents: 0, faturamento_contabil: -100, faturamento_liquido: -80, impostos: -20, margem_bruta_valor: -16 } } }, refetch });
    view.rerender(<CustomerBehaviorPanel customerId="00000001" />);
    expect(screen.getByText('Nenhuma compra válida no recorte')).toBeInTheDocument();
    expect(screen.getByText('Movimentos financeiros no recorte')).toBeInTheDocument();
    expect(screen.getByText('R$ -80,00')).toBeInTheDocument();
    expect(screen.getByText('R$ -100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ -20,00')).toBeInTheDocument();
    expect(screen.getByText('R$ -16,00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar análise' }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('carrega comportamento apenas ao abrir sua aba e identifica Cliente REAL como principal', () => {
    const filters = { start_date: '2026-01-01', business_unit: 'BU Sintética A' };
    const view = render(<CustomerDetailDrawer customerId={null} onClose={vi.fn()} filters={filters} />);
    expect(mocks.behavior).not.toHaveBeenCalled();
    view.rerender(<CustomerDetailDrawer customerId="00000001" onClose={vi.fn()} filters={filters} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cliente REAL Sintético');
    expect(screen.getByText('Nome Cliente: Nome Sintético')).toBeInTheDocument();
    expect(mocks.behavior).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Comportamento de compra' }));
    expect(mocks.behavior).toHaveBeenLastCalledWith('00000001', filters);
  });
});
