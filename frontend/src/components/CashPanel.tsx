import type { Portfolio } from '../api/portfolios';

export function CashPanel({ portfolio }: { portfolio: Portfolio }) {
  const { budget_total, cash_reserved, cash_deployed } = portfolio;
  const cash_available = budget_total - cash_reserved - cash_deployed;

  const pctDeployed = budget_total > 0 ? (cash_deployed / budget_total) * 100 : 0;
  const pctReserved = budget_total > 0 ? (cash_reserved / budget_total) * 100 : 0;
  const pctAvailable = budget_total > 0 ? (cash_available / budget_total) * 100 : 0;

  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-primary)', fontSize: 13 }}>
        Cash Breakdown
      </div>

      {/* Bar */}
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden', display: 'flex', marginBottom: 16 }}>
        <div style={{ width: `${pctDeployed}%`, background: '#4f7df3', transition: 'width 0.5s' }} />
        <div style={{ width: `${pctReserved}%`, background: '#f59e0b', transition: 'width 0.5s' }} />
        <div style={{ width: `${pctAvailable}%`, background: '#22c55e', transition: 'width 0.5s' }} />
      </div>

      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'Deployed', value: cash_deployed, pct: pctDeployed, color: '#4f7df3' },
          { label: 'Reserved', value: cash_reserved, pct: pctReserved, color: '#f59e0b' },
          { label: 'Available', value: cash_available, pct: pctAvailable, color: '#22c55e' },
        ].map(({ label, value, pct, color }) => (
          <div key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(value)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Budget</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(budget_total)}</span>
      </div>
    </div>
  );
}
