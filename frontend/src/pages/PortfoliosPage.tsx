import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { portfolioApi, type Portfolio } from '../api/portfolios';
import { ModeBadge } from '../components/ModeBadge';
import { CreatePortfolioModal } from '../components/CreatePortfolioModal';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

export function PortfoliosPage() {
  const qc = useQueryClient();
  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfolioApi.list,
    refetchInterval: 10_000,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Portfolio | null>(null);

  const deleteMutation = useMutation({
    mutationFn: portfolioApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  });

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  const fmtPnl = (v: number) => (v >= 0 ? `+${fmt(v)}` : fmt(v));

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Portfolios</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: 'var(--accent)', border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> New Portfolio
        </button>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      {/* Portfolio grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {portfolios.map(pf => {
          const available = pf.budget_total - pf.cash_reserved - pf.cash_deployed;
          const pnl = pf.realized_pnl + pf.unrealized_pnl_cached;
          const pnlColor = pnl >= 0 ? '#22c55e' : '#ef4444';

          return (
            <div
              key={pf.id}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 22,
                transition: 'border-color 0.2s',
                cursor: 'default',
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <Link
                    to={`/portfolios/${pf.id}`}
                    style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', textDecoration: 'none' }}
                  >
                    {pf.name}
                  </Link>
                  <div style={{ marginTop: 5 }}>
                    <ModeBadge mode={pf.mode} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <IconBtn onClick={() => setEditing(pf)} title="Edit">
                    <Pencil size={14} />
                  </IconBtn>
                  <IconBtn onClick={() => { if (confirm(`Delete "${pf.name}"?`)) deleteMutation.mutate(pf.id); }} title="Delete" danger>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>

              {/* Budget bar */}
              <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', display: 'flex', marginBottom: 14 }}>
                <div style={{ width: `${pf.budget_total > 0 ? (pf.cash_deployed / pf.budget_total) * 100 : 0}%`, background: '#4f7df3' }} />
                <div style={{ width: `${pf.budget_total > 0 ? (pf.cash_reserved / pf.budget_total) * 100 : 0}%`, background: '#f59e0b' }} />
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Stat label="Budget" value={fmt(pf.budget_total)} />
                <Stat label="Available" value={fmt(available)} />
                <Stat label="Deployed" value={fmt(pf.cash_deployed)} />
                <Stat
                  label="PnL"
                  value={fmtPnl(pnl)}
                  icon={pnl >= 0 ? <TrendingUp size={12} color="#22c55e" /> : <TrendingDown size={12} color="#ef4444" />}
                  valueColor={pnlColor}
                />
              </div>

              <Link
                to={`/portfolios/${pf.id}`}
                style={{
                  display: 'block', marginTop: 14, textAlign: 'center', padding: '7px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                View Detail →
              </Link>
            </div>
          );
        })}
      </div>

      {(showCreate || editing) && (
        <CreatePortfolioModal
          existing={editing ?? undefined}
          onClose={() => { setShowCreate(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, icon, valueColor }: { label: string; value: string; icon?: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 7, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 13, color: valueColor ?? 'var(--text-primary)' }}>
        {icon}{value}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
        padding: '5px 7px', cursor: 'pointer', color: danger ? 'var(--danger)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}
