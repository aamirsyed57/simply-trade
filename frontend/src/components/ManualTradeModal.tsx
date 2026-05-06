import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orderApi, type CreateOrderPayload } from '../api/index';
import { X } from 'lucide-react';

interface Props {
  portfolioId: number;
  symbolId: number;
  ticker: string;
  strategyCode: string;
  onClose: () => void;
}

export function ManualTradeModal({ portfolioId, symbolId, ticker, strategyCode, onClose }: Props) {
  const qc = useQueryClient();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MKT' | 'LMT'>('MKT');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [fillPrice, setFillPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedQty = parseFloat(qty);
    if (!parsedQty || parsedQty <= 0) { setError('Quantity must be greater than 0'); return; }

    const parsedLimit = orderType === 'LMT' ? parseFloat(limitPrice) : undefined;
    if (orderType === 'LMT' && (!parsedLimit || parsedLimit <= 0)) { setError('Limit price must be greater than 0'); return; }

    const parsedFill = parseFloat(fillPrice);
    if (!parsedFill || parsedFill <= 0) { setError('Fill price must be greater than 0'); return; }

    setSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        portfolio_id: portfolioId,
        symbol_id: symbolId,
        strategy_code: strategyCode,
        side,
        qty: parsedQty,
        order_type: orderType,
        ...(parsedLimit ? { limit_price: parsedLimit } : {}),
      };
      const order = await orderApi.create(payload);
      await orderApi.fill(order.id, parsedFill);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['positions'] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  // When switching order type, sync fill price default to limit price
  function handleOrderTypeChange(t: 'MKT' | 'LMT') {
    setOrderType(t);
    if (t === 'LMT' && limitPrice && !fillPrice) setFillPrice(limitPrice);
  }

  // Keep fill price in sync with limit price while user types it
  function handleLimitChange(v: string) {
    setLimitPrice(v);
    if (orderType === 'LMT') setFillPrice(v);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, width: 380, padding: '28px 28px 24px', border: '1px solid var(--border)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={16} />
        </button>

        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Manual Trade</h2>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {ticker} · {strategyCode}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Side */}
          <div>
            <label style={labelStyle}>Side</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['BUY', 'SELL'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid var(--border)',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    background: side === s ? (s === 'BUY' ? '#16a34a' : '#dc2626') : 'var(--bg-surface)',
                    color: side === s ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Qty */}
          <div>
            <label style={labelStyle}>Quantity (shares)</label>
            <input
              type="number" min="0.01" step="any"
              value={qty} onChange={e => setQty(e.target.value)}
              placeholder="e.g. 10" required style={inputStyle}
            />
          </div>

          {/* Order type */}
          <div>
            <label style={labelStyle}>Order Type</label>
            <select value={orderType} onChange={e => handleOrderTypeChange(e.target.value as 'MKT' | 'LMT')} style={inputStyle}>
              <option value="MKT">Market (MKT)</option>
              <option value="LMT">Limit (LMT)</option>
            </select>
          </div>

          {/* Limit price — LMT only */}
          {orderType === 'LMT' && (
            <div>
              <label style={labelStyle}>Limit Price (USD)</label>
              <input
                type="number" min="0.01" step="any"
                value={limitPrice} onChange={e => handleLimitChange(e.target.value)}
                placeholder="e.g. 150.00" required style={inputStyle}
              />
            </div>
          )}

          {/* Fill price — always shown, captures actual execution price */}
          <div>
            <label style={labelStyle}>
              Fill Price (USD)
              <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>— actual execution price</span>
            </label>
            <input
              type="number" min="0.01" step="any"
              value={fillPrice} onChange={e => setFillPrice(e.target.value)}
              placeholder="e.g. 149.87" required style={inputStyle}
            />
          </div>

          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4, padding: '10px 0', borderRadius: 8, border: 'none',
              background: side === 'BUY' ? '#16a34a' : '#dc2626',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Recording…' : `Record ${side} Fill`}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
