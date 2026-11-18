import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDate,
  selectedSingleMonth,
} from '../hooks/useFormatters';

describe('Formatters - pt-BR Locale and Business Rules', () => {
  describe('formatCurrency', () => {
    it('formats normal values with R$ and decimals', () => {
      const res = formatCurrency(1234.56);
      expect(res).toContain('1.234,56');
      expect(res).toContain('R$');
    });

    it('returns dash on null, undefined or NaN without inventing numbers', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency(NaN)).toBe('—');
    });

    it('formats compact values correctly in pt-BR', () => {
      expect(formatCurrency(1_250_000, { compact: true })).toContain('1,25 mi');
      expect(formatCurrency(45_000, { compact: true })).toContain('45,0 mil');
      expect(formatCurrency(2_100_000_000, { compact: true })).toContain('2,1 bi');
    });

    it('handles negative currency values accurately', () => {
      const res = formatCurrency(-500.5);
      expect(res).toContain('-500,50');
    });
  });

  describe('formatPercent', () => {
    it('formats percentages with pt-BR comma', () => {
      expect(formatPercent(31.8)).toBe('31,8%');
      expect(formatPercent(100.0)).toBe('100,0%');
    });

    it('returns dash on null or undefined', () => {
      expect(formatPercent(null)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
      expect(formatPercent(NaN)).toBe('—');
    });

    it('supports sign prefix for variation indicators', () => {
      expect(formatPercent(15.4, { includeSign: true })).toBe('+15,4%');
      expect(formatPercent(-8.2, { includeSign: true })).toBe('-8,2%');
    });
  });

  describe('formatNumber', () => {
    it('formats integer counts with thousand separators', () => {
      expect(formatNumber(1482)).toBe('1.482');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(null)).toBe('—');
    });
  });

  describe('formatDate', () => {
    it('formats ISO dates to pt-BR DD/MM/YYYY', () => {
      expect(formatDate('2026-10-22')).toBe('22/10/2026');
      expect(formatDate('2024-01-01')).toBe('01/01/2024');
    });

    it('formats month-year representation', () => {
      expect(formatDate('2024-05-01', 'month-year')).toBe('Mai 2024');
      expect(formatDate('2026-10-22', 'month-year')).toBe('Out 2026');
    });

    it('returns dash on null or empty', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate('')).toBe('—');
    });
  });

  describe('selectedSingleMonth', () => {
    it('destaca mês apenas quando o recorte pertence ao mesmo mês', () => {
      expect(selectedSingleMonth('2026-09-01', '2026-09-30')).toBe('2026-09');
      expect(selectedSingleMonth('2026-01-01', '2026-12-31')).toBeUndefined();
      expect(selectedSingleMonth('2026-01-01', null)).toBeUndefined();
      expect(selectedSingleMonth(null, null)).toBeUndefined();
    });
  });
});
