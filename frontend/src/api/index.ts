const BASE = '/api/v1';
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function rawRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
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

export interface SymbolSearchResult {
  ticker: string;
  exchange: string;
  name: string;
  type: string;
}

export const opsApi = {
  health: () => rawRequest<{ status: string }>('/ops/health'),
  ibkrStatus: () => rawRequest<{ connected: boolean; paper_gateway: string; live_gateway: string; note: string }>('/ops/ibkr/status'),
  killSwitch: () => rawRequest<{ live_trading_enabled: boolean; message: string }>('/ops/kill-switch', { method: 'POST' }),
  workerLogs: () => rawRequest<{ logs: string[] }>('/ops/logs/worker?lines=100'),
};

export const symbolApi = {
  list: () => request<Symbol[]>('/symbols'),
  search: (q: string) => request<SymbolSearchResult[]>(`/symbols/search?q=${encodeURIComponent(q)}`),
  create: (data: CreateSymbolPayload) => request<Symbol>('/symbols', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/symbols/${id}`, { method: 'DELETE' }),
};

export interface Strategy {
  code: string;
  name: string;
  description: string;
  documentation_url?: string;
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
  portfolio_id: number;
  symbol_id: number;
  strategy_code: string;
  params?: Record<string, unknown>;
  allocation: number;
}

export const assignmentApi = {
  list: (portfolioId: number) => request<Assignment[]>(`/assignments?portfolio_id=${portfolioId}`),
  create: (data: CreateAssignmentPayload) =>
    request<Assignment>(`/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  patch: (assignmentId: number, data: Partial<CreateAssignmentPayload>) =>
    request<Assignment>(`/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (assignmentId: number) =>
    request<void>(`/assignments/${assignmentId}`, { method: 'DELETE' }),
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
