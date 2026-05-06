import { useQuery } from '@tanstack/react-query';
import { accountApi, orderApi } from '../api/index';


function fmt(v: number | null, opts?: Intl.NumberFormatOptions) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, ...opts }).format(v);
}

function pnlColor(v: number | null) {
  if (v === null) return 'var(--text-muted)';
  return v >= 0 ? '#22c55e' : '#ef4444';
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 20px', borderRight: '1px solid var(--border)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export function AccountSummaryBar() {
  const { data, isError } = useQuery({
    queryKey: ['account', 'ibkr'],
    queryFn: accountApi.ibkr,
    refetchInterval: 15_000,
    retry: false,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => orderApi.list(),
    refetchInterval: 15_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['account', 'summary'],
    queryFn: accountApi.summary,
    refetchInterval: 15_000,
  });

  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'submitted').length;

  if (isError || !data) return null;

  const allNull = Object.values(data).every(v => v === null);
  if (allNull && pendingCount === 0) return null;

  const dayPnl = (data.unrealized_pnl ?? 0) + (data.realized_pnl ?? 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: 52,
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      paddingLeft: 20,
      overflowX: 'auto',
      flexShrink: 0,
      gap: 0,
    }}>
      <Tile
        label="Pending Orders"
        value={String(pendingCount)}
        color={pendingCount > 0 ? '#f59e0b' : 'var(--text-muted)'}
      />
      <Tile
        label="Reserved (Pending)"
        value={fmt(summary?.total_cash_reserved ?? null)}
        color={summary && summary.total_cash_reserved > 0 ? '#f59e0b' : undefined}
      />
      <Tile label="Deployed (Positions)" value={fmt(summary?.total_cash_deployed ?? null)} />
      <Tile label="NAV" value={fmt(data.net_liquidation)} />
      <Tile label="Cash" value={fmt(data.total_cash)} />
      <Tile label="Buying Power" value={fmt(data.buying_power)} />
      <Tile label="Available Funds" value={fmt(data.available_funds)} />
      <Tile label="Positions Value" value={fmt(data.gross_position_value)} />
      <Tile label="Margin Req" value={fmt(data.maint_margin_req)} />
      <Tile label="Unrealized P&L" value={fmt(data.unrealized_pnl, { signDisplay: 'always' })} color={pnlColor(data.unrealized_pnl)} />
      <Tile label="Realized P&L" value={fmt(data.realized_pnl, { signDisplay: 'always' })} color={pnlColor(data.realized_pnl)} />
      <Tile label="Day P&L" value={fmt(dayPnl, { signDisplay: 'always' })} color={pnlColor(dayPnl)} />
      {data.day_trades_remaining !== null && (
        <Tile label="Day Trades Left" value={String(data.day_trades_remaining)} />
      )}
    </div>
  );
}
