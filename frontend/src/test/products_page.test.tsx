import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsPage } from '../pages/ProductsPage';

const mocks = vi.hoisted(() => ({
  ranking: vi.fn(),
  invoices: vi.fn(),
  setFilter: vi.fn(),
  toggleFilter: vi.fn(),
  refetch: vi.fn(),
  filters: {} as Record<string, string>,
}));
vi.mock('../api/behavior', () => ({
  useProductRepurchase: mocks.ranking,
  useProductInvoices: mocks.invoices,
}));
vi.mock('../api/queries', () => ({ useFilterOptions: () => ({ data: { data: { items: [{ value: 'Família sintética' }] } } }) }));
vi.mock('../context/FilterContext', () => ({ useGlobalFilters: () => ({ filters: mocks.filters, setFilter: mocks.setFilter, toggleFilter: mocks.toggleFilter }) }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => ({ current: null }) }));
vi.mock('../components/layout/Header', () => ({ Header: ({ title, onToggleFilters }: { title: string; onToggleFilters: () => void }) => <header><h1>{title}</h1><button onClick={onToggleFilters}>Filtros</button></header> }));
vi.mock('../components/layout/GlobalFilters', () => ({ GlobalFilters: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Filtros abertos</div> : null }));

const ranking = {
  items: [{ product_id: 'P-SYN', descriptions: ['Produto sintético'], customers: 10, eligible_customers: 8, excluded_recent_customers: 2, repurchased_customers: 4, repurchase_rate_pct: 50, minimum_observation_days: 0, maximum_observation_days: 200 }],
  pagination: { page: 1, page_size: 15, total_items: 30, total_pages: 2 }, min_observation_days: 0, observation_end: '2026-09-30', occasion_mode: 'dates',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.filters = { start_date: '2026-01-01', end_date: '2026-09-30', business_unit: 'Corporativo' };
  mocks.ranking.mockReturnValue({ data: { data: ranking }, refetch: mocks.refetch, isLoading: false, isFetching: false, error: null });
  mocks.invoices.mockReturnValue({ data: null, refetch: vi.fn(), isLoading: false, isFetching: false, error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Produtos e recompra', () => {
  it('exibe taxa recebida, denominadores e oportunidade de observação sem recalcular médias', () => {
    render(<ProductsPage />);
    const table = within(screen.getByRole('table'));
    expect(table.getByText('50,0%')).toBeInTheDocument();
    expect(table.getByText('10')).toBeInTheDocument();
    expect(table.getByText('8')).toBeInTheDocument();
    expect(table.getByText('4')).toBeInTheDocument();
    expect(table.getByText('2')).toBeInTheDocument();
    expect(table.getByText('0 / 200 dias')).toBeInTheDocument();
    expect(screen.getByText(/duas datas de emissão distintas/)).toBeInTheDocument();
    expect(mocks.ranking).toHaveBeenLastCalledWith(mocks.filters, expect.objectContaining({ min_observation_days: 0, page: 1 }));
  });

  it('pagina e reinicia a página ao mudar maturidade, busca ou ordenação', () => {
    render(<ProductsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo ranking' }));
    expect(mocks.ranking).toHaveBeenLastCalledWith(mocks.filters, expect.objectContaining({ page: 2 }));
    fireEvent.change(screen.getByLabelText('Observação mínima (dias)'), { target: { value: '90' } });
    expect(mocks.ranking).toHaveBeenLastCalledWith(mocks.filters, expect.objectContaining({ page: 1, min_observation_days: 90 }));
    fireEvent.change(screen.getByLabelText('Buscar produto'), { target: { value: 'P-SYN' } });
    act(() => vi.advanceTimersByTime(350));
    expect(mocks.ranking).toHaveBeenLastCalledWith(mocks.filters, expect.objectContaining({ page: 1, search: 'P-SYN' }));
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'customers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ordem: decrescente' }));
    expect(mocks.ranking).toHaveBeenLastCalledWith(mocks.filters, expect.objectContaining({ sort_by: 'customers', sort_order: 'asc' }));
  });

  it('seleciona produto e família como filtros de exploração e sinaliza o produto ativo', () => {
    mocks.filters.product = 'P-SYN';
    render(<ProductsPage />);
    const selectProduct = screen.getByRole('button', { name: 'Produto sintético P-SYN' });
    expect(selectProduct).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(selectProduct);
    expect(mocks.toggleFilter).toHaveBeenLastCalledWith('product', 'P-SYN');
    fireEvent.change(screen.getByLabelText('Família · nesta página'), { target: { value: 'Família sintética' } });
    expect(mocks.setFilter).toHaveBeenLastCalledWith('family', 'Família sintética');
  });

  it('mantém filtros disponíveis com erro e diferencia taxa indisponível, vazio e carregamento', () => {
    mocks.ranking.mockReturnValue({ error: new Error('synthetic failure'), refetch: mocks.refetch });
    const view = render(<ProductsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.getByText('Filtros abertos')).toBeInTheDocument();
    mocks.ranking.mockReturnValue({ data: { data: { ...ranking, items: [{ ...ranking.items[0], eligible_customers: 0, repurchase_rate_pct: null }] } } });
    view.rerender(<ProductsPage />);
    expect(within(screen.getByRole('table')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('0,0%')).not.toBeInTheDocument();
    mocks.ranking.mockReturnValue({ data: { data: { ...ranking, items: [] } } });
    view.rerender(<ProductsPage />);
    expect(screen.getByText('Nenhum produto encontrado')).toBeInTheDocument();
    mocks.ranking.mockReturnValue({ isLoading: true });
    view.rerender(<ProductsPage />);
    expect(screen.getByRole('status', { name: 'Carregando recompra por produto' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhum produto encontrado')).not.toBeInTheDocument();
  });

  it('permite expandir e recolher o detalhamento por código de produto', () => {
    mocks.ranking.mockReturnValue({
      data: {
        data: {
          ...ranking,
          items: [{
            ...ranking.items[0],
            code_details: [
              {
                code: 'COD-001',
                description: 'Item Teste A',
                customers: 6,
                eligible_customers: 5,
                excluded_recent_customers: 1,
                repurchased_customers: 3,
                repurchase_rate_pct: 60.0,
                minimum_observation_days: 10,
                maximum_observation_days: 150,
              },
            ],
          }],
        },
      },
      refetch: mocks.refetch,
      isLoading: false,
      isFetching: false,
      error: null,
    });
    render(<ProductsPage />);
    expect(screen.queryByText('COD-001')).not.toBeInTheDocument();
    const expandBtn = screen.getByRole('button', { name: /Expandir códigos de/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText('COD-001')).toBeInTheDocument();
    expect(screen.getByText('Item Teste A')).toBeInTheDocument();
    expect(screen.getByText('60,0%')).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: /Recolher códigos de/i });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('COD-001')).not.toBeInTheDocument();
  });

  it('permite expandir o código para visualizar as notas fiscais com cliente real, faturamento, MB e MB%', () => {
    mocks.ranking.mockReturnValue({
      data: {
        data: {
          ...ranking,
          items: [{
            ...ranking.items[0],
            code_details: [
              {
                code: 'COD-001',
                description: 'Item Teste A',
                customers: 6,
                eligible_customers: 5,
                excluded_recent_customers: 1,
                repurchased_customers: 3,
                repurchase_rate_pct: 60.0,
                minimum_observation_days: 10,
                maximum_observation_days: 150,
              },
            ],
          }],
        },
      },
      refetch: mocks.refetch,
      isLoading: false,
      isFetching: false,
      error: null,
    });
    mocks.invoices.mockReturnValue({
      data: {
        data: {
          items: [
            {
              num_docto: 'NF-1001',
              serie: '1',
              data_emissao: '2026-05-10',
              cliente_real: 'PADARIA REAL',
              nome_cliente: 'PADARIA REAL LTDA',
              raiz_cnpj: '12345678',
              faturamento_liquido: 1500.5,
              margem_bruta_valor: 750.25,
              margem_bruta_percentual: 52.5,
              itens: 2,
            },
          ],
          pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1 },
          code: 'COD-001',
        },
      },
      refetch: vi.fn(),
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<ProductsPage />);
    // Expand product first
    fireEvent.click(screen.getByRole('button', { name: /Expandir códigos de/i }));
    expect(screen.getByText('COD-001')).toBeInTheDocument();

    // Expand code to see invoices
    const expandCodeBtn = screen.getByRole('button', { name: /Expandir notas do código COD-001/i });
    fireEvent.click(expandCodeBtn);

    // Verify invoice fields are rendered
    expect(screen.getByText(/Notas Fiscais do Código COD-001/i)).toBeInTheDocument();
    expect(screen.getByText('NF-1001 - 1')).toBeInTheDocument();
    expect(screen.getByText('PADARIA REAL')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.500,50')).toBeInTheDocument();
    expect(screen.getByText('R$ 750,25')).toBeInTheDocument();
    expect(screen.getByText('52,5%')).toBeInTheDocument();
  });
});
