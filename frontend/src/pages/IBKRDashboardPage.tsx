import { useQuery, useQueries } from '@tanstack/react-query';
import { accountApi, symbolApi, positionApi, type IBKRAccountSummary, type AccountSummary, type Position } from '../api/index';
import { portfolioApi, type Portfolio } from '../api/portfolios';

const REFRESH_MS = 15_000;

function fmt(v: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, ...opts }).format(v);
}

function fmtK(v: number | null | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function pnlColor(v: number | null | undefined) {
  if (v == null) return 'var(--text-muted)';
  return v >= 0 ? '#22c55e' : '#ef4444';
}

function pnlSign(v: number | null | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, signDisplay: 'always' }).format(v);
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function HeroStat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 24px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', flex: 1 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

// ── Positions table ────────────────────────────────────────────────────────

interface EnrichedPosition extends Position {
  portfolioName: string;
  ticker: string;
  exchange: string;
}

function PositionsTable({ positions }: { positions: EnrichedPosition[] }) {
  const active = positions.filter(p => p.qty !== 0);
  if (active.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 0', textAlign: 'center' }}>
        No open positions
      </div>
    );
  }

  const totalUnrealized = active.reduce((s, p) => s + p.unrealized_pnl, 0);
  const totalMarketValue = active.reduce((s, p) => s + p.market_value, 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{active.length} open position{active.length !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Market value {fmtK(totalMarketValue)}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: pnlColor(totalUnrealized), fontWeight: 600 }}>Unrealized P&L {pnlSign(totalUnrealized)}</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['Portfolio', 'Ticker', 'Exchange', 'Qty', 'Avg Price', 'Market Value', 'Unrealized P&L', 'Realized P&L', 'Last Updated'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((p, i) => (
              <tr key={p.id} style={{
                borderBottom: i < active.length - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)',
              }}>
                <td style={td}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{p.portfolioName}</span></td>
                <td style={td}><span style={{ fontWeight: 700 }}>{p.ticker || `sym#${p.symbol_id}`}</span></td>
                <td style={td}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.exchange || '—'}</span></td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums', color: p.qty > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{p.qty > 0 ? '+' : ''}{p.qty}</span></td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.avg_price)}</span></td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtK(p.market_value)}</span></td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: pnlColor(p.unrealized_pnl) }}>{pnlSign(p.unrealized_pnl)}</span></td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums', color: pnlColor(p.realized_pnl) }}>{pnlSign(p.realized_pnl)}</span></td>
                <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(p.last_updated).toLocaleString('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' };

// ── Main page ──────────────────────────────────────────────────────────────

export function IBKRDashboardPage() {
  const { data: ibkr } = useQuery<IBKRAccountSummary>({
    queryKey: ['account', 'ibkr'],
    queryFn: accountApi.ibkr,
    refetchInterval: REFRESH_MS,
  });

  const { data: summary } = useQuery<AccountSummary>({
    queryKey: ['account', 'summary'],
    queryFn: accountApi.summary,
    refetchInterval: REFRESH_MS,
  });

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ['portfolios'],
    queryFn: portfolioApi.list,
    refetchInterval: REFRESH_MS,
  });

  const { data: symbols = [] } = useQuery({
    queryKey: ['symbols'],
    queryFn: symbolApi.list,
    staleTime: 60_000,
  });
  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s]));

  const positionQueries = useQueries({
    queries: portfolios.map(pf => ({
      queryKey: ['positions', pf.id],
      queryFn: () => positionApi.list(pf.id),
      refetchInterval: REFRESH_MS,
    })),
  });

  const allPositions: EnrichedPosition[] = positionQueries.flatMap((q, i) => {
    const pf = portfolios[i];
    return (q.data ?? []).map(p => ({
      ...p,
      portfolioName: pf?.name ?? `Portfolio ${p.portfolio_id}`,
      ticker: symbolMap[p.symbol_id]?.ticker ?? '',
      exchange: symbolMap[p.symbol_id]?.exchange ?? '',
    }));
  });

  const dayPnl = ((ibkr?.unrealized_pnl ?? 0) + (ibkr?.realized_pnl ?? 0)) || null;
  const totalBudget = summary?.total_budget ?? null;
  const cashAvailable = summary ? summary.total_budget - summary.total_cash_reserved - summary.total_cash_deployed : null;

  return (
    <div style={{ padding: 32, maxWidth: 1300 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>IBKR Dashboard</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Live account data · refreshes every 15s</div>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <HeroStat label="Net Asset Value" value={fmtK(ibkr?.net_liquidation)} />
        <HeroStat label="Buying Power" value={fmtK(ibkr?.buying_power)} />
        <HeroStat label="Available Funds" value={fmtK(ibkr?.available_funds)} />
        <HeroStat
          label="Day P&L"
          value={dayPnl != null ? pnlSign(dayPnl) : '—'}
          color={pnlColor(dayPnl)}
          sub={`Unrealized ${pnlSign(ibkr?.unrealized_pnl)} · Realized ${pnlSign(ibkr?.realized_pnl)}`}
        />
      </div>

      {/* Detail cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {/* IBKR Account */}
        <Card title="IBKR Account">
          <Row label="Net Liquidation" value={fmt(ibkr?.net_liquidation)} />
          <Row label="Total Cash" value={fmt(ibkr?.total_cash)} />
          <Row label="Buying Power" value={fmt(ibkr?.buying_power)} />
          <Row label="Available Funds" value={fmt(ibkr?.available_funds)} />
          <Row label="Gross Position Value" value={fmt(ibkr?.gross_position_value)} />
          <Row label="Maintenance Margin" value={fmt(ibkr?.maint_margin_req)} />
          <Row label="Day Trades Remaining" value={ibkr?.day_trades_remaining != null ? String(ibkr.day_trades_remaining) : '—'} />
          <Row label="Unrealized P&L" value={pnlSign(ibkr?.unrealized_pnl)} color={pnlColor(ibkr?.unrealized_pnl)} />
          <Row label="Realized P&L" value={pnlSign(ibkr?.realized_pnl)} color={pnlColor(ibkr?.realized_pnl)} />
        </Card>

        {/* Platform Summary */}
        <Card title="Platform Summary">
          <Row label="Portfolios" value={summary ? String(summary.portfolio_count) : '—'} />
          <Row label="Total Budget" value={fmt(totalBudget)} />
          <Row label="Cash Available" value={fmt(cashAvailable)} />
          <Row label="Cash Reserved (Pending)" value={fmt(summary?.total_cash_reserved)} color={summary && summary.total_cash_reserved > 0 ? '#f59e0b' : undefined} />
          <Row label="Cash Deployed (Positions)" value={fmt(summary?.total_cash_deployed)} />
          <Row label="Open Positions" value={summary ? String(summary.open_position_count) : '—'} />
          <Row label="Unrealized P&L" value={pnlSign(summary?.total_unrealized_pnl)} color={pnlColor(summary?.total_unrealized_pnl)} />
          <Row label="Realized P&L" value={pnlSign(summary?.total_realized_pnl)} color={pnlColor(summary?.total_realized_pnl)} />
          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {portfolios.map(pf => {
              const avail = pf.budget_total - pf.cash_reserved - pf.cash_deployed;
              const pnl = pf.realized_pnl + pf.unrealized_pnl_cached;
              return (
                <div key={pf.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', borderRadius: 7, padding: '7px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: pf.mode === 'live' ? '#22c55e' : '#6366f1', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{pf.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{pf.mode}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>avail {fmtK(avail)}</span>
                    <span style={{ color: pnlColor(pnl), fontWeight: 600 }}>{pnlSign(pnl)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Positions */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Open Positions</h2>
      <PositionsTable positions={allPositions} />
    </div>
  );
}
