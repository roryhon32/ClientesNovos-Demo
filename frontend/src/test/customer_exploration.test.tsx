import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerItemsPanel } from '../components/customers/CustomerItemsPanel';
import { CustomerDetailDrawer } from '../components/customers/CustomerDetailDrawer';
import { CustomerTable } from '../components/customers/CustomerTable';
import { CustomersPage } from '../pages/CustomersPage';
import { Customer, CustomerItem } from '../api/types';

const mocks = vi.hoisted(() => ({
  useCustomerItems: vi.fn(), useCustomerDetail: vi.fn(), useCustomers: vi.fn(), useCustomerPublicCnpj: vi.fn(),
  filters: {} as Record<string, string>,
}));
vi.mock('../api/queries', () => ({
  useCustomerItems: mocks.useCustomerItems,
  useCustomerDetail: mocks.useCustomerDetail,
  useCustomers: mocks.useCustomers,
  useCustomerPublicCnpj: mocks.useCustomerPublicCnpj,
}));
vi.mock('../context/FilterContext', () => ({ useGlobalFilters: () => ({ filters: mocks.filters }) }));
vi.mock('../components/layout/Header', () => ({ Header: () => <h1>Clientes</h1> }));
vi.mock('../components/layout/GlobalFilters', () => ({ GlobalFilters: () => null }));
vi.mock('../hooks/useGsapEntrance', () => ({ useGsapPageEntrance: () => null }));

const customer: Customer = {
  customer_id: '00000001', name: 'CLIENTE SINTÉTICO', first_purchase: '2026-01-10', last_purchase: '2026-02-10', second_purchase: '2026-02-10',
  status: 'RECORRENTE', valid_purchases: 2, acquisition_business_units: ['BU A'], acquisition_sellers: ['VENDEDOR A'], days_without_purchase: 10,
  faturamento_contabil: 1000, faturamento_liquido: 850, impostos: 150, percentual_impostos: 15, margem_bruta_valor: 170,
  margem_bruta_percentual: 20, documentos_distintos: 2, clientes_identificados: 1, ticket_medio_contabil: 500, ticket_medio_liquido: 425,
  customer_names: ['NOME MATRIZ SINTÉTICO', 'NOME FILIAL SINTÉTICO'], real_customer_names: ['CLIENTE REAL SINTÉTICO'],
};
const item: CustomerItem = {
  identificador_item: 'synthetic-item', identificador_documento: 'synthetic-note', document_number: 'NF-SYN-001', branch: '0001', company: 'EMPRESA SINTÉTICA',
  customer_code: 'SYN-1', item: '01', data_emissao: '2026-01-10', codigo_produto: 'PROD-SYN', descricao_produto: 'PRODUTO SINTÉTICO',
  nome_cliente: 'NOME FILIAL DO ITEM', cliente_real: 'CLIENTE REAL DO ITEM',
  business_unit: 'BU A', familia: 'FAMÍLIA A', subfamilia: 'SUB A', vendedor: 'VENDEDOR A', estado: 'SP', municipio: 'CIDADE SINTÉTICA', canal_venda: 'CANAL A',
  quantidade_faturada: 2.5, quantidade_liquida: 2, status_origem: 'FATURADO', origem_transacao: 'MARGEM BRUTA POR NF', compra_valida: true,
  faturamento_contabil: 1000, faturamento_liquido: 850, impostos: 150, percentual_impostos: 15, margem_bruta_valor: -85, margem_bruta_percentual: -10,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.filters = {};
  mocks.useCustomerItems.mockReturnValue({ data: { meta: { reference_date: '2026-10-22' }, data: { items: [item], pagination: { page: 1, page_size: 15, total_items: 20, total_pages: 2 } } }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
  mocks.useCustomerDetail.mockReturnValue({ data: { data: { customer, monthly_history: [], purchase_indicators: null } }, isLoading: false, error: null, refetch: vi.fn() });
  mocks.useCustomers.mockReturnValue({ data: { data: { items: [customer], pagination: { page: 1, page_size: 15, total_items: 30, total_pages: 2 } } }, isLoading: false, error: null, refetch: vi.fn() });
  mocks.useCustomerPublicCnpj.mockReturnValue({ data: null, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Exploração do cliente', () => {
  it('separa ordenação por margem financeira e percentual', () => {
    const sort = vi.fn();
    render(<CustomerTable customers={[customer]} onSort={sort} sortBy="gross_margin_pct" sortOrder="desc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Margem Bruta %' }));
    expect(sort).toHaveBeenLastCalledWith('gross_margin_pct');
    fireEvent.click(screen.getByRole('button', { name: 'Margem Bruta (R$)' }));
    expect(sort).toHaveBeenLastCalledWith('gross_margin');
    expect(screen.getByRole('columnheader', { name: 'Margem Bruta %' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('mostra produto, quantidades, BU, nota e atributos de faturamento', () => {
    render(<CustomerItemsPanel customerId="00000001" />);
    expect(screen.getByText('PRODUTO SINTÉTICO')).toBeInTheDocument();
    expect(screen.getByText('PROD-SYN')).toBeInTheDocument();
    expect(screen.getByText('BU A')).toBeInTheDocument();
    expect(screen.getByText('VENDEDOR A')).toBeInTheDocument();
    expect(screen.getByText('NF-SYN-001')).toBeInTheDocument();
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.getByText('-10,0%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver detalhes'));
    expect(screen.getByText('EMPRESA SINTÉTICA / SYN-1')).toBeInTheDocument();
    expect(screen.getByText('CANAL A · CIDADE SINTÉTICA / SP')).toBeInTheDocument();
    expect(screen.getByText('NOME FILIAL DO ITEM')).toBeInTheDocument();
    expect(screen.getByText('CLIENTE REAL DO ITEM')).toBeInTheDocument();
  });

  it('pagina itens e reinicia na primeira página quando a busca muda', () => {
    render(<CustomerItemsPanel customerId="00000001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximos itens' }));
    expect(mocks.useCustomerItems).toHaveBeenLastCalledWith('00000001', expect.objectContaining({ page: 2 }), true);
    const search = screen.getByLabelText('Buscar produto ou nota');
    fireEvent.change(search, { target: { value: 'P' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(search, { target: { value: 'PROD-SYN' } });
    act(() => vi.advanceTimersByTime(200));
    expect(mocks.useCustomerItems).toHaveBeenLastCalledWith('00000001', expect.objectContaining({ page: 2, search: undefined }), true);
    act(() => vi.advanceTimersByTime(150));
    expect(mocks.useCustomerItems).toHaveBeenLastCalledWith('00000001', expect.objectContaining({ page: 1, search: 'PROD-SYN' }), true);
  });

  it('mantém período invertido local e desabilita a consulta', () => {
    render(<CustomerItemsPanel customerId="00000001" />);
    fireEvent.change(screen.getByLabelText('Emissão de'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Emissão até'), { target: { value: '2026-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('A data inicial');
    expect(mocks.useCustomerItems).toHaveBeenLastCalledWith('00000001', expect.anything(), false);
  });

  it('permite tentar novamente quando os itens falham e distingue uma lista vazia', () => {
    const retry = vi.fn();
    mocks.useCustomerItems.mockReturnValue({ error: new Error('failed'), refetch: retry });
    const view = render(<CustomerItemsPanel customerId="00000001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
    mocks.useCustomerItems.mockReturnValue({ data: { data: { items: [] } }, refetch: retry });
    view.rerender(<CustomerItemsPanel customerId="00000001" />);
    expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument();
  });

  it('abre a aba de itens e fecha o dossiê por Escape restaurando o scroll', () => {
    const close = vi.fn();
    const view = render(<CustomerDetailDrawer customerId="00000001" onClose={close} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('CLIENTE REAL SINTÉTICO');
    expect(screen.getByRole('button', { name: 'Fechar gaveta' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Produtos e notas' }));
    expect(screen.getByText('PRODUTO SINTÉTICO')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('mantém Nome Cliente e Cliente REAL separados na lista e no dossiê', () => {
    const view = render(<CustomerTable customers={[customer]} />);
    expect(screen.getByRole('button', { name: 'CLIENTE REAL SINTÉTICO' })).toBeInTheDocument();
    expect(screen.getByText('Nome Cliente: NOME MATRIZ SINTÉTICO / NOME FILIAL SINTÉTICO')).toBeInTheDocument();
    view.unmount();
    render(<CustomerDetailDrawer customerId="00000001" onClose={vi.fn()} />);
    expect(screen.getByText('Cliente REAL:')).toBeInTheDocument();
    expect(screen.getByText('CLIENTE REAL SINTÉTICO')).toBeInTheDocument();
    expect(screen.getByText('Nome Cliente:')).toBeInTheDocument();
    expect(screen.getByText('NOME MATRIZ SINTÉTICO / NOME FILIAL SINTÉTICO')).toBeInTheDocument();
  });

  it('cancela buscas antigas na página e envia a ordenação percentual correta à API', () => {
    render(<CustomersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Margem Bruta %' }));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'gross_margin_pct', sort_order: 'desc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Margem Bruta %' }));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ sort_order: 'asc' }));
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'CLI' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'CLIENTE' } });
    act(() => vi.advanceTimersByTime(200));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
    act(() => vi.advanceTimersByTime(150));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'CLIENTE', page: 1 }));
  });

  it('ordena por múltiplas colunas, permite trocar a coluna preferencial e remove min-w rígido no desktop', () => {
    const { container } = render(<CustomersPage />);
    expect(container.querySelector('table')?.className).not.toContain('min-w-[920px]');

    fireEvent.change(screen.getByLabelText('Adicionar critério de ordenação'), { target: { value: 'last_purchase' } });
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort_by: 'net_revenue',
        sort_order: 'desc',
        sort: 'net_revenue:desc,last_purchase:desc',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trocar coluna preferencial' }));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort_by: 'last_purchase',
        sort_order: 'desc',
        sort: 'last_purchase:desc,net_revenue:desc',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inverter direção de Receita Gerada' }));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort_by: 'last_purchase',
        sort_order: 'desc',
        sort: 'last_purchase:desc,net_revenue:asc',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover ordenação por Receita Gerada' }));
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort_by: 'last_purchase',
        sort_order: 'desc',
      })
    );
    expect(mocks.useCustomers.mock.calls.at(-1)?.[0]).not.toHaveProperty('sort');
  });

  it('exibe canal de venda, localização, empresas e famílias no dossiê do cliente', () => {
    mocks.useCustomerDetail.mockReturnValue({
      data: {
        data: {
          customer,
          monthly_history: [],
          purchase_indicators: null,
          commercial_profile: {
            safra_aquisicao: '2026-01',
            acquisition_channels: ['DISTRIBUIÇÃO'],
            acquisition_states: ['SP'],
            acquisition_cities: ['SÃO PAULO'],
            dias_ate_segunda_compra: 31,
            intervalo_medio_entre_compras: 31,
            sales_channels: ['DISTRIBUIÇÃO', 'VAREJO'],
            business_units: ['BU A'],
            sellers: ['VENDEDOR A'],
            companies: ['EMPRESA SINTÉTICA'],
            states: ['SP'],
            cities: ['SÃO PAULO'],
            families: ['FAMÍLIA A'],
            channel_breakdown: [
              { channel: 'DISTRIBUIÇÃO', faturamento_contabil: 1000, faturamento_liquido: 850, margem_bruta_valor: 170, margem_bruta_percentual: 20, documents: 2 },
            ],
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CustomerDetailDrawer customerId="00000001" onClose={vi.fn()} />);
    expect(screen.getByText('Canais de Venda, Localização e Atendimento')).toBeInTheDocument();
    expect(screen.getAllByText('DISTRIBUIÇÃO').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('EMPRESA SINTÉTICA')).toBeInTheDocument();
    expect(screen.getByText('SÃO PAULO')).toBeInTheDocument();
    expect(screen.getByText('FAMÍLIA A')).toBeInTheDocument();
    expect(screen.getByText('Ticket Médio Líq.')).toBeInTheDocument();
  });

  it('consulta dados públicos do CNPJ na Receita Federal sob demanda no dossiê', () => {
    const publicProfile = {
      cnpj: '00000001000136',
      cnpj_formatted: '00.000.001/0001-36',
      razao_social: 'EMPRESA MATRIZ PUBLICA LTDA',
      nome_fantasia: 'MATRIZ PUBLICA',
      situacao_cadastral: 'ATIVA',
      data_situacao_cadastral: '2020-01-10',
      data_inicio_atividade: '2018-05-01',
      cnae_principal_codigo: '6201-5/01',
      cnae_principal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
      cnaes_secundarios: [{ codigo: '6202-3/00', descricao: 'Desenvolvimento de software customizável' }],
      porte: 'DEMAIS',
      natureza_juridica: 'Sociedade Empresária Limitada',
      capital_social: 500000,
      logradouro: 'AV PAULISTA',
      numero: '1000',
      complemento: 'SALA 10',
      bairro: 'BELA VISTA',
      municipio: 'SAO PAULO',
      uf: 'SP',
      cep: '01310-100',
      source: 'BrasilAPI',
      fetched_at: '2026-11-16T12:00:00Z',
      cached: true,
    };

    mocks.useCustomerPublicCnpj.mockImplementation((_id: string, enabled: boolean) => ({
      data: enabled ? { data: publicProfile } : null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<CustomerDetailDrawer customerId="00000001" onClose={vi.fn()} />);
    expect(mocks.useCustomerPublicCnpj).toHaveBeenCalledWith('00000001', false, false);

    fireEvent.click(screen.getByRole('button', { name: /Consultar Receita Federal/i }));
    expect(mocks.useCustomerPublicCnpj).toHaveBeenLastCalledWith('00000001', true, false);
    expect(screen.getByText('EMPRESA MATRIZ PUBLICA LTDA')).toBeInTheDocument();
    expect(screen.getByText('ATIVA')).toBeInTheDocument();
    expect(screen.getByText(/Desenvolvimento de programas de computador sob encomenda/)).toBeInTheDocument();
    expect(screen.getByText(/DEMAIS/)).toBeInTheDocument();
    expect(screen.getByText(/SAO PAULO\/SP/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar/i })).toBeInTheDocument();
  });
});
