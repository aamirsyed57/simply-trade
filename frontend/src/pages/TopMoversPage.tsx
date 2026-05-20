import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { marketApi, type Mover, type MarketInfo } from '../api/index';

const REFRESH_MS = 5 * 60 * 1000;

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtPrice(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function fmtCap(v: number | null | undefined) {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const sign = v >= 0 ? '+' : '';
  const color = v >= 0 ? '#22c55e' : '#ef4444';
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {sign}{v.toFixed(2)}%
    </span>
  );
}

// ── Sparkline (pure SVG) ───────────────────────────────────────────────────

function Sparkline({ prices, positive }: { prices: number[]; positive: boolean }) {
  if (prices.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;

  const W = 80, H = 28, PAD = 2;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => {
    const x = PAD + (i / (prices.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (p - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const color = positive ? '#22c55e' : '#ef4444';
  const fill = positive ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';

  // Closed area path for the fill
  const areaD = `M ${pts[0]} L ${pts.join(' L ')} L ${(W - PAD).toFixed(1)},${(H - PAD).toFixed(1)} L ${PAD},${(H - PAD).toFixed(1)} Z`;
  const lineD = `M ${pts.join(' L ')}`;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={areaD} fill={fill} stroke="none" />
      <path d={lineD} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Period badge ───────────────────────────────────────────────────────────

function PctBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pos = value >= 0;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 5,
      background: pos ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
      color: pos ? '#22c55e' : '#ef4444',
      fontWeight: 700,
      fontSize: 12,
      fontVariantNumeric: 'tabular-nums',
    }}>
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

// ── Mover row ──────────────────────────────────────────────────────────────

function MoverRow({ mover, rank }: { mover: Mover; rank: number }) {
  const todayPos = mover.change_pct >= 0;
  const todayColor = todayPos ? '#22c55e' : '#ef4444';

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>#{rank}</span>
      </td>
      <td style={td}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{mover.ticker}</span>
      </td>
      <td style={{ ...td, padding: '8px 14px' }}>
        <Sparkline prices={mover.sparkline} positive={todayPos} />
      </td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {fmtPrice(mover.price)}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        <span style={{
          display: 'inline-block',
          padding: '2px 7px',
          borderRadius: 5,
          background: todayPos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: todayColor,
          fontWeight: 700,
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {mover.change_pct >= 0 ? '+' : ''}{mover.change_pct.toFixed(2)}%
        </span>
      </td>
      <td style={{ ...td, textAlign: 'right' }}><PctBadge value={mover.change_1m} /></td>
      <td style={{ ...td, textAlign: 'right' }}><PctBadge value={mover.change_6m} /></td>
      <td style={{ ...td, textAlign: 'right' }}><PctBadge value={mover.change_1y} /></td>
      <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {fmtCap(mover.market_cap)}
      </td>
      <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {fmtVol(mover.volume)}
      </td>
    </tr>
  );
}

const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' };

// ── Movers table ───────────────────────────────────────────────────────────

const HEADERS = ['#', 'Ticker', '1M Trend', 'Price', 'Today', '1 Month', '6 Months', '1 Year', 'Mkt Cap', 'Volume'];

function MoversTable({ movers, type }: { movers: Mover[]; type: 'gainers' | 'losers' }) {
  const isGainer = type === 'gainers';
  const color = isGainer ? '#22c55e' : '#ef4444';
  const Icon = isGainer ? TrendingUp : TrendingDown;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} color={color} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Top {isGainer ? 'Gainers' : 'Losers'}
        </span>
      </div>

      {movers.length === 0 ? (
        <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          No data
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {HEADERS.map((h, i) => (
                <th key={h} style={{
                  padding: '8px 14px',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  textAlign: i >= 3 ? 'right' : 'left',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movers.map((m, i) => (
              <MoverRow key={m.ticker} mover={m} rank={i + 1} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function TopMoversPage() {
  const [selectedMarket, setSelectedMarket] = useState('sp500');

  const { data: markets = [] } = useQuery<MarketInfo[]>({
    queryKey: ['markets'],
    queryFn: marketApi.markets,
    staleTime: Infinity,
  });

  const { data, isFetching, isLoading, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['top-movers', selectedMarket],
    queryFn: () => marketApi.topMovers(selectedMarket),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const asOf = data?.as_of
    ? new Date(data.as_of).toLocaleDateString('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'medium' })
    : null;

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Top Movers</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Top 5 gainers &amp; losers · data via Yahoo Finance · refreshes every 5 min
          </div>
        </div>

        <select
          value={selectedMarket}
          onChange={e => setSelectedMarket(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            minWidth: 180,
          }}
        >
          {markets.length === 0 ? (
            <option value="sp500">S&amp;P 500 (Top 50)</option>
          ) : (
            markets.map(m => <option key={m.key} value={m.key}>{m.label}</option>)
          )}
        </select>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: isFetching ? 'var(--text-muted)' : 'var(--text-primary)',
            fontSize: 12,
            cursor: isFetching ? 'default' : 'pointer',
          }}
        >
          <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>

        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Fetched {lastUpdated}{asOf ? ` · Data as of ${asOf}` : ''}
          </span>
        )}
      </div>

      {isError && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10,
          color: '#ef4444',
          fontSize: 13,
          marginBottom: 20,
        }}>
          Failed to load market data: {(error as Error)?.message ?? 'Unknown error'}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              height: 220,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              Loading…
            </div>
          ))}
        </div>
      )}

      {data && !isLoading && (
        <>
          <MoversTable movers={data.gainers} type="gainers" />
          <MoversTable movers={data.losers} type="losers" />
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
