import { useQuery } from '@tanstack/react-query';
import { Activity, DollarSign, Briefcase, TrendingUp } from 'lucide-react';

const BASE = '/api/v1';
async function req<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export function DashboardPage() {
  const { data: summary } = useQuery({ queryKey: ['account-summary'], queryFn: () => req<any>('/account/summary'), refetchInterval: 10_000 });
  const { data: ibkr } = useQuery({ queryKey: ['account-ibkr'], queryFn: () => req<any>('/account/ibkr'), refetchInterval: 10_000 });
  const { data: opsStatus } = useQuery({ queryKey: ['ops-ibkr-status'], queryFn: () => req<any>('/ops/ibkr/status'), refetchInterval: 10_000 });
  const { data: ordersData } = useQuery({ queryKey: ['ibkr-orders'], queryFn: () => req<any>('/account/ibkr-orders'), refetchInterval: 10_000 });
  const { data: fills } = useQuery({ queryKey: ['ibkr-fills'], queryFn: () => req<any[]>('/account/ibkr-fills'), refetchInterval: 10_000 });

  const fmtUsd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  const connected = opsStatus?.connected || false;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 12px', background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: connected ? '#22c55e' : '#ef4444', borderRadius: 20 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444' }} />
          IBKR Bridge: {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Shared Account Banner */}
      {ibkr?.buying_power && summary?.total_cash_deployed !== undefined && (
        <div style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--bg-surface)', borderLeft: '4px solid #f59e0b', borderRadius: 6, fontSize: 13 }}>
          <strong>Shared Account Notice:</strong> Platform sum of deployed cash is {fmtUsd(summary.total_cash_deployed)}. 
          IBKR Buying Power is {fmtUsd(ibkr.buying_power)}. Ensure platform budget does not exceed account capacity.
        </div>
      )}

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <Card title="Total Equity" value={ibkr?.net_liquidation ? fmtUsd(ibkr.net_liquidation) : summary ? fmtUsd(summary.total_budget + summary.total_realized_pnl) : '—'} icon={<DollarSign size={18} />} />
        <Card title="Day PnL" value={ibkr?.unrealized_pnl ? fmtUsd(ibkr.unrealized_pnl) : '—'} icon={<TrendingUp size={18} />} />
        <Card title="Open Positions" value={summary?.open_position_count ?? '—'} icon={<Briefcase size={18} />} />
        <Card title="Active Portfolios" value={summary?.portfolio_count ?? '—'} icon={<Activity size={18} />} />
      </div>

      {/* Tables Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Open Orders */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>Open Orders</h2>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)' }}>Ticker</th>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)' }}>Side</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ordersData?.ibkr_orders?.filter((o: any) => o.is_live).slice(0, 10).map((o: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bg-surface)' }}>
                    <td style={{ padding: '8px 4px' }}>{o.ticker}</td>
                    <td style={{ padding: '8px 4px', color: o.action === 'BUY' ? '#22c55e' : '#ef4444' }}>{o.action}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>{o.remaining} / {o.total_quantity}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>{o.status}</td>
                  </tr>
                ))}
                {!ordersData?.ibkr_orders?.filter((o: any) => o.is_live).length && (
                  <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No open orders</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Fills */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>Recent Fills</h2>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)' }}>Ticker</th>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)' }}>Side</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {fills?.slice(0, 10).map((f: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bg-surface)' }}>
                    <td style={{ padding: '8px 4px' }}>{f.ticker}</td>
                    <td style={{ padding: '8px 4px', color: f.action === 'BUY' ? '#22c55e' : '#ef4444' }}>{f.action}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>{f.qty}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>{fmtUsd(f.price)}</td>
                  </tr>
                ))}
                {!fills?.length && (
                  <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No recent fills</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        {icon}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
