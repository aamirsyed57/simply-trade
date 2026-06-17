import React, { useRef, useState, useCallback } from 'react';
import type { Bar } from '../api/index';

// ── Constants ────────────────────────────────────────────────────────────────

const CHART_H = 240;   // candlestick area height
const VOL_H = 48;      // volume area height
const GAP_H = 8;       // gap between candle and volume areas
const TOTAL_H = CHART_H + GAP_H + VOL_H;
const PAD_L = 10;      // left padding
const PAD_R = 64;      // right padding for Y-axis labels
const PAD_T = 10;      // top padding
const PAD_B = 22;      // bottom padding for X-axis labels

const UP_COLOR = '#22c55e';
const DOWN_COLOR = '#ef4444';
const DOJI_COLOR = '#7b8aaa';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(4);
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function niceTickCount(range: number, target: number): number[] {
  const rough = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (magnitude * mult >= rough) return [magnitude * mult];
  }
  return [magnitude * 10];
}

function yTicks(min: number, max: number, count = 5): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const [step] = niceTickCount(range, count);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(parseFloat(v.toFixed(10)));
  }
  return ticks;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipData {
  bar: Bar;
  x: number;
  y: number;
  side: 'left' | 'right';
}

function Tooltip({ data }: { data: TooltipData }) {
  const { bar, x, y, side } = data;
  const isUp = bar.close >= bar.open;
  const color = bar.close === bar.open ? DOJI_COLOR : isUp ? UP_COLOR : DOWN_COLOR;
  const change = bar.close - bar.open;
  const changePct = (change / bar.open) * 100;
  const w = 168;
  const h = 138;
  const tx = side === 'right' ? x + 12 : x - w - 12;
  const ty = Math.max(8, Math.min(y - h / 2, TOTAL_H - h - 8));

  return (
    <g>
      {/* crosshair vertical */}
      <line x1={x} y1={PAD_T} x2={x} y2={CHART_H} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />
      {/* tooltip box */}
      <foreignObject x={tx} y={ty} width={w} height={h}>
        <div style={{
          background: 'rgba(18,22,34,0.97)',
          border: '1px solid rgba(79,125,243,0.4)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          lineHeight: 1.7,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            {fmtDate(bar.ts)} · {fmtTime(bar.ts)}
          </div>
          {[
            ['O', bar.open],
            ['H', bar.high],
            ['L', bar.low],
            ['C', bar.close],
          ].map(([lbl, val]) => (
            <div key={lbl as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--text-muted)' }}>{lbl}</span>
              <span style={{ color: lbl === 'C' ? color : 'var(--text-primary)' }}>
                {fmtPrice(val as number)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Chg</span>
            <span style={{ color, fontWeight: 600 }}>
              {change >= 0 ? '+' : ''}{fmtPrice(change)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--text-muted)' }}>Vol</span>
            <span>{fmtVol(bar.volume)}</span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ width }: { width: number }) {
  return (
    <svg width={width} height={TOTAL_H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="skel-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          <animateTransform attributeName="gradientTransform" type="translate" from="-1" to="1" dur="1.4s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      {Array.from({ length: 20 }).map((_, i) => {
        const x = PAD_L + (i / 19) * (width - PAD_L - PAD_R);
        const h = 40 + Math.sin(i * 1.3) * 30;
        const y = CHART_H / 2 - h / 2 + PAD_T;
        return (
          <g key={i}>
            <rect x={x - 2} y={y} width={4} height={h} rx={1} fill="url(#skel-grad)" />
            <line x1={x} y1={y - 8} x2={x} y2={y} stroke="url(#skel-grad)" strokeWidth={1} />
            <line x1={x} y1={y + h} x2={x} y2={y + h + 8} stroke="url(#skel-grad)" strokeWidth={1} />
          </g>
        );
      })}
      <text x={width / 2} y={TOTAL_H / 2 + 30} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize={12}>
        Loading…
      </text>
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface CandlestickChartProps {
  bars: Bar[];
  width: number;
  loading?: boolean;
  interval?: string;
}

export function CandlestickChart({ bars, width, loading, interval }: CandlestickChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const W = width;
  const plotW = W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (bars.length < 2) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    // Map mouse x → bar index
    const idx = Math.round(((mx - PAD_L) / plotW) * (bars.length - 1));
    const clamped = Math.max(0, Math.min(bars.length - 1, idx));
    const bar = bars[clamped];
    const candleX = PAD_L + (clamped / (bars.length - 1)) * plotW;
    const side = candleX < W / 2 ? 'right' : 'left';
    setTooltip({ bar, x: candleX, y: e.clientY - rect.top, side });
  }, [bars, plotW, W]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (loading) return <Skeleton width={W} />;
  if (bars.length === 0) {
    return (
      <svg width={W} height={TOTAL_H} style={{ display: 'block' }}>
        <text x={W / 2} y={TOTAL_H / 2} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={12}>
          No data available
        </text>
      </svg>
    );
  }

  // ── Compute scales ──────────────────────────────────────────────────────────
  const allLows = bars.map(b => b.low);
  const allHighs = bars.map(b => b.high);
  let priceMin = Math.min(...allLows);
  let priceMax = Math.max(...allHighs);
  const pricePad = (priceMax - priceMin) * 0.05 || priceMin * 0.01;
  priceMin -= pricePad;
  priceMax += pricePad;
  const priceRange = priceMax - priceMin;

  const maxVol = Math.max(...bars.map(b => b.volume), 1);
  const n = bars.length;
  const candleW = Math.max(1, Math.min(14, (plotW / n) * 0.7));

  function toY(price: number): number {
    return PAD_T + plotH - ((price - priceMin) / priceRange) * plotH;
  }
  function toX(i: number): number {
    return PAD_L + (i / Math.max(n - 1, 1)) * plotW;
  }

  const ticks = yTicks(priceMin, priceMax, 5);

  // Decide how many x-axis time labels to show (avoid crowding)
  const isIntraday = !interval || interval === '1m' || interval === '5m' || interval === '15m' || interval === '30m' || interval === '60m';
  const xLabelStep = Math.max(1, Math.ceil(n / Math.floor(plotW / 48)));
  const xLabels: Array<{ i: number; label: string }> = [];
  for (let i = 0; i < n; i += xLabelStep) {
    xLabels.push({ i, label: isIntraday ? fmtTime(bars[i].ts) : fmtDate(bars[i].ts) });
  }

  return (
    <svg
      ref={svgRef}
      width={W}
      height={TOTAL_H}
      style={{ display: 'block', cursor: 'crosshair', userSelect: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <clipPath id={`clip-candle-${W}`}>
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* ── Y-axis grid lines + labels ── */}
      {ticks.map((tick) => {
        const y = toY(tick);
        if (y < PAD_T - 2 || y > PAD_T + plotH + 2) return null;
        return (
          <g key={tick}>
            <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={PAD_L + plotW + 6} y={y + 4}
              fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="start">
              {fmtPrice(tick)}
            </text>
          </g>
        );
      })}

      {/* ── X-axis labels ── */}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={toX(i)} y={CHART_H + 2}
          fill="rgba(255,255,255,0.3)" fontSize={9.5} textAnchor="middle">
          {label}
        </text>
      ))}

      {/* ── Candlestick bodies ── */}
      <g clipPath={`url(#clip-candle-${W})`}>
        {bars.map((bar, i) => {
          const x = toX(i);
          const isUp = bar.close >= bar.open;
          const isDoji = bar.close === bar.open;
          const color = isDoji ? DOJI_COLOR : isUp ? UP_COLOR : DOWN_COLOR;
          const bodyTop = toY(Math.max(bar.open, bar.close));
          const bodyBot = toY(Math.min(bar.open, bar.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const isLast = i === bars.length - 1;

          return (
            <g key={i}>
              {/* Wick */}
              <line x1={x} y1={toY(bar.high)} x2={x} y2={toY(bar.low)}
                stroke={color} strokeWidth={1} opacity={0.85} />
              {/* Body */}
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={isUp ? color : color}
                fillOpacity={isUp ? 0.85 : 1}
                stroke={color}
                strokeWidth={0.5}
                rx={candleW > 4 ? 1 : 0}
              />
              {/* Last-bar pulse ring */}
              {isLast && (
                <circle cx={x} cy={toY(bar.close)} r={4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                  <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </g>

      {/* ── Volume bars ── */}
      {bars.map((bar, i) => {
        const x = toX(i);
        const isUp = bar.close >= bar.open;
        const color = isUp ? UP_COLOR : DOWN_COLOR;
        const volH = (bar.volume / maxVol) * (VOL_H - 4);
        const volY = CHART_H + GAP_H + (VOL_H - 4) - volH;

        return (
          <rect
            key={i}
            x={x - candleW / 2}
            y={volY}
            width={candleW}
            height={Math.max(1, volH)}
            fill={color}
            fillOpacity={0.4}
            rx={candleW > 4 ? 1 : 0}
          />
        );
      })}

      {/* ── Tooltip ── */}
      {tooltip && <Tooltip data={tooltip} />}
    </svg>
  );
}
