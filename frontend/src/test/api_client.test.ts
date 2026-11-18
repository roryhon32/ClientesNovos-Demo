import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchApi, ClientError } from '../api/client';

describe('API Client Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out undefined and null query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    });
    globalThis.fetch = fetchMock;

    await fetchApi('/overview', {
      start_date: '2024-01-01',
      end_date: null,
      business_unit: undefined,
      city: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('start_date=2024-01-01');
    expect(calledUrl).not.toContain('end_date');
    expect(calledUrl).not.toContain('business_unit');
    expect(calledUrl).not.toContain('city');
  });

  it('throws ClientError on HTTP 422 with backend error code and message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: 'invalid_request',
          message: 'Parâmetros inválidos ou cruzamento ainda não definido',
        },
      }),
    });
    globalThis.fetch = fetchMock;

    await expect(fetchApi('/overview', { start_date: 'invalid' })).rejects.toThrow(
      'Parâmetros inválidos ou cruzamento ainda não definido'
    );
  });

  it('throws ClientError on HTTP 503 database unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'database_unavailable',
          message: 'Serviço analítico temporariamente indisponível',
        },
      }),
    });
    globalThis.fetch = fetchMock;

    try {
      await fetchApi('/overview');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      const clientErr = err as ClientError;
      expect(clientErr.status).toBe(503);
      expect(clientErr.code).toBe('database_unavailable');
    }
  });
});
