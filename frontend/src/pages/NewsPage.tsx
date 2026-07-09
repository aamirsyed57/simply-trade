import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Newspaper, Plus, X, RefreshCw, Search, Clock, Zap, ExternalLink, Filter,
} from 'lucide-react';
import { newsApi, type NewsItem } from '../api/index';
import { SymbolSearchModal } from '../components/SymbolSearchModal';

const DEFAULT_TICKERS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes — headlines don't need per-minute polling
const BREAKING_MS = 2 * 60 * 60 * 1000; // 2 hours

const APP_TZ = 'Europe/Berlin';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: APP_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function isBreaking(iso: string): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < BREAKING_MS;
}

// ── News card ─────────────────────────────────────────────────────────────────

function NewsCard({ item, onTickerClick, activeFilter }: {
  item: NewsItem;
  onTickerClick: (ticker: string) => void;
  activeFilter: string | null;
}) {
  const breaking = isBreaking(item.published_at);

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        gap: 14,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 96, height: 72, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.thumbnail
          ? <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Newspaper size={20} style={{ opacity: 0.25 }} />
        }
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, flex: 1 }}>
            {item.title}
          </div>
          <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 3 }} />
        </div>

        {item.summary && (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.summary}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {breaking && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
              background: 'rgba(239,68,68,0.14)', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <Zap size={9} /> Breaking
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {item.publisher} · {fmtRelative(item.published_at)} · {fmtAbsolute(item.published_at)}
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {item.tickers.map(t => (
              <span
                key={t}
                onClick={e => { e.preventDefault(); e.stopPropagation(); onTickerClick(t); }}
                style={{
                  padding: '1px 7px', borderRadius: 100, fontSize: 10, fontWeight: 700,
                  background: activeFilter === t ? 'var(--accent)' : 'rgba(79,125,243,0.12)',
                  color: activeFilter === t ? '#fff' : 'var(--accent)',
                  cursor: 'pointer',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </a>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: 14,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <div style={{ width: 96, height: 72, flexShrink: 0, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
        <div style={{ height: 12, width: '80%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 10, width: '95%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function NewsPage() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const { data: news = [], isLoading, isFetching, isError, error, dataUpdatedAt } = useQuery<NewsItem[]>({
    queryKey: ['news', tickers.join(','), refreshSignal],
    queryFn: () => newsApi.list(tickers, 8),
    staleTime: REFRESH_MS - 10_000,
    retry: 2,
  });

  // Auto-refresh countdown
  useEffect(() => {
    setCountdown(REFRESH_MS / 1000);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setRefreshSignal(s => s + 1);
          return REFRESH_MS / 1000;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tickers]);

  const addTicker = useCallback((ticker: string) => {
    setTickers(prev => prev.includes(ticker) ? prev : [...prev, ticker]);
  }, []);

  const removeTicker = useCallback((ticker: string) => {
    setTickers(prev => prev.filter(t => t !== ticker));
    setActiveFilter(f => (f === ticker ? null : f));
  }, []);

  const toggleFilter = useCallback((ticker: string) => {
    setActiveFilter(f => (f === ticker ? null : ticker));
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return news.filter(item => {
      if (activeFilter && !item.tickers.includes(activeFilter)) return false;
      if (kw && !(
        item.title.toLowerCase().includes(kw) ||
        item.summary?.toLowerCase().includes(kw) ||
        item.publisher.toLowerCase().includes(kw)
      )) return false;
      return true;
    });
  }, [news, activeFilter, keyword]);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Newspaper size={20} color="var(--accent)" />
            Market News
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Aggregated headlines across your watchlist · surfaces possible movers and trade ideas · via Yahoo Finance
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Keyword search */}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="Filter headlines…"
              style={{
                padding: '6px 10px 6px 26px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 11.5,
                outline: 'none',
                width: 160,
              }}
            />
          </div>

          {/* Manual refresh + countdown */}
          <button
            onClick={() => { setRefreshSignal(s => s + 1); setCountdown(REFRESH_MS / 1000); }}
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
            <RefreshCw size={12} className={isFetching ? 'spin' : undefined} />
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

      {/* ── Watchlist ticker chips ── */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'none', cursor: 'pointer',
              }}
            >
              <Filter size={10} /> Clear filter ({activeFilter})
            </button>
          )}
          {tickers.map(t => (
            <div
              key={t}
              onClick={() => toggleFilter(t)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 8px 3px 10px',
                background: activeFilter === t ? 'var(--accent)' : 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                fontSize: 11, fontWeight: 700,
                color: activeFilter === t ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {t}
              <button
                onClick={e => { e.stopPropagation(); removeTicker(t); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14,
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: '50%',
                  color: activeFilter === t ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.3)'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lastUpdated && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Updated {lastUpdated} · {filtered.length} of {news.length} headlines
        </div>
      )}

      {/* ── Error state ── */}
      {isError && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, color: '#ef4444', fontSize: 13,
        }}>
          Failed to load news: {(error as Error)?.message ?? 'Unknown error'}
        </div>
      )}

      {/* ── Feed ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}

        {!isLoading && filtered.map(item => (
          <NewsCard key={item.id} item={item} onTickerClick={toggleFilter} activeFilter={activeFilter} />
        ))}

        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, minHeight: 240,
            border: '2px dashed var(--border)', borderRadius: 16, color: 'var(--text-muted)',
          }}>
            <Newspaper size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>
              {news.length === 0 ? 'No headlines found for this watchlist.' : 'No headlines match your filters.'}
            </div>
          </div>
        )}
      </div>

      {/* ── Add symbol modal ── */}
      {showAdd && (
        <SymbolSearchModal
          existing={tickers}
          onAdd={addTicker}
          onClose={() => setShowAdd(false)}
        />
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
