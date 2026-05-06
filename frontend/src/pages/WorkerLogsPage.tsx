import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Terminal } from 'lucide-react';
import { opsApi } from '../api/index';
import { useEffect, useRef } from 'react';

export function WorkerLogsPage() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['workerLogs'],
    queryFn: opsApi.workerLogs,
    refetchInterval: 5000,
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto scroll to bottom when logs update
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.logs]);

  return (
    <div style={{ padding: 32, maxWidth: 1000, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Terminal size={24} /> Celery Worker Logs
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Real-time stdout from the task worker container. Auto-refreshes every 5 seconds.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={isFetching ? "spin" : ""} /> Refresh
        </button>
      </div>

      <div style={{
        flex: 1,
        background: '#1e1e2e',
        color: '#cdd6f4',
        fontFamily: '"Fira Code", monospace',
        fontSize: 12,
        lineHeight: 1.5,
        padding: 16,
        borderRadius: 8,
        overflowY: 'auto',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
      }}>
        {!data && isFetching ? (
          <div style={{ color: '#89b4fa' }}>Connecting to worker logs...</div>
        ) : data?.logs?.length === 0 ? (
          <div style={{ color: '#f38ba8' }}>No logs available yet.</div>
        ) : (
          data?.logs.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
