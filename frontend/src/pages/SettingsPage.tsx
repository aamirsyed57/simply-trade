import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Bell } from 'lucide-react';

const BASE = '/api/v1';
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => req<any>('/settings') });

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');

  useEffect(() => {
    if (settings) {
      setBotToken(settings.telegram_bot_token || '');
      setChatId(settings.telegram_chat_id || '');
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (newSettings: any) => req('/settings', { method: 'POST', body: JSON.stringify(newSettings) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      alert('Settings saved successfully!');
    },
    onError: () => alert('Failed to save settings'),
  });

  const testMutation = useMutation({
    mutationFn: () => req('/settings/test-notification', { method: 'POST' }),
    onSuccess: (data: any) => {
      if (data.status === 'success') {
        alert('Test notification sent successfully!');
      } else {
        alert('Failed to send test notification: ' + data.message);
      }
    },
    onError: () => alert('Failed to trigger test notification'),
  });

  const handleSave = () => {
    mutation.mutate({
      telegram_bot_token: botToken,
      telegram_chat_id: chatId,
    });
  };

  const handleTest = () => {
    testMutation.mutate();
  };

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  if (isLoading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Bell size={24} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Notifications</h1>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 20 }}>Telegram Configuration</h2>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Bot Token</label>
          <input style={inp} value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456789:ABCDEF..." />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Chat ID</label>
          <input style={inp} value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={handleSave} 
            disabled={mutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Save size={16} /> {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
          
          <button 
            onClick={handleTest} 
            disabled={testMutation.isPending || !botToken || !chatId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Bell size={16} /> {testMutation.isPending ? 'Sending...' : 'Send Test Notification'}
          </button>
        </div>
      </div>
    </div>
  );
}
