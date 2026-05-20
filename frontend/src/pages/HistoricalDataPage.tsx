import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Database, Trash2, RefreshCw, FileText, CheckCircle,
  AlertCircle, ChevronDown, BarChart2, X, TrendingUp, Calendar,
} from 'lucide-react';
import { symbolApi } from '../api/index';

const BASE = '/api/v1';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface TimeframeSummary {
  timeframe: string;
  bar_count: number;
}

interface SymbolSummary {
  symbol_id: number;
  ticker: string;
  timeframes: TimeframeSummary[];
}

interface BarRow {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UploadResult {
  rows_inserted: number;
  rows_skipped: number;
  message: string;
}

interface FetchTask {
  task_id: string;
  status: string;
  result: { status: string; inserted?: number; message?: string } | null;
}

const historicalApi = {
  summary: (sid: number) => req<SymbolSummary>(`/historical/summary/${sid}`),
  bars: (sid: number, tf: string, limit = 200) =>
    req<BarRow[]>(`/historical/bars/${sid}?timeframe=${tf}&limit=${limit}`),
  deleteBars: (sid: number, tf?: string) =>
    req<{ deleted: number }>(`/historical/bars/${sid}${tf ? `?timeframe=${tf}` : ''}`, { method: 'DELETE' }),
  fetchYFinance: (payload: {
    symbol_id: number; timeframe: string; start: string; end: string; yf_ticker?: string;
  }) => req<{ task_id: string; message: string }>('/historical/yfinance', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  taskStatus: (taskId: string) => req<FetchTask>(`/historical/task/${taskId}`),
};

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'];

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-primary)',
  border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ──────────────────────────────────────────────────────────
// Mini SVG price chart
// ──────────────────────────────────────────────────────────
function PriceChart({ bars }: { bars: BarRow[] }) {
  if (!bars.length) return null;
  const W = 560, H = 120, PAD = 8;
  const closes = bars.map(b => b.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const range = maxV - minV || 1;
  const scaleY = (v: number) => PAD + (1 - (v - minV) / range) * (H - PAD * 2);
  const scaleX = (i: number) => PAD + (i / (bars.length - 1)) * (W - PAD * 2);

  const points = bars.map((b, i) => `${scaleX(i).toFixed(1)},${scaleY(b.close).toFixed(1)}`).join(' ');
  const areaPoints = `${scaleX(0)},${H - PAD} ${points} ${scaleX(bars.length - 1)},${H - PAD}`;

  const pnl = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  const lineColor = pnl >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div style={{ marginTop: 12, background: 'var(--bg-primary)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Price preview ({bars.length} bars)</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: lineColor }}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#chartGrad)" />
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>{new Date(bars[0].ts).toLocaleDateString()}</span>
        <span>{new Date(bars[bars.length - 1].ts).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// CSV Upload Drop Zone
// ──────────────────────────────────────────────────────────
function UploadZone({
  symbolId, ticker: _ticker, onSuccess,
}: { symbolId: number; ticker: string; onSuccess: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [timeframe, setTimeframe] = useState('1d');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = useCallback(async (file: File) => {
    setError('');
    setResult(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${BASE}/historical/upload?symbol_id=${symbolId}&timeframe=${timeframe}`,
        { method: 'POST', body: form },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Upload failed');
      setResult(data as UploadResult);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [symbolId, timeframe, onSuccess]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  }, [doUpload]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
  };

  return (
    <div style={{ marginTop: 16 }}>
      {/* Timeframe selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Timeframe:</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                background: timeframe === tf ? 'var(--accent)' : 'var(--bg-primary)',
                color: timeframe === tf ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${timeframe === tf ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: timeframe === tf ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 10,
          padding: '28px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(79,125,243,0.06)' : 'var(--bg-primary)',
          transition: 'all 0.2s',
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
        {uploading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⏳</div>
            Importing bars…
          </div>
        ) : (
          <>
            <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop CSV here or click to browse</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Columns: <code>ts, open, high, low, close, volume</code> (Yahoo Finance format also supported)
            </div>
          </>
        )}
      </div>

      {/* Result / error */}
      {result && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <CheckCircle size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#22c55e' }}>Import successful</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{result.message}</div>
          </div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>
        </div>
      )}

      {/* Format hint */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 7, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Accepted CSV Formats</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>Standard:</strong> ts, open, high, low, close, volume</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>Yahoo Finance:</strong> Date, Open, High, Low, Close, Adj Close, Volume</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>Alpha Vantage:</strong> timestamp, open, high, low, close, volume</div>
          <div style={{ marginTop: 4 }}>Timestamps accepted as ISO 8601, Unix epoch, or YYYY-MM-DD (treated as UTC).</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Yahoo Finance fetch panel
// ──────────────────────────────────────────────────────────
const YF_LIMITS: Record<string, string> = {
  '1m': '7-day max', '5m': '60-day max', '15m': '60-day max',
  '1h': '2-year max', '1d': 'unlimited',
};

function YFinanceFetchPanel({
  symbolId, ticker, onSuccess,
}: { symbolId: number; ticker: string; onSuccess: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [timeframe, setTimeframe] = useState('1d');
  const [start, setStart] = useState(oneYearAgo);
  const [end, setEnd] = useState(today);
  const [yfTicker, setYfTicker] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [pollResult, setPollResult] = useState<FetchTask['result']>(null);
  const [error, setError] = useState('');

  // Poll every 2 s while task is in-flight
  useEffect(() => {
    if (!taskId || pollStatus === 'SUCCESS' || pollStatus === 'FAILURE') return;
    const iv = setInterval(async () => {
      try {
        const t = await historicalApi.taskStatus(taskId);
        setPollStatus(t.status);
        if (t.result) {
          setPollResult(t.result);
          if (t.status === 'SUCCESS') onSuccess();
        }
      } catch { /* ignore transient errors */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [taskId, pollStatus, onSuccess]);

  const handleFetch = async () => {
    setError('');
    setTaskId(null);
    setPollStatus(null);
    setPollResult(null);
    setLoading(true);
    try {
      const res = await historicalApi.fetchYFinance({
        symbol_id: symbolId,
        timeframe,
        start: new Date(start).toISOString(),
        end: new Date(end + 'T23:59:59Z').toISOString(),
        yf_ticker: yfTicker.trim() || undefined,
      });
      setTaskId(res.task_id);
      setPollStatus('PENDING');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const isRunning = pollStatus === 'PENDING' || pollStatus === 'STARTED';
  const isDone = pollStatus === 'SUCCESS' || pollStatus === 'FAILURE';

  return (
    <div style={{ marginTop: 16 }}>
      {/* Timeframe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, minWidth: 76 }}>Timeframe:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              title={YF_LIMITS[tf]}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                background: timeframe === tf ? 'var(--accent)' : 'var(--bg-primary)',
                color: timeframe === tf ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${timeframe === tf ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: timeframe === tf ? 600 : 400, transition: 'all 0.15s',
              }}
            >{tf}</button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>
            {YF_LIMITS[timeframe]}
          </span>
        </div>
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            <Calendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Start
          </label>
          <input type="date" style={inp} value={start} max={end}
            onChange={e => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            <Calendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />End
          </label>
          <input type="date" style={inp} value={end} min={start} max={today}
            onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

      {/* Advanced (yf_ticker override) */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <ChevronDown size={12} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        Advanced options
      </button>
      {showAdvanced && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Yahoo Finance ticker override
          </label>
          <input
            style={{ ...inp, maxWidth: 200 }}
            placeholder={`default: ${ticker}`}
            value={yfTicker}
            onChange={e => setYfTicker(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Use when the Yahoo ticker differs — e.g. <code>VOD.L</code>, <code>SAP.DE</code>
          </div>
        </div>
      )}

      {/* Fetch button */}
      <button
        onClick={handleFetch}
        disabled={loading || isRunning}
        style={{
          padding: '8px 18px', background: loading || isRunning ? 'var(--bg-surface)' : '#16a34a',
          border: 'none', borderRadius: 7, color: loading || isRunning ? 'var(--text-muted)' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: loading || isRunning ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
        }}
      >
        <TrendingUp size={14} />
        {loading ? 'Queuing…' : isRunning ? 'Fetching from Yahoo…' : 'Fetch from Yahoo Finance'}
      </button>

      {/* Status */}
      {isRunning && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(79,125,243,0.08)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 7, fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <RefreshCw size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          Downloading bars… task <code style={{ fontSize: 11 }}>{taskId?.slice(0, 8)}</code>
        </div>
      )}
      {isDone && pollResult && pollStatus === 'SUCCESS' && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <CheckCircle size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#22c55e' }}>Done</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
              {pollResult.inserted ?? 0} bars inserted
            </div>
          </div>
        </div>
      )}
      {isDone && pollStatus === 'FAILURE' && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#ef4444' }}>Fetch failed. Check worker logs for details.</div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, display: 'flex', gap: 8 }}>
          <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Symbol data card
// ──────────────────────────────────────────────────────────
function SymbolCard({ symbolId, ticker }: { symbolId: number; ticker: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [previewTf, setPreviewTf] = useState<string | null>(null);

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['hist-summary', symbolId],
    queryFn: () => historicalApi.summary(symbolId),
    enabled: expanded,
  });

  const { data: bars = [] } = useQuery({
    queryKey: ['hist-bars', symbolId, previewTf],
    queryFn: () => historicalApi.bars(symbolId, previewTf!, 300),
    enabled: !!previewTf,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ tf }: { tf?: string }) => historicalApi.deleteBars(symbolId, tf),
    onSuccess: () => {
      refetchSummary();
      setPreviewTf(null);
      qc.invalidateQueries({ queryKey: ['hist-bars', symbolId] });
    },
  });

  const totalBars = summary?.timeframes.reduce((s, t) => s + t.bar_count, 0) ?? 0;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {/* Header */}
      <div
        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(79,125,243,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart2 size={16} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{ticker}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {expanded && summary
                ? `${totalBars.toLocaleString()} bars · ${summary.timeframes.length} timeframe${summary.timeframes.length !== 1 ? 's' : ''}`
                : 'Click to manage data'}
            </div>
          </div>
        </div>
        <ChevronDown
          size={16}
          color="var(--text-muted)"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px 20px' }}>
          {/* Coverage table */}
          {summary && summary.timeframes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Stored Data
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summary.timeframes.map(tf => (
                  <div
                    key={tf.timeframe}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 7,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, padding: '2px 8px',
                        background: 'rgba(79,125,243,0.12)', color: 'var(--accent)',
                        borderRadius: 4, border: '1px solid rgba(79,125,243,0.2)',
                      }}>
                        {tf.timeframe}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{tf.bar_count.toLocaleString()} bars</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setPreviewTf(previewTf === tf.timeframe ? null : tf.timeframe)}
                        style={{
                          padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                          background: previewTf === tf.timeframe ? 'var(--accent)' : 'var(--bg-primary)',
                          color: previewTf === tf.timeframe ? '#fff' : 'var(--text-muted)',
                          border: `1px solid ${previewTf === tf.timeframe ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {previewTf === tf.timeframe ? 'Hide Chart' : 'Preview'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete all ${tf.timeframe} bars for ${ticker}?`)) {
                            deleteMutation.mutate({ tf: tf.timeframe });
                          }
                        }}
                        style={{ padding: '4px 8px', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--danger)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price chart preview */}
          {previewTf && bars.length > 0 && <PriceChart bars={bars} />}
          {previewTf && bars.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>No bars found for {previewTf}.</div>
          )}

          {/* Upload zone */}
          <div style={{ marginTop: summary && summary.timeframes.length > 0 ? 20 : 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Import CSV Data
            </div>
            <UploadZone symbolId={symbolId} ticker={ticker} onSuccess={() => refetchSummary()} />
          </div>

          {/* Yahoo Finance fetch */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={13} color="#16a34a" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Fetch from Yahoo Finance
              </span>
            </div>
            <YFinanceFetchPanel symbolId={symbolId} ticker={ticker} onSuccess={() => refetchSummary()} />
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Add Symbol mini form (inline with Yahoo Search)
// ──────────────────────────────────────────────────────────
function AddSymbolForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('');
  const [error, setError] = useState('');

  const { data: suggestions, isFetching } = useQuery({
    queryKey: ['symbol-search', search],
    queryFn: () => symbolApi.search(search),
    enabled: search.length >= 2,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => symbolApi.create({ ticker, exchange }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['symbols'] }); onDone(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Search & Add Symbol (Yahoo Finance)</span>
        <button onClick={onDone} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Search Company or Ticker</label>
        <div style={{ position: 'relative' }}>
          <input
            style={inp}
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setTicker(''); // Reset selection when typing
            }}
            placeholder="e.g. Apple or AAPL..."
          />
          {isFetching && <div style={{ position: 'absolute', right: 10, top: 8, fontSize: 12, color: 'var(--text-muted)' }}>Searching...</div>}
        </div>
      </div>

      {search.length >= 2 && !ticker && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
          {!isFetching && (!suggestions || suggestions.length === 0) && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No suggestions found.</div>
          )}
          {suggestions?.map((s, i) => (
            <div
              key={i}
              onClick={() => {
                setTicker(s.ticker);
                setExchange(s.exchange || 'UNKNOWN');
                setSearch(`${s.ticker} - ${s.name}`);
              }}
              style={{
                padding: '8px 12px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,125,243,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.ticker}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.name}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                <div>{s.exchange}</div>
                <div style={{ textTransform: 'uppercase' }}>{s.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ticker && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--bg-primary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Selected Ticker</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ticker}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exchange</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{exchange}</div>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            style={{
              padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {createMutation.isPending ? 'Adding…' : 'Add Symbol'}
          </button>
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────
export function HistoricalDataPage() {
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [search, setSearch] = useState('');

  const { data: symbols = [], isLoading, refetch } = useQuery({
    queryKey: ['symbols'],
    queryFn: symbolApi.list,
  });

  const filtered = symbols.filter(s =>
    s.ticker.toLowerCase().includes(search.toLowerCase()) ||
    s.exchange.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Historical Data</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Manage OHLCV bars for {symbols.length} symbol{symbols.length !== 1 ? 's' : ''} — import via CSV for backtesting
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => refetch()}
            style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => setShowAddSymbol(s => !s)}
            style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
          >
            <Database size={14} /> Add Symbol
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '12px 16px', background: 'rgba(79,125,243,0.08)', border: '1px solid rgba(79,125,243,0.2)', borderRadius: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <FileText size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Populate historical bars for backtesting via{' '}
          <strong style={{ color: '#16a34a' }}>Yahoo Finance fetch</strong> (automatic, date-range picker) or{' '}
          <strong style={{ color: 'var(--text-primary)' }}>CSV upload</strong> (Yahoo Finance, Alpha Vantage, and
          any <code style={{ background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 3 }}>ts, open, high, low, close, volume</code> format).
        </span>
      </div>

      {/* Add symbol form */}
      {showAddSymbol && <AddSymbolForm onDone={() => setShowAddSymbol(false)} />}

      {/* Search */}
      {symbols.length > 3 && (
        <div style={{ marginBottom: 16 }}>
          <input
            style={{ ...inp, maxWidth: 300 }}
            placeholder="Search symbols…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Symbol cards */}
      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      {!isLoading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <Database size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No symbols found</div>
          <div style={{ fontSize: 13 }}>Add a symbol above, then import CSV data for it.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(sym => (
          <SymbolCard key={sym.id} symbolId={sym.id} ticker={`${sym.ticker} · ${sym.exchange}`} />
        ))}
      </div>
    </div>
  );
}
