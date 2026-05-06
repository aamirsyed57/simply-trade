const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type PortfolioMode = 'paper' | 'live';
export type PortfolioStatus = 'active' | 'paused' | 'disabled';

export interface Portfolio {
  id: number;
  name: string;
  mode: PortfolioMode;
  status: PortfolioStatus;
  budget_total: number;
  cash_reserved: number;
  cash_deployed: number;
  realized_pnl: number;
  unrealized_pnl_cached: number;
  description?: string;
  cash_available?: number;
}

export interface CreatePortfolioPayload {
  name: string;
  mode: PortfolioMode;
  budget_total: number;
  description?: string;
}

export const portfolioApi = {
  list: () => request<Portfolio[]>('/portfolios'),
  get: (id: number) => request<Portfolio>(`/portfolios/${id}`),
  create: (data: CreatePortfolioPayload) =>
    request<Portfolio>('/portfolios', { method: 'POST', body: JSON.stringify(data) }),
  patch: (id: number, data: Partial<CreatePortfolioPayload>) =>
    request<Portfolio>(`/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/portfolios/${id}`, { method: 'DELETE' }),
};
