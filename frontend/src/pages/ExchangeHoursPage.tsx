import { useState, useEffect } from 'react';
import { EXCHANGE_HOURS, getMarketStatus, type ExchangeInfo, type MarketStatus } from '../utils/marketHours';

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

function StatusBadge({ status }: { status: MarketStatus }) {
  return status.isOpen ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
      OPEN
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      background: 'rgba(107,114,128,0.1)', color: 'var(--text-muted)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }} />
      CLOSED
    </span>
  );
}

function ExchangeRow({ code, info, status }: { code: string; info: ExchangeInfo; status: MarketStatus }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', background: status.isOpen ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
      <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{code}</span></td>
      <td style={td}><span style={{ fontSize: 13 }}>{info.name}</span></td>
      <td style={td}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {info.timezone}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({tzAbbr(info.timezone)})</span>
      </td>
      <td style={td}>
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {fmtTime(info.openHour, info.openMin)} – {fmtTime(info.closeHour, info.closeMin)}
        </span>
      </td>
      <td style={td}><StatusBadge status={status} /></td>
      <td style={td}>
        <span style={{ fontSize: 12, color: status.isOpen ? '#22c55e' : 'var(--text-muted)' }}>
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

  const openCount = Object.keys(EXCHANGE_HOURS).filter(code => getMarketStatus(code).isOpen).length;

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Exchange Hours</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Updates every minute &nbsp;·&nbsp;
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{openCount} open</span>
          {' '}/ {Object.keys(EXCHANGE_HOURS).length} exchanges
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}>
        Regular session hours only. Lunch-break markets (Tokyo, Hong Kong) shown as single session. Holidays not accounted for.
      </div>

      {REGIONS.map(region => {
        const entries = Object.entries(EXCHANGE_HOURS).filter(([, info]) => info.region === region);
        return (
          <div key={region} style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {region}
            </h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Code', 'Exchange', 'Timezone', 'Session (Local)', 'Status', 'Countdown'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([code, info]) => (
                    <ExchangeRow key={code} code={code} info={info} status={getMarketStatus(code)} />
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
