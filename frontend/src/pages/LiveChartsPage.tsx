import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Plus, X, RefreshCw, Maximize2, LayoutGrid,
  TrendingUp, TrendingDown, Clock, ChevronDown,
} from 'lucide-react';
import { quoteApi, type Bar } from '../api/index';
import { CandlestickChart } from '../components/CandlestickChart';
import { SymbolSearchModal } from '../components/SymbolSearchModal';

// ── Types & constants ─────────────────────────────────────────────────────────

interface ActiveChart {
  ticker: string;
  interval: string;
  period: string;
}

const INTERVALS = [
  { value: '1m',  label: '1m' },
  { value: '5m',  label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '60m', label: '60m' },
  { value: '1d',  label: '1D' },
];

const PERIODS_BY_INTERVAL: Record<string, Array<{ value: string; label: string }>> = {
  '1m':  [{ value: '1d', label: '1 Day' }, { value: '5d', label: '5 Days' }, { value: '7d', label: '7 Days' }],
  '5m':  [{ value: '1d', label: '1 Day' }, { value: '5d', label: '5 Days' }, { value: '1mo', label: '1 Month' }],
  '15m': [{ value: '1d', label: '1 Day' }, { value: '5d', label: '5 Days' }, { value: '1mo', label: '1 Month' }],
  '30m': [{ value: '5d', label: '5 Days' }, { value: '1mo', label: '1 Month' }],
  '60m': [{ value: '5d', label: '5 Days' }, { value: '1mo', label: '1 Month' }, { value: '3mo', label: '3 Months' }, { value: '6mo', label: '6 Months' }],
  '1d':  [{ value: '1mo', label: '1 Month' }, { value: '3mo', label: '3 Months' }, { value: '6mo', label: '6 Months' }, { value: '1y', label: '1 Year' }, { value: 'ytd', label: 'YTD' }, { value: '5y', label: '5 Years' }],
};

// Periods that require daily bars — auto-switch interval to 1d when selected
const LONG_PERIODS = new Set(['6mo', '1y', 'ytd', '5y']);

const REFRESH_MS = 60_000; // 1 minute

const DEFAULT_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'TSLA'];

const TIMEZONES = [
  { value: 'local', label: 'Local' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'UTC', label: 'UTC' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tzAbbr(timezone: string): string {
  if (timezone === 'local') {
    return new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? 'Local';
  }
  return new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? timezone;
}

function fmtPrice(v: number | undefined) {
  if (v == null) return '—';
  if (v >= 1000) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (v >= 10)   return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function changePct(bars: Bar[]): number | null {
  if (bars.length < 2) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  return ((last - first) / first) * 100;
}

function lastClose(bars: Bar[]): number | undefined {
  return bars.length ? bars[bars.length - 1].close : undefined;
}

// ── Single chart card ─────────────────────────────────────────────────────────

function ChartCard({
  chart,
  onRemove,
  width,
  refreshSignal,
  timezone,
}: {
  chart: ActiveChart;
  onRemove: () => void;
  width: number;
  refreshSignal: number;
  timezone: string;
}) {
  const { data: bars = [], isLoading, isFetching, dataUpdatedAt } = useQuery<Bar[]>({
    queryKey: ['intraday', chart.ticker, chart.period, chart.interval, refreshSignal],
    queryFn: () => quoteApi.intraday(chart.ticker, chart.period, chart.interval),
    staleTime: REFRESH_MS - 5_000,
    retry: 2,
  });

  const pct = changePct(bars);
  const price = lastClose(bars);
  const isUp = pct == null ? null : pct >= 0;
  const accentColor = isUp === null ? 'var(--accent)' : isUp ? '#22c55e' : '#ef4444';

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        ...(timezone !== 'local' ? { timeZone: timezone } : {}),
      })
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderTop: `2px solid ${accentColor}`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.3s ease',
    }}>
      {/* Card header */}
      <div style={{
        padding: '10px 14px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.01)',
      }}>
        {/* Ticker + price */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.03em', color: 'var(--text-primary)' }}>
              {chart.ticker}
            </span>
            {price != null && (
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPrice(price)}
              </span>
            )}
            {pct != null && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                background: isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                color: accentColor,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            )}
          </div>
          {lastUpdated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              {/* live pulse dot */}
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isFetching ? '#f59e0b' : accentColor,
                display: 'inline-block',
                animation: isFetching ? 'none' : 'livePulse 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {isFetching ? 'Refreshing…' : `Updated ${lastUpdated}`} · {bars.length} bars
              </span>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onRemove}
          title="Remove chart"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, flexShrink: 0,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Chart area */}
      <div style={{ padding: '8px 4px 4px' }}>
        <CandlestickChart
          bars={bars}
          width={width - 8}
          loading={isLoading}
          interval={chart.interval}
          timezone={timezone}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LiveChartsPage() {
  const [charts, setCharts] = useState<ActiveChart[]>(() =>
    DEFAULT_TICKERS.map(ticker => ({ ticker, interval: '1m', period: '1d' }))
  );
  const [globalInterval, setGlobalInterval] = useState('1m');
  const [globalPeriod, setGlobalPeriod] = useState('1d');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  const [layout, setLayout] = useState<'grid' | 'stack'>('grid');
  const [showAdd, setShowAdd] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [countdown, setCountdown] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width for responsive charts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-refresh countdown
  useEffect(() => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setRefreshSignal(s => s + 1);
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addChart = useCallback((ticker: string) => {
    setCharts(prev => {
      if (prev.some(c => c.ticker === ticker)) return prev;
      return [...prev, { ticker, interval: globalInterval, period: globalPeriod }];
    });
  }, [globalInterval, globalPeriod]);

  const removeChart = useCallback((ticker: string) => {
    setCharts(prev => prev.filter(c => c.ticker !== ticker));
  }, []);

  const applyGlobalSettings = useCallback(() => {
    setCharts(prev => prev.map(c => ({ ...c, interval: globalInterval, period: globalPeriod })));
    setRefreshSignal(s => s + 1);
  }, [globalInterval, globalPeriod]);

  // Apply global interval/period whenever they change
  useEffect(() => {
    applyGlobalSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalInterval, globalPeriod]);

  // Compute chart card width based on layout + count
  const cols = layout === 'stack' ? 1
    : charts.length === 1 ? 1
    : charts.length <= 4 ? 2
    : 3;
  const gap = 16;
  const cardW = Math.floor((containerWidth - gap * (cols - 1)) / cols);

  const periodOptions = PERIODS_BY_INTERVAL[globalInterval] ?? PERIODS_BY_INTERVAL['1m'];

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <LineChart size={20} color="var(--accent)" />
            Live Charts
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Per-minute OHLCV candlesticks · auto-refreshes every minute via Yahoo Finance
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Interval selector */}
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {INTERVALS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setGlobalInterval(value);
                  // Reset period to first valid option for this interval if current period isn't in the list
                  const validPeriods = PERIODS_BY_INTERVAL[value] ?? [];
                  if (!validPeriods.some(p => p.value === globalPeriod)) {
                    setGlobalPeriod(validPeriods[0]?.value ?? '1d');
                  }
                }}
                style={{
                  padding: '5px 10px',
                  background: globalInterval === value ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  color: globalInterval === value ? '#fff' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: globalInterval === value ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Period selector */}
          <div style={{ position: 'relative' }}>
            <select
              value={globalPeriod}
              onChange={e => {
                const val = e.target.value;
                // Long periods only work with daily bars
                if (LONG_PERIODS.has(val)) setGlobalInterval('1d');
                setGlobalPeriod(val);
              }}
              style={{
                padding: '5px 28px 5px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 11,
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
              }}
            >
              {periodOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Timezone selector */}
          <div style={{ position: 'relative' }} title="Timezone for chart axes and timestamps">
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              style={{
                padding: '5px 28px 5px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 11,
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
              }}
            >
              {TIMEZONES.map(({ value, label }) => (
                <option key={value} value={value}>{label} ({tzAbbr(value)})</option>
              ))}
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* Layout toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setLayout('grid')}
              title="Grid layout"
              style={{
                padding: '5px 9px',
                background: layout === 'grid' ? 'rgba(79,125,243,0.18)' : 'transparent',
                border: 'none',
                color: layout === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setLayout('stack')}
              title="Stacked layout"
              style={{
                padding: '5px 9px',
                background: layout === 'stack' ? 'rgba(79,125,243,0.18)' : 'transparent',
                border: 'none',
                color: layout === 'stack' ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Manual refresh + countdown */}
          <button
            onClick={() => { setRefreshSignal(s => s + 1); setCountdown(60); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <Clock size={11} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>Next: {countdown}s</span>
            <span style={{ opacity: 0.6 }}>· {tzAbbr(timezone)}</span>
          </div>

          {/* Add symbol */}
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
          >
            <Plus size={13} />
            Add Symbol
          </button>
        </div>
      </div>

      {/* ── Active ticker chips ── */}
      {charts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {charts.map(c => (
            <div
              key={c.ticker}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 8px 3px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                fontSize: 11, fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {c.ticker}
              <button
                onClick={() => removeChart(c.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14,
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.3)'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Chart grid ── */}
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap,
          flex: 1,
        }}
      >
        {charts.map(chart => (
          <ChartCard
            key={chart.ticker}
            chart={chart}
            onRemove={() => removeChart(chart.ticker)}
            width={cardW}
            refreshSignal={refreshSignal}
            timezone={timezone}
          />
        ))}

        {charts.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16,
            minHeight: 320,
            border: '2px dashed var(--border)',
            borderRadius: 16,
            color: 'var(--text-muted)',
          }}>
            <LineChart size={40} style={{ opacity: 0.3 }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
                No charts added yet
              </div>
              <div style={{ fontSize: 13 }}>Click "Add Symbol" to start watching live charts</div>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                padding: '8px 18px',
                background: 'var(--accent)',
                border: 'none', borderRadius: 8,
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Plus size={14} />
              Add Symbol
            </button>
          </div>
        )}
      </div>

      {/* ── Add symbol modal ── */}
      {showAdd && (
        <SymbolSearchModal
          existing={charts.map(c => c.ticker)}
          onAdd={addChart}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
