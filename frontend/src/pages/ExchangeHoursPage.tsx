import { useState, useEffect } from 'react';
import { EXCHANGE_HOURS, getMarketStatus, type ExchangeInfo, type MarketStatus, type SessionType } from '../utils/marketHours';

const REGIONS = ['Americas', 'Europe', 'Asia-Pacific'] as const;

function fmtTime(hour: number, min: number) {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function tzAbbr(timezone: string): string {
  return (
    new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? timezone
  );
}

const SESSION_STYLE: Record<SessionType, { bg: string; color: string; label: string }> = {
  'open':        { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', label: 'OPEN'       },
  'pre-market':  { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', label: 'PRE-MARKET' },
  'after-hours': { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6', label: 'AFTER-HRS'  },
  'closed':      { bg: 'rgba(107,114,128,0.1)',  color: 'var(--text-muted)', label: 'CLOSED' },
};

function StatusBadge({ status }: { status: MarketStatus }) {
  const s = SESSION_STYLE[status.session];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}

function SessionBlock({ label, from, to, active, color }: {
  label: string; from: string; to: string; active: boolean; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, color: active ? color : 'var(--text-muted)',
        width: 62, textTransform: 'uppercase' as const, letterSpacing: '0.03em',
        opacity: active ? 1 : 0.55,
      }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: 12,
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 400,
      }}>
        {from} – {to}
      </span>
    </div>
  );
}

function ExchangeRow({ code, info, status }: { code: string; info: ExchangeInfo; status: MarketStatus }) {
  const rowBg =
    status.session === 'open'        ? 'rgba(34,197,94,0.03)' :
    status.session === 'pre-market'  ? 'rgba(245,158,11,0.03)' :
    status.session === 'after-hours' ? 'rgba(139,92,246,0.03)' :
    'transparent';

  const openStr  = fmtTime(info.openHour,  info.openMin);
  const closeStr = fmtTime(info.closeHour, info.closeMin);
  const preStr   = info.preMarketOpenHour !== undefined
    ? fmtTime(info.preMarketOpenHour, info.preMarketOpenMin ?? 0) : null;
  const ahStr    = info.afterHoursCloseHour !== undefined
    ? fmtTime(info.afterHoursCloseHour, info.afterHoursCloseMin ?? 0) : null;

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
      <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{code}</span></td>
      <td style={td}><span style={{ fontSize: 13 }}>{info.name}</span></td>
      <td style={td}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{info.timezone}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({tzAbbr(info.timezone)})</span>
      </td>
      <td style={td}>
        {preStr && (
          <SessionBlock
            label="Pre"
            from={preStr} to={openStr}
            active={status.session === 'pre-market'}
            color="#f59e0b"
          />
        )}
        <SessionBlock
          label="Regular"
          from={openStr} to={closeStr}
          active={status.session === 'open'}
          color="#22c55e"
        />
        {ahStr && (
          <SessionBlock
            label="After"
            from={closeStr} to={ahStr}
            active={status.session === 'after-hours'}
            color="#8b5cf6"
          />
        )}
      </td>
      <td style={td}><StatusBadge status={status} /></td>
      <td style={td}>
        <span style={{ fontSize: 12, color: SESSION_STYLE[status.session].color }}>
          {status.countdown}
        </span>
      </td>
    </tr>
  );
}

export function ExchangeHoursPage() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const statuses = Object.fromEntries(
    Object.keys(EXCHANGE_HOURS).map(code => [code, getMarketStatus(code)])
  );
  const openCount     = Object.values(statuses).filter(s => s.session === 'open').length;
  const extendedCount = Object.values(statuses).filter(s => s.session === 'pre-market' || s.session === 'after-hours').length;

  return (
    <div style={{ padding: 32, maxWidth: 1060 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Exchange Hours</h1>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, alignItems: 'center' }}>
          {openCount > 0 && <span style={{ color: '#22c55e', fontWeight: 600 }}>● {openCount} open</span>}
          {extendedCount > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>● {extendedCount} extended</span>}
          <span style={{ color: 'var(--text-muted)' }}>/ {Object.keys(EXCHANGE_HOURS).length} exchanges · updates every minute</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}>
        Lunch-break markets (Tokyo, Hong Kong) shown as single session. Holidays not accounted for.
      </div>

      {REGIONS.map(region => {
        const entries = Object.entries(EXCHANGE_HOURS).filter(([, info]) => info.region === region);
        return (
          <div key={region} style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {region}
            </h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Code', 'Exchange', 'Timezone', 'Sessions (Local)', 'Status', 'Countdown'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([code, info]) => (
                    <ExchangeRow key={code} code={code} info={info} status={statuses[code]} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const td: React.CSSProperties = { padding: '10px 16px', verticalAlign: 'middle' };
