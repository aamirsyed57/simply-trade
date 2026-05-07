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
  syncIbkrOrders: () => rawRequest<{ upserted: number; triggered_bridge_refresh: boolean; message: string }>('/ops/ibkr/sync-orders', { method: 'POST' }),
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
  ibkr: () => request<IBKRAccountSummary>('/account/ibkr'),
};

export interface IBKRAccountSummary {
  net_liquidation: number | null;
  total_cash: number | null;
  buying_power: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  gross_position_value: number | null;
  available_funds: number | null;
  maint_margin_req: number | null;
  day_trades_remaining: number | null;
}

export interface Order {
  id: number;
  client_order_id: string;
  ibkr_order_id: number | null;
  portfolio_id: number;
  symbol_id: number;
  strategy_code: string;
  side: 'BUY' | 'SELL';
  qty: number;
  order_type: 'MKT' | 'LMT';
  limit_price: number | null;
  status: 'pending' | 'submitted' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  order_ref: string;
  reserved_cash: number;
  execution_mode: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPayload {
  portfolio_id: number;
  symbol_id: number;
  strategy_code: string;
  side: 'BUY' | 'SELL';
  qty: number;
  order_type: 'MKT' | 'LMT';
  limit_price?: number;
}

export const orderApi = {
  list: (portfolioId?: number) => request<Order[]>(portfolioId ? `/orders?portfolio_id=${portfolioId}` : '/orders'),
  create: (data: CreateOrderPayload) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  get: (orderId: number) => request<Order>(`/orders/${orderId}`),
  cancel: (orderId: number) => request<Order>(`/orders/${orderId}/cancel`, { method: 'PATCH' }),
  fill: (orderId: number, fillPrice: number) =>
    request<Order>(`/orders/${orderId}/fill`, { method: 'POST', body: JSON.stringify({ fill_price: fillPrice }) }),
  retry: (orderId: number) =>
    request<Order>(`/orders/${orderId}/retry`, { method: 'POST' }),
};

export interface Position {
  id: number;
  portfolio_id: number;
  symbol_id: number;
  qty: number;
  avg_price: number;
  realized_pnl: number;
  unrealized_pnl: number;
  market_value: number;
  last_updated: string;
}

export const positionApi = {
  list: (portfolioId: number) => request<Position[]>(`/portfolios/${portfolioId}/positions`),
};

export interface IBKROrderEntry {
  ibkr_order_id: number;
  order_ref: string;
  ticker: string;
  exchange: string;
  action: 'BUY' | 'SELL';
  order_type: 'MKT' | 'LMT';
  total_quantity: number;
  limit_price: number | null;
  status: string;
  filled: number;
  remaining: number;
  avg_fill_price: number;
  is_platform_order: boolean;
  is_live: boolean;
  first_seen_at: string;
  last_updated_at: string;
}

export interface IBKRDBOrphan {
  id: number;
  order_ref: string;
  side: string;
  qty: number;
  order_type: string;
  status: string;
  created_at: string;
  portfolio_id: number;
  symbol_id: number;
  strategy_code: string;
}

export interface IBKROrdersResponse {
  ibkr_orders: IBKROrderEntry[];
  db_orphans: IBKRDBOrphan[];
}

export const ibkrOrdersApi = {
  list: () => request<IBKROrdersResponse>('/account/ibkr-orders'),
};
