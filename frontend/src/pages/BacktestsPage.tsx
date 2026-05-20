import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FlaskConical, CheckCircle, Clock, XCircle, Loader, BarChart2, List, Zap } from 'lucide-react';
import { strategyApi, symbolApi } from '../api/index';

const BASE = '/api/v1';
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface Backtest {
  id: number; name: string; strategy_code: string; symbol_ids: number[];
  timeframe: string; start_date: string; end_date: string;
  initial_capital: number; fill_model: string; slippage_bps: number;
  status: string; error_message?: string;
}
interface BtResult { metrics: Record<string, number>; per_symbol_metrics: Record<string, Record<string, number>>; }
interface EquityPoint { ts: string; equity: number; [k: string]: unknown; }
interface DrawPoint { ts: string; drawdown: number; [k: string]: unknown; }
interface Trade { symbol_id: number; direction: string; qty: number; entry_price: number; exit_price: number; pnl: number; commission: number; exit_ts: string; }

const api = {
  list: () => req<Backtest[]>('/backtests'),
  create: (d: unknown) => req<Backtest>('/backtests/run-inline', { method: 'POST', body: JSON.stringify(d) }),
  result: (id: number) => req<BtResult>(`/backtests/${id}/result`),
  equity: (id: number) => req<{ equity_curve: EquityPoint[]; drawdown_curve: DrawPoint[] }>(`/backtests/${id}/equity`),
  trades: (id: number) => req<{ trades: Trade[] }>(`/backtests/${id}/trades`),
  delete: (id: number) => req<void>(`/backtests/${id}`, { method: 'DELETE' }),
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={13} color="#f59e0b" />,
  running: <Loader size={13} color="#4f7df3" style={{ animation: 'spin 1s linear infinite' }} />,
  completed: <CheckCircle size={13} color="#22c55e" />,
  failed: <XCircle size={13} color="#ef4444" />,
};
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', running: '#4f7df3', completed: '#22c55e', failed: '#ef4444' };

// ── Mini SVG line chart ──
function LineChart({ data, valueKey, color, height = 80 }: { data: Record<string, unknown>[]; valueKey: string; color: string; height?: number }) {
  if (!data.length) return null;
  const W = 500, H = height, P = 6;
  const vals = data.map(d => d[valueKey] as number);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const sx = (i: number) => P + (i / (data.length - 1)) * (W - P * 2);
  const sy = (v: number) => P + (1 - (v - min) / range) * (H - P * 2);
  const pts = data.map((d, i) => `${sx(i).toFixed(1)},${sy(d[valueKey] as number).toFixed(1)}`).join(' ');
  const area = `${sx(0)},${H - P} ${pts} ${sx(data.length - 1)},${H - P}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`g${valueKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g${valueKey})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Metric grid ──
function MetricGrid({ metrics }: { metrics: Record<string, number> }) {
  const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const rows: [string, string][] = [
    ['CAGR', `${metrics.cagr?.toFixed(2)}%`],
    ['Sharpe', metrics.sharpe?.toFixed(3)],
    ['Sortino', metrics.sortino?.toFixed(3)],
    ['Calmar', metrics.calmar?.toFixed(3)],
    ['Max DD', `${metrics.max_drawdown?.toFixed(2)}%`],
    ['Win Rate', `${metrics.win_rate?.toFixed(2)}%`],
    ['Profit Factor', metrics.profit_factor?.toFixed(3)],
    ['Trades', String(metrics.n_trades)],
    ['Total PnL', fmtUsd(metrics.total_pnl)],
    ['Final Equity', fmtUsd(metrics.final_equity)],
    ['Exposure', `${metrics.exposure_pct?.toFixed(1)}%`],
    ['Expectancy', `$${metrics.expectancy?.toFixed(2)}`],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {rows.map(([l, v]) => (
        <div key={l} style={{ background: 'var(--bg-primary)', borderRadius: 7, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{l}</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

export function BacktestsPage() {
  const qc = useQueryClient();
  const { data: backtests = [], isLoading } = useQuery({ queryKey: ['backtests'], queryFn: api.list, refetchInterval: 5_000 });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: strategyApi.list });
  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Backtest | null>(null);
  const [resultTab, setResultTab] = useState<'metrics' | 'equity' | 'drawdown' | 'trades'>('metrics');

  const [name, setName] = useState('');
  const [stratCode, setStratCode] = useState('');
  const [symIds, setSymIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [capital, setCapital] = useState('100000');
  const [timeframe, setTimeframe] = useState('1d');
  const [exitAfterBars, setExitAfterBars] = useState('10');
  const [formError, setFormError] = useState('');

  const { data: btResult } = useQuery({
    queryKey: ['bt-result', selected?.id],
    queryFn: () => api.result(selected!.id),
    enabled: selected?.status === 'completed',
  });
  const { data: btEquity } = useQuery({
    queryKey: ['bt-equity', selected?.id],
    queryFn: () => api.equity(selected!.id),
    enabled: selected?.status === 'completed',
  });
  const { data: btTrades } = useQuery({
    queryKey: ['bt-trades', selected?.id],
    queryFn: () => api.trades(selected!.id),
    enabled: selected?.status === 'completed' && resultTab === 'trades',
  });

  const createMutation = useMutation({
    mutationFn: api.create,
    onSuccess: (bt) => { qc.invalidateQueries({ queryKey: ['backtests'] }); setShowForm(false); resetForm(); setSelected(bt); },
    onError: (e: Error) => setFormError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: api.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backtests'] }); setSelected(null); },
  });

  const resetForm = () => { setName(''); setStratCode(''); setSymIds([]); setExitAfterBars('10'); setFormError(''); };
  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s.ticker]));
  const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  const TABS = [
    { key: 'metrics', label: 'Metrics', icon: <BarChart2 size={13} /> },
    { key: 'equity', label: 'Equity', icon: <BarChart2 size={13} /> },
    { key: 'drawdown', label: 'Drawdown', icon: <BarChart2 size={13} /> },
    { key: 'trades', label: 'Trades', icon: <List size={13} /> },
  ] as const;

  return (
    <div style={{ padding: 32 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Backtests</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{backtests.length} backtest{backtests.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> New Backtest
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: 20 }}>
        {/* List */}
        <div>
          {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {!isLoading && backtests.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <FlaskConical size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No backtests yet</div>
              <div style={{ fontSize: 13 }}>Import historical data, then create a backtest.</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backtests.map(bt => (
              <div key={bt.id} onClick={() => setSelected(bt)} style={{ background: selected?.id === bt.id ? 'var(--bg-card)' : 'var(--bg-surface)', border: `1px solid ${selected?.id === bt.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '13px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color 0.15s' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{bt.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                    <span>{bt.strategy_code}</span>
                    <span>{bt.symbol_ids.map(id => symbolMap[id] ?? id).join(', ')}</span>
                    <span>{bt.start_date} → {bt.end_date}</span>
                    <span>{fmtUsd(bt.initial_capital)}</span>
                    <span>{bt.timeframe}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: STATUS_COLOR[bt.status] }}>
                    {STATUS_ICON[bt.status]} {bt.status}
                  </span>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(bt.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16 }}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.strategy_code} · {selected.timeframe}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>×</button>
            </div>

            {selected.status === 'failed' && (
              <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, marginBottom: 12 }}>
                {selected.error_message ?? 'Unknown error'}
              </div>
            )}
            {(selected.status === 'running' || selected.status === 'pending') && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                {selected.status === 'running' ? 'Running… please wait.' : 'Queued — waiting for worker.'}
              </div>
            )}

            {selected.status === 'completed' && (
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  {TABS.map(t => (
                    <button key={t.key} onClick={() => setResultTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: resultTab === t.key ? 600 : 400, background: resultTab === t.key ? 'var(--accent)' : 'var(--bg-surface)', color: resultTab === t.key ? '#fff' : 'var(--text-muted)' }}>
                      {t.icon}{t.label}
                    </button>
                  ))}
                </div>

                {resultTab === 'metrics' && btResult && (
                  <MetricGrid metrics={btResult.metrics} />
                )}

                {resultTab === 'equity' && btEquity && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Equity curve ({btEquity.equity_curve.length} points)</div>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 10, border: '1px solid var(--border)' }}>
                      <LineChart data={btEquity.equity_curve} valueKey="equity" color="#4f7df3" height={100} />
                    </div>
                    {btEquity.equity_curve.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span>{new Date(btEquity.equity_curve[0].ts).toLocaleDateString()}</span>
                        <span>{new Date(btEquity.equity_curve[btEquity.equity_curve.length - 1].ts).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                )}

                {resultTab === 'drawdown' && btEquity && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Drawdown %</div>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 10, border: '1px solid var(--border)' }}>
                      <LineChart data={btEquity.drawdown_curve} valueKey="drawdown" color="#ef4444" height={100} />
                    </div>
                  </div>
                )}

                {resultTab === 'trades' && (
                  <div style={{ maxHeight: 340, overflow: 'auto' }}>
                    {!btTrades && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading trades…</div>}
                    {btTrades && btTrades.trades.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No trades recorded.</div>}
                    {btTrades && btTrades.trades.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)' }}>
                            {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'PnL'].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {btTrades.trades.map((t, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px' }}>{symbolMap[t.symbol_id] ?? t.symbol_id}</td>
                              <td style={{ padding: '6px 8px', color: t.direction === 'BUY' ? '#22c55e' : '#ef4444' }}>{t.direction}</td>
                              <td style={{ padding: '6px 8px' }}>{t.qty}</td>
                              <td style={{ padding: '6px 8px' }}>${t.entry_price.toFixed(2)}</td>
                              <td style={{ padding: '6px 8px' }}>${t.exit_price.toFixed(2)}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 600, color: t.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                                {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Zap size={18} color="var(--accent)" />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>New Backtest</h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'rgba(79,125,243,0.08)', borderRadius: 6 }}>
              Runs synchronously (inline). Make sure historical data is imported for the selected symbols &amp; timeframe.
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!name || !stratCode || !symIds.length) return setFormError('Name, strategy, and at least one symbol required.'); createMutation.mutate({ name, strategy_code: stratCode, symbol_ids: symIds, start_date: startDate, end_date: endDate, initial_capital: parseFloat(capital), timeframe, exit_after_bars: parseInt(exitAfterBars) || 10 }); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <Field label="Name"><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="AAPL Q1 2024" /></Field>
              <Field label="Strategy">
                <select style={inp} value={stratCode} onChange={e => setStratCode(e.target.value)}>
                  <option value="">— select —</option>
                  {strategies.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Symbols">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {symbols.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={symIds.includes(s.id)} onChange={e => setSymIds(e.target.checked ? [...symIds, s.id] : symIds.filter(id => id !== s.id))} />
                      {s.ticker}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Timeframe">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['1m', '5m', '15m', '1h', '1d'].map(tf => (
                    <button key={tf} type="button" onClick={() => setTimeframe(tf)} style={{ padding: '5px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: timeframe === tf ? 'var(--accent)' : 'var(--bg-primary)', color: timeframe === tf ? '#fff' : 'var(--text-muted)', border: `1px solid ${timeframe === tf ? 'var(--accent)' : 'var(--border)'}` }}>
                      {tf}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Start Date"><input type="date" style={inp} value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
              <Field label="End Date"><input type="date" style={inp} value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
              <Field label="Initial Capital (USD)"><input type="number" style={inp} value={capital} onChange={e => setCapital(e.target.value)} min={1} /></Field>
              <Field label="Auto-exit After (bars)" >
                <input type="number" style={inp} value={exitAfterBars} onChange={e => setExitAfterBars(e.target.value)} min={0} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Bars to hold before auto-selling. 0 = close only at end of backtest.</div>
              </Field>

              {formError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} style={{ padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {createMutation.isPending ? 'Running…' : '▶ Run Backtest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
