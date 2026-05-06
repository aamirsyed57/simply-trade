import type { Strategy } from '../api/index';

interface FieldSchema {
  type: 'number' | 'integer' | 'string' | 'boolean';
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}

interface Props {
  strategy: Strategy;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function StrategyParamsForm({ strategy, values, onChange }: Props) {
  const schema = strategy.params_schema as { properties?: Record<string, FieldSchema> };
  const properties = schema?.properties ?? {};

  const update = (key: string, val: unknown) => onChange({ ...values, [key]: val });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(properties).map(([key, field]) => {
        const currentVal = values[key] ?? field.default;
        const label = field.title ?? key;

        return (
          <div key={key}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {label}
              {field.description && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                  — {field.description}
                </span>
              )}
            </label>
            {field.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={!!currentVal}
                onChange={e => update(key, e.target.checked)}
              />
            ) : field.enum ? (
              <select
                value={String(currentVal ?? '')}
                onChange={e => update(key, e.target.value)}
                style={inputStyle}
              >
                {field.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                step={field.type === 'integer' ? 1 : 'any'}
                min={field.minimum}
                max={field.maximum}
                value={String(currentVal ?? '')}
                onChange={e => {
                  const raw = e.target.value;
                  const parsed = field.type === 'integer' ? parseInt(raw) : field.type === 'number' ? parseFloat(raw) : raw;
                  update(key, parsed);
                }}
                style={inputStyle}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
};
