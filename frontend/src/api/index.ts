const BASE = '/api/v1';
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Symbol {
  id: number;
  ticker: string;
  exchange: string;
  asset_class: string;
  contract_meta: Record<string, unknown>;
}

export interface CreateSymbolPayload {
  ticker: string;
  exchange: string;
  asset_class?: string;
  contract_meta?: Record<string, unknown>;
}

export const symbolApi = {
  list: () => request<Symbol[]>('/symbols'),
  create: (data: CreateSymbolPayload) => request<Symbol>('/symbols', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/symbols/${id}`, { method: 'DELETE' }),
};

export interface Strategy {
  code: string;
  name: string;
  description: string;
  default_params: Record<string, unknown>;
  params_schema: Record<string, unknown>;
}

export const strategyApi = {
  list: () => request<Strategy[]>('/strategies'),
  get: (code: string) => request<Strategy>(`/strategies/${code}`),
};

export interface Assignment {
  id: number;
  portfolio_id: number;
  symbol_id: number;
  strategy_code: string;
  params: Record<string, unknown>;
  allocation: number;
  enabled: boolean;
}

export interface CreateAssignmentPayload {
  symbol_id: number;
  strategy_code: string;
  params?: Record<string, unknown>;
  allocation: number;
}

export const assignmentApi = {
  list: (portfolioId: number) => request<Assignment[]>(`/portfolios/${portfolioId}/assignments`),
  create: (portfolioId: number, data: CreateAssignmentPayload) =>
    request<Assignment>(`/portfolios/${portfolioId}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  patch: (portfolioId: number, assignmentId: number, data: Partial<CreateAssignmentPayload>) =>
    request<Assignment>(`/portfolios/${portfolioId}/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (portfolioId: number, assignmentId: number) =>
    request<void>(`/portfolios/${portfolioId}/assignments/${assignmentId}`, { method: 'DELETE' }),
};

export interface AccountSummary {
  portfolio_count: number;
  total_budget: number;
  total_cash_available: number;
  total_cash_reserved: number;
  total_cash_deployed: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  open_position_count: number;
}

export const accountApi = {
  summary: () => request<AccountSummary>('/account/summary'),
};
