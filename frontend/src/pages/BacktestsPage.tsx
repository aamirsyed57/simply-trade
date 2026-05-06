import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FlaskConical, CheckCircle, Clock, XCircle, Loader } from 'lucide-react';
import { strategyApi, symbolApi } from '../api/index';

const BASE = '/api/v1';
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface Backtest {
  id: number;
  name: string;
  strategy_code: string;
  symbol_ids: number[];
  timeframe: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  fill_model: string;
  slippage_bps: number;
  status: string;
  error_message?: string;
}

const backtestApi = {
  list: () => req<Backtest[]>('/backtests'),
  get: (id: number) => req<Backtest>(`/backtests/${id}`),
  create: (data: unknown) => req<Backtest>('/backtests', { method: 'POST', body: JSON.stringify(data) }),
  result: (id: number) => req<{ metrics: Record<string, number> }>(`/backtests/${id}/result`),
  delete: (id: number) => req<void>(`/backtests/${id}`, { method: 'DELETE' }),
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={14} color="#f59e0b" />,
  running:   <Loader size={14} color="#4f7df3" style={{ animation: 'spin 1s linear infinite' }} />,
  completed: <CheckCircle size={14} color="#22c55e" />,
  failed:    <XCircle size={14} color="#ef4444" />,
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', running: '#4f7df3', completed: '#22c55e', failed: '#ef4444',
};

export function BacktestsPage() {
  const qc = useQueryClient();
  const { data: backtests = [], isLoading } = useQuery({
    queryKey: ['backtests'],
    queryFn: backtestApi.list,
    refetchInterval: 5_000,
  });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: strategyApi.list });
  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Backtest | null>(null);
  const [selectedResult, setSelectedResult] = useState<Record<string, number> | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [stratCode, setStratCode] = useState('');
  const [symIds, setSymIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-03-31');
  const [capital, setCapital] = useState('100000');
  const [formError, setFormError] = useState('');

  const createMutation = useMutation({
    mutationFn: backtestApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backtests'] }); setShowForm(false); resetForm(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: backtestApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backtests'] }); setSelected(null); setSelectedResult(null); },
  });

  const resetForm = () => { setName(''); setStratCode(''); setSymIds([]); setFormError(''); };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !stratCode || symIds.length === 0) return setFormError('Name, strategy, and at least one symbol are required');
    createMutation.mutate({ name, strategy_code: stratCode, symbol_ids: symIds, start_date: startDate, end_date: endDate, initial_capital: parseFloat(capital) });
  };

  const viewResult = async (bt: Backtest) => {
    setSelected(bt);
    setSelectedResult(null);
    if (bt.status === 'completed') {
      try { const r = await backtestApi.result(bt.id); setSelectedResult(r.metrics); } catch { /* ignore */ }
    }
  };

  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s.ticker]));
  const fmt = (v: number, isPercent = false) => isPercent ? `${v.toFixed(2)}%` : v.toFixed(4);
  const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  return (
    <div style={{ padding: 32 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Backtests</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            {backtests.length} backtest{backtests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> New Backtest
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* List */}
        <div>
          {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {backtests.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <FlaskConical size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
              <div>No backtests yet. Create one to get started.</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {backtests.map(bt => (
              <div
                key={bt.id}
                onClick={() => viewResult(bt)}
                style={{
                  background: selected?.id === bt.id ? 'var(--bg-card)' : 'var(--bg-surface)',
                  border: `1px solid ${selected?.id === bt.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'border-color 0.15s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{bt.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                    <span>{bt.strategy_code}</span>
                    <span>{bt.symbol_ids.map(id => symbolMap[id] ?? id).join(', ')}</span>
                    <span>{bt.start_date} → {bt.end_date}</span>
                    <span>{fmtUsd(bt.initial_capital)} capital</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: STATUS_COLOR[bt.status] }}>
                    {STATUS_ICON[bt.status]} {bt.status}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Delete this backtest?')) deleteMutation.mutate(bt.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px 6px', fontSize: 16 }}
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Result panel */}
        {selected && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 22, height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
              <button onClick={() => { setSelected(null); setSelectedResult(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>×</button>
            </div>
            {selected.status === 'failed' && (
              <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                {selected.error_message ?? 'Unknown error'}
              </div>
            )}
            {selected.status === 'running' && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Running… refresh in a moment.</div>}
            {selected.status === 'pending' && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Queued — waiting for a worker.</div>}
            {selectedResult && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['CAGR', fmt(selectedResult.cagr, true)],
                  ['Sharpe', fmt(selectedResult.sharpe)],
                  ['Sortino', fmt(selectedResult.sortino)],
                  ['Calmar', fmt(selectedResult.calmar)],
                  ['Max DD', fmt(selectedResult.max_drawdown, true)],
                  ['Win Rate', fmt(selectedResult.win_rate, true)],
                  ['Profit Factor', fmt(selectedResult.profit_factor)],
                  ['Trades', String(selectedResult.n_trades)],
                  ['Total PnL', fmtUsd(selectedResult.total_pnl)],
                  ['Final Equity', fmtUsd(selectedResult.final_equity)],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 7, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 460, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>New Backtest</h2>
            <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Name', el: <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="AAPL Q1 2024" /> },
                { label: 'Strategy', el: <select style={inp} value={stratCode} onChange={e => setStratCode(e.target.value)}><option value="">— select —</option>{strategies.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select> },
                { label: 'Symbols', el: (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {symbols.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={symIds.includes(s.id)} onChange={e => setSymIds(e.target.checked ? [...symIds, s.id] : symIds.filter(id => id !== s.id))} />
                        {s.ticker}
                      </label>
                    ))}
                  </div>
                )},
                { label: 'Start Date', el: <input type="date" style={inp} value={startDate} onChange={e => setStartDate(e.target.value)} /> },
                { label: 'End Date', el: <input type="date" style={inp} value={endDate} onChange={e => setEndDate(e.target.value)} /> },
                { label: 'Initial Capital (USD)', el: <input type="number" style={inp} value={capital} onChange={e => setCapital(e.target.value)} min={1} /> },
              ].map(({ label, el }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 500 }}>{label}</label>
                  {el}
                </div>
              ))}
              {formError && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} style={{ padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {createMutation.isPending ? 'Creating…' : 'Run Backtest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
