import { useQuery } from '@tanstack/react-query';
import { opsApi } from '../api/index';

export function IBKRStatusIndicator() {
  const { data, isError } = useQuery({
    queryKey: ['ibkrStatus'],
    queryFn: opsApi.ibkrStatus,
    refetchInterval: 5000,
  });

  const connected = data?.connected && !isError;
  const color = connected ? '#22c55e' : '#f59e0b'; // Green vs Orange
  const label = connected ? 'IBKR Connected' : 'IBKR Disconnected';
  const title = data ? `Paper Gateway: ${data.paper_gateway}\nLive Gateway: ${data.live_gateway}\nNote: ${data.note}` : '';

  return (
    <div 
      title={title}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 6, 
        padding: '8px 20px',
        fontSize: 12,
        color: 'var(--text-muted)'
      }}
    >
      <div 
        style={{ 
          width: 8, 
          height: 8, 
          borderRadius: '50%', 
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}80`
        }} 
      />
      {label}
    </div>
  );
}
