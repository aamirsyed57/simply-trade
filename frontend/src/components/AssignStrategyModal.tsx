import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentApi, strategyApi, symbolApi, type Assignment, type CreateAssignmentPayload } from '../api/index';
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
        ? assignmentApi.patch(portfolioId, existing.id, data)
        : assignmentApi.create(portfolioId, data),
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!symbolId || !stratCode) return setError('Symbol and strategy are required');
    const alloc = parseFloat(allocation);
    if (isNaN(alloc) || alloc <= 0) return setError('Allocation must be > 0');
    mutation.mutate({ symbol_id: parseInt(symbolId), strategy_code: stratCode, params, allocation: alloc });
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
          <input type="number" style={inputStyle} value={allocation} onChange={e => setAllocation(e.target.value)} min={1} />
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
