import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioApi } from '../api/portfolios';
import { assignmentApi, symbolApi, strategyApi, orderApi, positionApi, type Assignment, type Order, type Position } from '../api/index';
import { CashPanel } from '../components/CashPanel';
import { ModeBadge } from '../components/ModeBadge';
import { AssignStrategyModal } from '../components/AssignStrategyModal';
import { ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Zap, AlertTriangle } from 'lucide-react';
import { ManualTradeModal } from '../components/ManualTradeModal';
import { RetryFillModal } from '../components/RetryFillModal';

export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id!);
  const qc = useQueryClient();

  const { data: portfolio } = useQuery({
    queryKey: ['portfolios', portfolioId],
    queryFn: () => portfolioApi.get(portfolioId),
    refetchInterval: 10_000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments', portfolioId],
    queryFn: () => assignmentApi.list(portfolioId),
    refetchInterval: 10_000,
  });

  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: strategyApi.list });
  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ['positions', portfolioId],
    queryFn: () => positionApi.list(portfolioId),
    refetchInterval: 10_000,
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ['orders', portfolioId],
    queryFn: () => orderApi.list(portfolioId),
    refetchInterval: 10_000,
  });

  const [showAssign, setShowAssign] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [tradingAssignment, setTradingAssignment] = useState<Assignment | null>(null);
  const [retryOrder, setRetryOrder] = useState<Order | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: number) => assignmentApi.delete(assignmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', portfolioId] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ aid, enabled }: { aid: number; enabled: boolean }) =>
      assignmentApi.patch(aid, { enabled } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', portfolioId] }),
  });

  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s]));
  const stratMap = Object.fromEntries(strategies.map(s => [s.code, s]));
  const positionMap = Object.fromEntries(positions.map(p => [p.symbol_id, p]));
  const pendingBySymbol: Record<number, Order[]> = {};
  for (const o of orders) {
    if (o.status === 'pending' || o.status === 'submitted') {
      (pendingBySymbol[o.symbol_id] ??= []).push(o);
    }
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const fmtPx = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const fmtPnl = (v: number) => `${v >= 0 ? '+' : ''}${fmtPx(v)}`;

  if (!portfolio) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Back */}
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13, marginBottom: 20 }}>
        <ArrowLeft size={14} /> All Portfolios
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{portfolio.name}</h1>
        <ModeBadge mode={portfolio.mode} />
      </div>

      {/* Cash panel */}
      <div style={{ marginBottom: 28 }}>
        <CashPanel portfolio={portfolio} />
      </div>

      {/* Assignments */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Strategy Assignments</h2>
        <button
          onClick={() => setShowAssign(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: 'var(--accent)', border: 'none', borderRadius: 7,
            color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Assign Strategy
        </button>
      </div>

      {assignments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
          No strategies assigned yet. Click "Assign Strategy" to get started.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'Strategy', 'Allocation', 'Capital Used', 'Params', 'Position', 'Pending', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => {
                const sym = symbolMap[a.symbol_id];
                const strat = stratMap[a.strategy_code];
                return (
                  <tr
                    key={a.id}
                    style={{ borderBottom: i < assignments.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{sym?.ticker ?? a.symbol_id}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sym?.exchange}</div>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{strat?.name ?? a.strategy_code}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.strategy_code}</div>
                    </td>
                    <td style={td}><span style={{ fontWeight: 600 }}>{fmt(a.allocation)}</span></td>
                    <td style={td}>
                      {(() => {
                        const mv = positionMap[a.symbol_id]?.market_value ?? 0;
                        const pct = a.allocation > 0 ? Math.min((mv / a.allocation) * 100, 100) : 0;
                        const barColor = pct > 90 ? '#f59e0b' : '#4f7df3';
                        return (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtPx(mv)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {fmt(a.allocation)}</span></div>
                            <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--border)', width: 80 }}>
                              <div style={{ height: '100%', borderRadius: 2, background: barColor, width: `${pct}%` }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{pct.toFixed(0)}% deployed</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Object.entries(a.params ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
                      </div>
                    </td>
                    <td style={td}>
                      {(() => {
                        const pos = positionMap[a.symbol_id];
                        if (!pos || pos.qty === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
                        const pnlColor = pos.unrealized_pnl >= 0 ? '#22c55e' : '#ef4444';
                        return (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{pos.qty} sh @ {fmtPx(pos.avg_price)}</div>
                            <div style={{ fontSize: 11, color: pnlColor }}>{fmtPnl(pos.unrealized_pnl)}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={td}>
                      {(() => {
                        const pending = pendingBySymbol[a.symbol_id] ?? [];
                        if (!pending.length) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pending.map(o => (
                              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{
                                  fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap',
                                  color: o.side === 'BUY' ? '#22c55e' : '#ef4444',
                                }}>
                                  {o.side} {o.qty} {o.order_type}{o.limit_price ? ` @ ${fmtPx(o.limit_price)}` : ''}
                                </span>
                                {o.ibkr_order_id === null && (
                                  <button
                                    onClick={() => setRetryOrder(o)}
                                    title="No IBKR order ID — click to record fill"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                  >
                                    <AlertTriangle size={13} color="#f59e0b" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => toggleMutation.mutate({ aid: a.id, enabled: !a.enabled })}
                        title={a.enabled ? 'Disable' : 'Enable'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.enabled ? '#22c55e' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {a.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        <span style={{ fontSize: 11 }}>{a.enabled ? 'Active' : 'Paused'}</span>
                      </button>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <ActionBtn onClick={() => setTradingAssignment(a)} title="Manual trade"><Zap size={12} /></ActionBtn>
                        <ActionBtn onClick={() => setEditingAssignment(a)} title="Edit"><Pencil size={12} /></ActionBtn>
                        <ActionBtn danger onClick={() => { if (confirm('Remove assignment?')) deleteMutation.mutate(a.id); }} title="Remove"><Trash2 size={12} /></ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAssign || editingAssignment) && (
        <AssignStrategyModal
          portfolioId={portfolioId}
          existing={editingAssignment ?? undefined}
          onClose={() => { setShowAssign(false); setEditingAssignment(null); }}
        />
      )}

      {tradingAssignment && (
        <ManualTradeModal
          portfolioId={portfolioId}
          symbolId={tradingAssignment.symbol_id}
          ticker={symbolMap[tradingAssignment.symbol_id]?.ticker ?? String(tradingAssignment.symbol_id)}
          strategyCode={tradingAssignment.strategy_code}
          onClose={() => setTradingAssignment(null)}
        />
      )}

      {retryOrder && (
        <RetryFillModal
          order={retryOrder}
          ticker={symbolMap[retryOrder.symbol_id]?.ticker ?? String(retryOrder.symbol_id)}
          onClose={() => setRetryOrder(null)}
        />
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, verticalAlign: 'middle' };

function ActionBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 5,
        padding: '4px 7px', cursor: 'pointer', color: danger ? 'var(--danger)' : 'var(--text-muted)', display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}
