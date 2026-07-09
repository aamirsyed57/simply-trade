import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader } from 'lucide-react';
import { symbolApi, type SymbolSearchResult } from '../api/index';

export function SymbolSearchModal({
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
