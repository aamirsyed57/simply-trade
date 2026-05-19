import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ibkrOrdersApi, ibkrFillsApi, opsApi, symbolApi, type IBKROrderEntry, type IBKRFillEntry, type IBKRDBOrphan } from '../api/index';
import { RefreshCw } from 'lucide-react';

const REFRESH_MS = 10_000;

function fmtPx(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' });
}

type StatusFilter = 'all' | 'live' | 'filled' | 'cancelled';
type ModeFilter = 'all' | 'paper' | 'live';

function SourceBadge({ isPlatform }: { isPlatform: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const,
      background: isPlatform ? 'rgba(79,125,243,0.12)' : 'rgba(239,68,68,0.12)',
      color: isPlatform ? '#4f7df3' : '#ef4444',
    }}>
      {isPlatform ? 'Platform' : 'Orphan'}
    </span>
  );
}

function LiveDot({ live }: { live: boolean }) {
  if (!live) return null;
  return (
    <span title="Currently open in IBKR" style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: '#22c55e', boxShadow: '0 0 5px #22c55e90', marginLeft: 5,
    }} />
  );
}

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  let color = 'var(--text-muted)';
  if (s === 'filled') color = '#22c55e';
  else if (s === 'cancelled' || s === 'inactive') color = '#ef4444';
  else if (s === 'submitted' || s === 'presubmitted') color = '#4f7df3';
  else if (s === 'partially_filled') color = '#f59e0b';
  return <span style={{ fontSize: 11, color, fontWeight: 600 }}>{status}</span>;
}

function ModeBadge({ mode }: { mode: string }) {
  if (!mode) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>;
  const isPaper = mode === 'paper';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const,
      background: isPaper ? 'rgba(99,102,241,0.12)' : 'rgba(34,197,94,0.12)',
      color: isPaper ? '#6366f1' : '#16a34a',
    }}>
      {mode}
    </span>
  );
}

export function IBKROrdersPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [fillsMode, setFillsMode] = useState<ModeFilter>('all');
  const qc = useQueryClient();

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['ibkr-orders'],
    queryFn: ibkrOrdersApi.list,
    refetchInterval: REFRESH_MS,
  });

  const fillsQuery = useQuery({
    queryKey: ['ibkr-fills', fillsMode],
    queryFn: () => ibkrFillsApi.list(fillsMode === 'all' ? undefined : fillsMode),
    refetchInterval: REFRESH_MS,
  });

  const syncMutation = useMutation({
    mutationFn: opsApi.syncIbkrOrders,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibkr-orders'] });
      qc.invalidateQueries({ queryKey: ['ibkr-fills'] });
    },
  });

  const flexSyncMutation = useMutation({
    mutationFn: opsApi.syncFlexFills,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibkr-fills'] });
    },
  });

  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });
  const symbolMap = Object.fromEntries(symbols.map(s => [s.id, s]));

  const allOrders = data?.ibkr_orders ?? [];
  const dbOrphans = data?.db_orphans ?? [];
  const liveCount = allOrders.filter(o => o.is_live).length;
  const orphanCount = allOrders.filter(o => !o.is_platform_order).length;

  const filtered = allOrders.filter(o => {
    if (filter === 'live') return o.is_live;
    if (filter === 'filled') return o.status.toLowerCase() === 'filled';
    if (filter === 'cancelled') return ['cancelled', 'inactive'].includes(o.status.toLowerCase());
    return true;
  }).filter(o => {
    if (modeFilter === 'all') return true;
    return o.execution_mode === modeFilter;
  });

  const filterBtn = (f: StatusFilter, label: string, count?: number) => (
    <button
      onClick={() => setFilter(f)}
      style={{
        padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
        background: filter === f ? 'var(--accent)' : 'var(--bg-surface)',
        color: filter === f ? '#fff' : 'var(--text-muted)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>IBKR Orders</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Persisted from bridge · refreshes every 10s
            {dataUpdatedAt ? ` · last updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {liveCount > 0 && (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '6px 12px', borderRadius: 6 }}>
              {liveCount} live
            </div>
          )}
          {orphanCount > 0 && (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '6px 12px', borderRadius: 6 }}>
              {orphanCount} orphan{orphanCount !== 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => flexSyncMutation.mutate()}
            disabled={flexSyncMutation.isPending}
            title={flexSyncMutation.isError ? String(flexSyncMutation.error) : flexSyncMutation.isSuccess ? flexSyncMutation.data?.message : 'Fetch months of historical fills via IBKR Flex Query API (requires IBKR_FLEX_TOKEN + IBKR_FLEX_QUERY_ID in .env)'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 7,
              color: flexSyncMutation.isError ? '#ef4444' : flexSyncMutation.isPending ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: flexSyncMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: flexSyncMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
            {flexSyncMutation.isPending
              ? 'Fetching…'
              : flexSyncMutation.isSuccess
                ? `Flex: +${flexSyncMutation.data?.inserted ?? 0} fills`
                : flexSyncMutation.isError
                  ? 'Flex failed'
                  : 'Sync Flex History'}
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            title={syncMutation.isSuccess ? syncMutation.data?.message : 'Force-fetch all open IBKR orders and persist to DB'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 7, color: syncMutation.isPending ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: syncMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: syncMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
            {syncMutation.isPending
              ? 'Syncing…'
              : syncMutation.isSuccess
                ? `Synced ${(syncMutation.data?.bridge_upserted ?? 0) + (syncMutation.data?.platform_upserted ?? 0)}`
                : 'Sync from IBKR'}
          </button>
        </div>
      </div>

      {/* All IBKR Orders (persisted) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>All IBKR Orders</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {filterBtn('all', 'All', allOrders.length)}
          {filterBtn('live', 'Live', liveCount)}
          {filterBtn('filled', 'Filled')}
          {filterBtn('cancelled', 'Cancelled')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'paper', 'live'] as ModeFilter[]).map(m => (
          <button key={m} onClick={() => setModeFilter(m)} style={{
            padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
            background: modeFilter === m ? '#6366f1' : 'var(--bg-surface)',
            color: modeFilter === m ? '#fff' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' as const,
          }}>{m}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: '24px 0' }}>Loading…</div>
      ) : isError ? (
        <div style={{ color: 'var(--danger)', padding: '24px 0' }}>API unavailable</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 0', textAlign: 'center', marginBottom: 36 }}>
          No orders{filter !== 'all' ? ` matching filter "${filter}"` : ' persisted yet'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 36 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['IBKR ID', 'Ticker', 'Side', 'Qty', 'Type', 'Limit', 'Status', 'Filled', 'Avg Price', 'Mode', 'Order Ref', 'Source', 'First Seen', 'Updated'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: IBKROrderEntry, i: number) => (
                <tr key={o.ibkr_order_id} style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  background: !o.is_platform_order
                    ? 'rgba(239,68,68,0.03)'
                    : o.is_live
                      ? 'rgba(34,197,94,0.03)'
                      : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)',
                }}>
                  <td style={td}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.ibkr_order_id}</span>
                    <LiveDot live={o.is_live} />
                  </td>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{o.ticker}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{o.exchange}</span>
                  </td>
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: o.action === 'BUY' ? '#22c55e' : '#ef4444' }}>{o.action}</span>
                  </td>
                  <td style={td}>{o.total_quantity}</td>
                  <td style={td}>{o.order_type}</td>
                  <td style={td}>{o.limit_price != null ? fmtPx(o.limit_price) : '—'}</td>
                  <td style={td}><StatusChip status={o.status} /></td>
                  <td style={td}>{o.filled > 0 ? o.filled : '—'}</td>
                  <td style={td}>{o.avg_fill_price > 0 ? fmtPx(o.avg_fill_price) : '—'}</td>
                  <td style={td}><ModeBadge mode={o.execution_mode} /></td>
                  <td style={td}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{o.order_ref || '—'}</span>
                  </td>
                  <td style={td}><SourceBadge isPlatform={o.is_platform_order} /></td>
                  <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(o.first_seen_at)}</span></td>
                  <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(o.last_updated_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Platform Orders Without IBKR ID */}
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
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
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
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{sym?.ticker ?? o.symbol_id}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{sym?.exchange}</span>
                    </td>
                    <td style={td}><span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{o.strategy_code}</span></td>
                    <td style={td}><span style={{ fontWeight: 700, color: o.side === 'BUY' ? '#22c55e' : '#ef4444' }}>{o.side}</span></td>
                    <td style={td}>{o.qty}</td>
                    <td style={td}>{o.order_type}</td>
                    <td style={td}><span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>{o.status}</span></td>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{o.order_ref}</span></td>
                    <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtTs(o.created_at)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* IBKR Fills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 40 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>IBKR Fills</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>All execution reports — platform and orphan alike</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'paper', 'live'] as ModeFilter[]).map(m => (
            <button key={m} onClick={() => setFillsMode(m)} style={{
              padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
              background: fillsMode === m ? '#6366f1' : 'var(--bg-surface)',
              color: fillsMode === m ? '#fff' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' as const,
            }}>{m}</button>
          ))}
        </div>
      </div>
      {fillsQuery.isLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: '24px 0' }}>Loading fills…</div>
      ) : (fillsQuery.data ?? []).length === 0 ? (
        <div style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 0', textAlign: 'center' }}>
          No fills recorded yet
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Exec ID', 'IBKR Order ID', 'Ticker', 'Side', 'Qty', 'Price', 'Commission', 'Mode', 'Source', 'Order Ref', 'Timestamp'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(fillsQuery.data ?? []).map((f: IBKRFillEntry, i: number) => (
                <tr key={f.id} style={{
                  borderBottom: i < (fillsQuery.data ?? []).length - 1 ? '1px solid var(--border)' : 'none',
                  background: !f.is_platform_order ? 'rgba(239,68,68,0.03)' : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)',
                }}>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{f.ibkr_exec_id}</span></td>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.ibkr_order_id ?? '—'}</span></td>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{f.ticker || '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{f.exchange}</span>
                  </td>
                  <td style={td}><span style={{ fontWeight: 700, color: f.action === 'BUY' ? '#22c55e' : '#ef4444' }}>{f.action || '—'}</span></td>
                  <td style={td}>{f.qty}</td>
                  <td style={td}>{fmtPx(f.price)}</td>
                  <td style={td}>{f.commission > 0 ? fmtPx(f.commission) : '—'}</td>
                  <td style={td}><ModeBadge mode={f.execution_mode} /></td>
                  <td style={td}><SourceBadge isPlatform={f.is_platform_order} /></td>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{f.order_ref || '—'}</span></td>
                  <td style={td}><span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(f.timestamp)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, verticalAlign: 'middle' };
