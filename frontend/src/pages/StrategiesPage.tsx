import { useQuery } from '@tanstack/react-query';
import { strategyApi } from '../api/index';

export function StrategiesPage() {
  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: strategyApi.list,
  });

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Strategy Catalog</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          {strategies.length} registered strategies — read-only, driven from Python registry
        </p>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {strategies.map(s => {
          const schema = s.params_schema as { properties?: Record<string, { title?: string; description?: string; default?: unknown; type?: string }> };
          const props = Object.entries(schema?.properties ?? {});

          return (
            <div key={s.code} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              {/* Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{
                    fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
                  }}>{s.name}</span>
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', padding: '2px 8px',
                    background: 'rgba(79,125,243,0.12)', color: 'var(--accent)',
                    borderRadius: 999, border: '1px solid rgba(79,125,243,0.25)',
                  }}>{s.code}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {s.description}
                </p>
              </div>

              {/* Params */}
              {props.length > 0 && (
                <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Default Parameters
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {props.map(([key, field]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{field.title ?? key}</span>
                          {field.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{field.description}</div>
                          )}
                        </div>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 12,
                          background: 'var(--bg-card)', padding: '2px 8px',
                          borderRadius: 4, color: 'var(--accent)',
                          border: '1px solid var(--border)',
                        }}>
                          {String(s.default_params[key] ?? field.default ?? '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
