import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioApi, type CreatePortfolioPayload } from '../api/portfolios';
import type { Portfolio } from '../api/portfolios';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  existing?: Portfolio;
}

export function CreatePortfolioModal({ onClose, existing }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'paper' | 'live'>(existing?.mode ?? 'paper');
  const [budget, setBudget] = useState(String(existing?.budget_total ?? 100000));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: CreatePortfolioPayload) =>
      existing ? portfolioApi.patch(existing.id, data) : portfolioApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Name is required');
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) return setError('Budget must be > 0');
    mutation.mutate({ name: name.trim(), mode, budget_total: budgetNum, description: description.trim() || undefined });
  };

  return (
    <Overlay onClose={onClose}>
      <h2 style={h2Style}>{existing ? 'Edit Portfolio' : 'New Portfolio'}</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="My Portfolio" />
        </Field>
        <Field label="Mode">
          <select style={inputStyle} value={mode} onChange={e => setMode(e.target.value as 'paper' | 'live')}>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </Field>
        <Field label="Budget (USD)">
          <input type="number" style={inputStyle} value={budget} onChange={e => setBudget(e.target.value)} min={1} />
        </Field>
        <Field label="Description (optional)">
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} style={btnPriStyle}>
            {mutation.isPending ? 'Saving…' : (existing ? 'Save Changes' : 'Create')}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// Shared modal primitives
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 440, maxHeight: '90vh', overflow: 'auto', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
export const btnPriStyle: React.CSSProperties = {
  padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
export const btnSecStyle: React.CSSProperties = {
  padding: '8px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
};
export const h2Style: React.CSSProperties = { margin: '0 0 20px', fontSize: 17, fontWeight: 700 };
