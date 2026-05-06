import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orderApi, type Order } from '../api/index';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  order: Order;
  ticker: string;
  onClose: () => void;
}

export function RetryFillModal({ order, ticker, onClose }: Props) {
  const qc = useQueryClient();
  const defaultPrice = order.limit_price ? String(order.limit_price) : '';
  const [fillPrice, setFillPrice] = useState(defaultPrice);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseFloat(fillPrice);
    if (!parsed || parsed <= 0) { setError('Fill price must be greater than 0'); return; }
    setSubmitting(true);
    try {
      await orderApi.fill(order.id, parsed);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['positions'] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const sideColor = order.side === 'BUY' ? '#16a34a' : '#dc2626';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, width: 360, padding: '24px 24px 20px', border: '1px solid var(--border)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={15} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <AlertTriangle size={16} color="#f59e0b" />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>No IBKR Order ID</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          This order was never confirmed by the bridge. Record the actual fill price to close it out.
        </p>

        {/* Order summary */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Symbol</span>
            <span style={{ fontWeight: 600 }}>{ticker}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Side</span>
            <span style={{ fontWeight: 700, color: sideColor }}>{order.side}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Qty</span>
            <span style={{ fontWeight: 600 }}>{order.qty}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Type</span>
            <span style={{ fontFamily: 'monospace' }}>{order.order_type}{order.limit_price ? ` @ $${order.limit_price}` : ''}</span>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Fill Price (USD)</label>
            <input
              type="number" min="0.01" step="any"
              value={fillPrice} onChange={e => setFillPrice(e.target.value)}
              placeholder="e.g. 149.87" required
              autoFocus
              style={inputStyle}
            />
          </div>

          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '9px 0', borderRadius: 8, border: 'none',
              background: sideColor, color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Recording…' : `Record ${order.side} Fill`}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
