import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { portfolioApi } from '../api/portfolios';

const BASE = '/api/v1';
async function req<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export function ReconciliationPage() {
  const { data: portfolios = [] } = useQuery({ queryKey: ['portfolios'], queryFn: portfolioApi.list });

  // Fetch positions for all portfolios
  const { data: positionsData } = useQuery({
    queryKey: ['all-positions', portfolios.map(p => p.id)],
    queryFn: async () => {
      const all = await Promise.all(portfolios.map(p => req<any[]>(`/portfolios/${p.id}/positions`)));
      return all.flat();
    },
    enabled: portfolios.length > 0
  });

  const aggregatePositions = () => {
    const map = new Map<string, { qty: number }>();
    if (!positionsData) return map;
    positionsData.forEach(pos => {
      if (!pos.symbol?.ticker) return;
      const t = pos.symbol.ticker;
      if (!map.has(t)) map.set(t, { qty: 0 });
      map.get(t)!.qty += Number(pos.qty);
    });
    return map;
  };

  const agg = aggregatePositions();

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Reconciliation</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Virtual positions vs IBKR netted positions</p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={16} /> Run EOD Recon
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-muted)' }}>Symbol</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Virtual Total Qty</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>IBKR Qty (Simulated)</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)' }}>Drift</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(agg.entries()).map(([ticker, data]) => {
              const ibkrQty = data.qty; // Simulated match
              const drift = data.qty - ibkrQty;
              return (
                <tr key={ticker} style={{ borderBottom: '1px solid var(--bg-surface)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 500 }}>{ticker}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{data.qty}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{ibkrQty}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: drift !== 0 ? '#ef4444' : '#22c55e' }}>
                    {drift === 0 ? '✓ Match' : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}><ShieldAlert size={14}/> {Math.abs(drift)}</span>}
                  </td>
                </tr>
              );
            })}
            {agg.size === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No open positions to reconcile</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
