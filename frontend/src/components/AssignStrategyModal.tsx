import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentApi, strategyApi, symbolApi, type Assignment, type CreateAssignmentPayload } from '../api/index';
import { portfolioApi } from '../api/portfolios';
import { StrategyParamsForm } from './StrategyParamsForm';
import { Overlay, Field, inputStyle, btnPriStyle, btnSecStyle, h2Style } from './CreatePortfolioModal';

interface Props {
  portfolioId: number;
  existing?: Assignment;
  onClose: () => void;
}

export function AssignStrategyModal({ portfolioId, existing, onClose }: Props) {
  const qc = useQueryClient();

  const { data: symbols = [] } = useQuery({ queryKey: ['symbols'], queryFn: symbolApi.list });
  const { data: strategies = [] } = useQuery({ queryKey: ['strategies'], queryFn: strategyApi.list });
  const { data: portfolio } = useQuery({ queryKey: ['portfolios', portfolioId], queryFn: () => portfolioApi.get(portfolioId) });
  const { data: assignments = [] } = useQuery({ queryKey: ['assignments', portfolioId], queryFn: () => assignmentApi.list(portfolioId) });

  const [symbolId, setSymbolId] = useState(String(existing?.symbol_id ?? ''));
  const [stratCode, setStratCode] = useState(existing?.strategy_code ?? '');
  const [allocation, setAllocation] = useState(String(existing?.allocation ?? 1000));
  const [error, setError] = useState('');

  const selectedStrategy = strategies.find(s => s.code === stratCode);
  const [params, setParams] = useState<Record<string, unknown>>(
    existing?.params ?? selectedStrategy?.default_params ?? {}
  );

  const mutation = useMutation({
    mutationFn: (data: CreateAssignmentPayload) =>
      existing
        ? assignmentApi.patch(existing.id, data)
        : assignmentApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', portfolioId] });
      qc.invalidateQueries({ queryKey: ['portfolios'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const onStrategyChange = (code: string) => {
    setStratCode(code);
    const strat = strategies.find(s => s.code === code);
    if (strat) setParams(strat.default_params);
  };

  // Budget remaining = portfolio total − sum of other assignments (exclude self when editing)
  const otherAllocated = assignments
    .filter(a => a.id !== existing?.id)
    .reduce((sum, a) => sum + a.allocation, 0);
  const budgetTotal = portfolio?.budget_total ?? 0;
  const remaining = budgetTotal - otherAllocated;

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!symbolId || !stratCode) return setError('Symbol and strategy are required');
    const alloc = parseFloat(allocation);
    if (isNaN(alloc) || alloc <= 0) return setError('Allocation must be > 0');
    if (budgetTotal > 0 && alloc > remaining)
      return setError(`Allocation exceeds remaining budget of ${fmt(remaining)} (${fmt(budgetTotal)} total − ${fmt(otherAllocated)} already allocated)`);
    mutation.mutate({ portfolio_id: portfolioId, symbol_id: parseInt(symbolId), strategy_code: stratCode, params, allocation: alloc });
  };

  return (
    <Overlay onClose={onClose}>
      <h2 style={h2Style}>{existing ? 'Edit Assignment' : 'Assign Strategy'}</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Symbol">
          <select style={inputStyle} value={symbolId} onChange={e => setSymbolId(e.target.value)} disabled={!!existing}>
            <option value="">— select —</option>
            {symbols.map(s => (
              <option key={s.id} value={s.id}>{s.ticker} ({s.exchange})</option>
            ))}
          </select>
        </Field>
        <Field label="Strategy">
          <select style={inputStyle} value={stratCode} onChange={e => onStrategyChange(e.target.value)} disabled={!!existing}>
            <option value="">— select —</option>
            {strategies.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Allocation (USD)">
          <input type="number" style={inputStyle} value={allocation} onChange={e => setAllocation(e.target.value)} min={1} max={remaining || undefined} />
          {budgetTotal > 0 && (
            <div style={{ fontSize: 11, marginTop: 5, color: parseFloat(allocation) > remaining ? 'var(--danger)' : 'var(--text-muted)' }}>
              {fmt(remaining)} remaining of {fmt(budgetTotal)} total
            </div>
          )}
        </Field>
        {selectedStrategy && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
              Strategy Parameters
            </div>
            <StrategyParamsForm strategy={selectedStrategy} values={params} onChange={setParams} />
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} style={btnPriStyle}>
            {mutation.isPending ? 'Saving…' : (existing ? 'Save' : 'Assign')}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
