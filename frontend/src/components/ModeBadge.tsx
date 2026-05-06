export function ModeBadge({ mode }: { mode: 'paper' | 'live' }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: mode === 'live' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
      color: mode === 'live' ? '#ef4444' : '#22c55e',
      border: `1px solid ${mode === 'live' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: mode === 'live' ? '#ef4444' : '#22c55e',
        animation: mode === 'live' ? 'pulse 1.5s infinite' : 'none',
      }} />
      {mode}
    </span>
  );
}
