import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Bell, Search, CheckCircle, XCircle, ChevronDown } from 'lucide-react';

const BASE = '/api/v1';
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

type StatusBanner = { type: 'success' | 'error'; message: string } | null;

function Banner({ status, onDismiss }: { status: StatusBanner; onDismiss: () => void }) {
  if (!status) return null;
  const isSuccess = status.type === 'success';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
      background: isSuccess ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 8, marginBottom: 16, fontSize: 13,
    }}>
      {isSuccess
        ? <CheckCircle size={16} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
        : <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1, color: 'var(--text-primary)', lineHeight: '1.5' }}>{status.message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

interface Chat { id: string; name: string; type: string; }

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => req<any>('/settings') });

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saveBanner, setSaveBanner] = useState<StatusBanner>(null);
  const [testBanner, setTestBanner] = useState<StatusBanner>(null);
  const [detectedChats, setDetectedChats] = useState<Chat[] | null>(null);
  const [detectError, setDetectError] = useState('');
  const [detecting, setDetecting] = useState(false);

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
      setSaveBanner({ type: 'success', message: 'Settings saved successfully.' });
    },
    onError: () => setSaveBanner({ type: 'error', message: 'Failed to save settings.' }),
  });

  const testMutation = useMutation({
    mutationFn: () => req<any>('/settings/test-notification', { method: 'POST' }),
    onSuccess: (data: any) => {
      if (data.status === 'success') {
        setTestBanner({ type: 'success', message: 'Test notification sent successfully.' });
      } else {
        setTestBanner({ type: 'error', message: data.message });
      }
    },
    onError: () => setTestBanner({ type: 'error', message: 'Network error sending test notification.' }),
  });

  const handleSave = () => {
    setSaveBanner(null);
    mutation.mutate({ telegram_bot_token: botToken, telegram_chat_id: chatId });
  };

  const handleTest = () => {
    setTestBanner(null);
    testMutation.mutate();
  };

  const handleDetect = async () => {
    setDetecting(true);
    setDetectedChats(null);
    setDetectError('');
    try {
      // Save current token first so the backend can use it
      await req('/settings', { method: 'POST', body: JSON.stringify({ telegram_bot_token: botToken, telegram_chat_id: chatId }) });
      const data = await req<any>('/settings/chat-updates');
      if (data.status === 'ok') {
        setDetectedChats(data.chats);
        if (data.chats.length === 0) {
          setDetectError('No chats found. Make sure you have sent at least one message to the bot (or added it to a group) and try again.');
        }
      } else {
        setDetectError(data.message || 'Unknown error from Telegram API.');
      }
    } catch {
      setDetectError('Failed to reach the backend.');
    } finally {
      setDetecting(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  if (isLoading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Bell size={24} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Notifications</h1>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 4 }}>Telegram Configuration</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, lineHeight: '1.6' }}>
          Create a bot via <strong>@BotFather</strong>, paste the token below, then use <em>Detect Chat ID</em> after sending a message to your bot (or adding it to a group).
        </p>

        <Banner status={saveBanner} onDismiss={() => setSaveBanner(null)} />
        <Banner status={testBanner} onDismiss={() => setTestBanner(null)} />

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Bot Token</label>
          <input style={inp} value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456789:ABCDEFGHIJ..." />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Chat ID</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" />
            <button
              onClick={handleDetect}
              disabled={detecting || !botToken}
              title="Detect chat ID from recent messages"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: 13,
                fontWeight: 500, cursor: botToken ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap', opacity: !botToken ? 0.5 : 1,
              }}
            >
              <Search size={14} /> {detecting ? 'Detecting…' : 'Detect Chat ID'}
            </button>
          </div>
        </div>

        {/* Detected chats dropdown */}
        {detectError && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
            {detectError}
          </div>
        )}
        {detectedChats && detectedChats.length > 0 && (
          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              Select a chat to use its ID:
            </div>
            {detectedChats.map(chat => (
              <button
                key={chat.id}
                onClick={() => { setChatId(chat.id); setDetectedChats(null); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px', background: 'none',
                  border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  textAlign: 'left', fontSize: 13, color: 'var(--text-primary)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{chat.name || '(unnamed)'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{chat.type}</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{chat.id}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Save size={16} /> {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>

          <button
            onClick={handleTest}
            disabled={testMutation.isPending || !botToken || !chatId}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
              cursor: (testMutation.isPending || !botToken || !chatId) ? 'not-allowed' : 'pointer',
              opacity: (!botToken || !chatId) ? 0.5 : 1,
            }}
          >
            <Bell size={16} /> {testMutation.isPending ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      </div>

      {/* Setup guide */}
      <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Setup Guide</span>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-muted)', lineHeight: '1.8' }}>
          <li>Open Telegram and search for <strong>@BotFather</strong>.</li>
          <li>Send <code>/newbot</code>, follow prompts, copy the token.</li>
          <li>For a <strong>private chat</strong>: send any message directly to your new bot.</li>
          <li>For a <strong>group</strong>: add the bot to the group and send a message.</li>
          <li>Paste the token above, click <em>Detect Chat ID</em>, and select the correct chat.</li>
          <li>Click <em>Save Settings</em>, then <em>Send Test</em> to verify.</li>
        </ol>
      </div>
    </div>
  );
}
