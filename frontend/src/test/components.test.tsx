import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Users, DollarSign } from 'lucide-react';
import { MetricCard } from '../components/common/MetricCard';
import { TrendBadge } from '../components/common/TrendBadge';
import { Sparkline } from '../components/common/Sparkline';
import { CustomerTable } from '../components/customers/CustomerTable';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { SyntheticBadge } from '../components/common/SyntheticBadge';

describe('UI Components Unit Tests', () => {
  describe('MetricCard', () => {
    it('renders title, value and trend badge', () => {
      render(
        <MetricCard
          title="Novos Clientes"
          value="482"
          icon={Users}
          trend={24.0}
          comparisonLabel="vs. período anterior"
        />
      );

      expect(screen.getByText('Novos Clientes')).toBeInTheDocument();
      expect(screen.getByText('482')).toBeInTheDocument();
      expect(screen.getByText('24,0%')).toBeInTheDocument();
      expect(screen.getByText('vs. período anterior')).toBeInTheDocument();
    });

    it('renders skeleton loading state when loading is true', () => {
      const { container } = render(
        <MetricCard
          title="Novos Clientes"
          value="482"
          icon={Users}
          loading={true}
        />
      );

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(screen.queryByText('Novos Clientes')).not.toBeInTheDocument();
    });
  });

  describe('TrendBadge', () => {
    it('displays green favorable indicator when positive and favorable is true', () => {
      const { container } = render(
        <TrendBadge value={12.5} isFavorablePositive={true} />
      );

      expect(screen.getByText('12,5%')).toBeInTheDocument();
      expect(container.querySelector('.text-positive')).toBeInTheDocument();
    });

    it('displays red indicator when positive but favorable is false (e.g. churn/taxes)', () => {
      const { container } = render(
        <TrendBadge value={5.0} isFavorablePositive={false} />
      );

      expect(screen.getByText('5,0%')).toBeInTheDocument();
      expect(container.querySelector('.text-negative')).toBeInTheDocument();
    });

    it('displays unavailable message on null', () => {
      render(<TrendBadge value={null} />);
      expect(screen.getByText('Sem comparação válida')).toBeInTheDocument();
    });
  });

  describe('Sparkline', () => {
    it('renders svg with path when data has >= 2 points', () => {
      const { container } = render(<Sparkline data={[10, 20, 15, 30]} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
      expect(container.querySelector('path')).toBeInTheDocument();
    });

    it('returns null when data has < 2 points', () => {
      const { container } = render(<Sparkline data={[10]} />);
      expect(container.querySelector('svg')).toBeNull();
    });
  });

  describe('CustomerTable', () => {
    const mockCustomers = [
      {
        customer_id: '00000001',
        name: 'CLIENTE SINTETICO 00000001',
        first_purchase: '2020-01-01',
        last_purchase: '2026-10-12',
        second_purchase: '2020-01-01',
        status: 'RECORRENTE',
        valid_purchases: 5,
        acquisition_business_units: ['BU SINTETICA A'],
        acquisition_sellers: ['VENDEDOR 1'],
        days_without_purchase: 10,
        faturamento_contabil: 1000,
        faturamento_liquido: 850,
        impostos: 150,
        percentual_impostos: 15,
        margem_bruta_valor: 255,
        margem_bruta_percentual: 30.0,
        documentos_distintos: 5,
        clientes_identificados: 1,
        ticket_medio_contabil: 200,
        ticket_medio_liquido: 170,
      },
    ];

    it('renders customer rows, avatar and status badge', () => {
      const onSelect = vi.fn();
      render(
        <CustomerTable
          customers={mockCustomers}
          onSelectCustomer={onSelect}
        />
      );

      expect(screen.getByText('Nome Cliente: CLIENTE SINTETICO 00000001')).toBeInTheDocument();
      expect(screen.getByText('RECORRENTE')).toBeInTheDocument();
      expect(screen.getByText('01/01/2020')).toBeInTheDocument();
      expect(screen.getByText('12/10/2026')).toBeInTheDocument();
      expect(screen.getByText('Última Compra')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Nome Cliente: CLIENTE SINTETICO 00000001'));
      expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);
    });

    it('triggers sort callback when header is clicked', () => {
      const onSort = vi.fn();
      render(
        <CustomerTable
          customers={mockCustomers}
          onSort={onSort}
        />
      );

      fireEvent.click(screen.getByRole('columnheader', { name: 'Cliente REAL / Nome Cliente' }));
      expect(onSort).toHaveBeenCalledWith('name');

      fireEvent.click(screen.getByRole('columnheader', { name: /Última Compra/i }));
      expect(onSort).toHaveBeenCalledWith('last_purchase');
    });
  });

  describe('Empty and Error States', () => {
    it('renders EmptyState with custom message', () => {
      render(
        <EmptyState
          title="Sem clientes"
          message="Nenhum registro para o período."
        />
      );

      expect(screen.getByText('Sem clientes')).toBeInTheDocument();
      expect(screen.getByText('Nenhum registro para o período.')).toBeInTheDocument();
    });

    it('renders ErrorState with retry button', () => {
      const onRetry = vi.fn();
      render(
        <ErrorState
          title="Erro de API"
          message="Falha de conexão."
          onRetry={onRetry}
        />
      );

      expect(screen.getByText('Erro de API')).toBeInTheDocument();
      const retryBtn = screen.getByText('Tentar novamente');
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('SyntheticBadge', () => {
    it('renders synthetic environment indicator', () => {
      render(<SyntheticBadge />);
      expect(screen.getByText('Dados Sintéticos')).toBeInTheDocument();
      expect(screen.getByText('DuckDB')).toBeInTheDocument();
    });
  });
});
