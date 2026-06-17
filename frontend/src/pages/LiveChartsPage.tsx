import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Plus, X, RefreshCw, Maximize2, LayoutGrid,
  TrendingUp, TrendingDown, Clock, Search, ChevronDown, Loader,
} from 'lucide-react';
import { quoteApi, symbolApi, type Bar, type SymbolSearchResult } from '../api/index';
import { CandlestickChart } from '../components/CandlestickChart';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
}: {
  chart: ActiveChart;
  onRemove: () => void;
  width: number;
  refreshSignal: number;
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
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
        />
      </div>
    </div>
  );
}

// ── Symbol search / add panel ─────────────────────────────────────────────────

function AddSymbolPanel({
  existing,
  onAdd,
  onClose,
}: {
  existing: string[];
  onAdd: (ticker: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // 300 ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const shouldSearch = debouncedQuery.length >= 1;

  const { data: results = [], isFetching, isError } = useQuery<SymbolSearchResult[]>({
    queryKey: ['symbol-search-yf', debouncedQuery],
    queryFn: () => symbolApi.search(debouncedQuery),
    enabled: shouldSearch,
    staleTime: 30_000,
    retry: 1,
  });

  const handleAdd = (ticker: string) => {
    const t = ticker.toUpperCase().trim();
    if (t && !existing.includes(t)) {
      onAdd(t);
      onClose();
    }
  };

  // First result can be added on Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      if (results.length > 0) handleAdd(results[0].ticker);
      else if (query.trim()) handleAdd(query.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          width: 420,
          maxHeight: '72vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header + search input */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            Add Symbol
          </div>
          <div style={{ position: 'relative' }}>
            {isFetching
              ? <Loader size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
              : <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by ticker or name (e.g. Apple, NVDA, BTC-USD…)"
              style={{
                width: '100%', padding: '9px 10px 9px 32px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
          </div>
          {shouldSearch && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, paddingLeft: 2 }}>
              Powered by Yahoo Finance · Press Enter to add top result
            </div>
          )}
        </div>

        {/* Results list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Empty state — no query yet */}
          {!shouldSearch && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '36px 20px',
              color: 'var(--text-muted)',
            }}>
              <Search size={28} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
                Start typing to search for any stock, ETF, crypto, index, or forex pair
              </div>
            </div>
          )}

          {/* Error state */}
          {isError && shouldSearch && (
            <div style={{
              padding: '14px 16px',
              color: '#ef4444',
              fontSize: 12,
              background: 'rgba(239,68,68,0.06)',
            }}>
              Search failed. Check that the backend is running.
            </div>
          )}

          {/* Loading — first keystroke (no stale data yet) */}
          {isFetching && results.length === 0 && (
            <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 12 }}>
              <Loader size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
              Searching Yahoo Finance…
            </div>
          )}

          {/* Results */}
          {results.map((sym, idx) => {
            const already = existing.includes(sym.ticker.toUpperCase());
            return (
              <button
                key={`${sym.ticker}-${idx}`}
                disabled={already}
                onClick={() => handleAdd(sym.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  color: already ? 'var(--text-muted)' : 'var(--text-primary)',
                  cursor: already ? 'default' : 'pointer',
                  fontSize: 13, textAlign: 'left',
                  transition: 'background 0.12s',
                  gap: 10,
                }}
                onMouseEnter={e => { if (!already) (e.currentTarget as HTMLElement).style.background = 'rgba(79,125,243,0.09)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Left: ticker + name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.02em' }}>
                      {sym.ticker}
                    </span>
                    {sym.type && (
                      <span style={{
                        padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                        background: 'rgba(79,125,243,0.12)', color: 'var(--accent)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                      }}>
                        {sym.type}
                      </span>
                    )}
                  </div>
                  {sym.name && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)', marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {sym.name}
                    </div>
                  )}
                </div>

                {/* Right: exchange or "Added" badge */}
                {already
                  ? <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>Added</span>
                  : sym.exchange && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{sym.exchange}</span>
                  )
                }
              </button>
            );
          })}

          {/* No results */}
          {shouldSearch && !isFetching && results.length === 0 && !isError && (
            <div style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
              No results found for "{debouncedQuery}"
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
        <AddSymbolPanel
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
