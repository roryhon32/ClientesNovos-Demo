import { ApiError } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export class ClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = 'unknown_error', status: number = 500) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchApi<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  signal?: AbortSignal
): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    let errorCode = `http_${response.status}`;
    let errorMessage = `Erro na requisição (${response.status})`;

    try {
      const data = (await response.json()) as ApiError;
      if (data && data.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
      }
    } catch {
      // Falha ao parsear JSON de erro
    }

    throw new ClientError(errorMessage, errorCode, response.status);
  }

  return response.json() as Promise<T>;
}
