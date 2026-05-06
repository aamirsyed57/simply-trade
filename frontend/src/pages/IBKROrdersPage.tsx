import { useQuery } from '@tanstack/react-query';
import { ibkrOrdersApi, symbolApi, type IBKROrderEntry, type IBKRDBOrphan } from '../api/index';

const REFRESH_MS = 10_000;

function fmtPx(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
}

function StatusBadge({ open }: { open: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: open ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: open ? '#22c55e' : '#ef4444',
      textTransform: 'uppercase' as const,
    }}>
      {open ? 'Platform' : 'Orphan'}
    </span>
  );
}

export function IBKROrdersPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['ibkr-orders'],
    queryFn: ibkrOrdersApi.list,
    refetchInterval: REFRESH_MS,
  });

  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });
  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s]));

  const ibkrOrders = data?.ibkr_orders ?? [];
  const dbOrphans = data?.db_orphans ?? [];
  const orphanCount = ibkrOrders.filter(o => !o.is_platform_order).length;

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>IBKR Orders</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Live snapshot from IBKR bridge · refreshes every 10s
            {dataUpdatedAt ? ` · last updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
          </div>
        </div>
        {orphanCount > 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '6px 12px', borderRadius: 6 }}>
            {orphanCount} orphan{orphanCount !== 1 ? 's' : ''} detected
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Open Orders in IBKR</h2>
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: '24px 0' }}>Loading…</div>
      ) : isError ? (
        <div style={{ color: 'var(--danger)', padding: '24px 0' }}>Bridge unavailable — no data</div>
      ) : ibkrOrders.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 0', textAlign: 'center' }}>
          No open orders in IBKR
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 36 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['IBKR ID', 'Ticker', 'Side', 'Qty', 'Type', 'Limit', 'Status', 'Filled', 'Remaining', 'Order Ref', 'Source'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ibkrOrders.map((o: IBKROrderEntry, i: number) => (
                <tr key={o.ibkr_order_id} style={{
                  borderBottom: i < ibkrOrders.length - 1 ? '1px solid var(--border)' : 'none',
                  background: !o.is_platform_order
                    ? 'rgba(239,68,68,0.04)'
                    : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)',
                }}>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.ibkr_order_id}</span></td>
                  <td style={td}><span style={{ fontWeight: 600 }}>{o.ticker}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{o.exchange}</span></td>
                  <td style={td}><span style={{ fontWeight: 600, color: o.action === 'BUY' ? '#22c55e' : '#ef4444' }}>{o.action}</span></td>
                  <td style={td}>{o.total_quantity}</td>
                  <td style={td}>{o.order_type}</td>
                  <td style={td}>{o.limit_price != null ? fmtPx(o.limit_price) : '—'}</td>
                  <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.status}</span></td>
                  <td style={td}>{o.filled}</td>
                  <td style={td}>{o.remaining}</td>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{o.order_ref || '—'}</span></td>
                  <td style={td}><StatusBadge open={o.is_platform_order} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Platform Orders Without IBKR ID</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Orders recorded in the platform that were never confirmed by IBKR.
      </div>
      {dbOrphans.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 0', textAlign: 'center' }}>
          No unconfirmed platform orders
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['DB ID', 'Symbol', 'Strategy', 'Side', 'Qty', 'Type', 'Status', 'Order Ref', 'Created'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dbOrphans.map((o: IBKRDBOrphan, i: number) => {
                const sym = symbolMap[o.symbol_id];
                return (
                  <tr key={o.id} style={{
                    borderBottom: i < dbOrphans.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'rgba(245,158,11,0.04)',
                  }}>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id}</span></td>
                    <td style={td}><span style={{ fontWeight: 600 }}>{sym?.ticker ?? o.symbol_id}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{sym?.exchange}</span></td>
                    <td style={td}><span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{o.strategy_code}</span></td>
                    <td style={td}><span style={{ fontWeight: 600, color: o.side === 'BUY' ? '#22c55e' : '#ef4444' }}>{o.side}</span></td>
                    <td style={td}>{o.qty}</td>
                    <td style={td}>{o.order_type}</td>
                    <td style={td}><span style={{ fontSize: 11, color: '#f59e0b' }}>{o.status}</span></td>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{o.order_ref}</span></td>
                    <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleString()}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' };
