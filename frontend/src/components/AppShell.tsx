import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Library, TrendingUp, Activity, Database, Terminal, AlertOctagon, Globe, BarChart2, Settings, ShieldAlert, Flame, ChevronLeft, ChevronRight } from 'lucide-react';
import { AccountSummaryBar } from './AccountSummaryBar';

const NAV = [
  { to: '/', label: 'IBKR Dashboard', icon: BarChart2 },
  { to: '/portfolios', label: 'Portfolios', icon: LayoutDashboard },
  { to: '/reconciliation', label: 'Reconciliation', icon: ShieldAlert },
  { to: '/strategies', label: 'Strategies', icon: Library },
  { to: '/backtests', label: 'Backtests', icon: TrendingUp },
  { to: '/historical', label: 'Historical Data', icon: Database },
  { to: '/logs', label: 'Worker Logs', icon: Terminal },
  { to: '/ibkr-orders', label: 'IBKR Orders', icon: AlertOctagon },
  { to: '/top-movers', label: 'Top Movers', icon: Flame },
  { to: '/exchange-hours', label: 'Exchange Hours', icon: Globe },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const EXPANDED_W = 220;
const COLLAPSED_W = 52;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? COLLAPSED_W : EXPANDED_W,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        flexShrink: 0,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: collapsed ? '0 0 24px' : '0 20px 24px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          minWidth: collapsed ? COLLAPSED_W : EXPANDED_W,
        }}>
          {!collapsed && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={20} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                  AutoTrader
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                IBKR Multi-Portfolio Platform
              </div>
            </div>
          )}

          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              flexShrink: 0,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  padding: collapsed ? '10px 0' : '9px 20px',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: active ? 'rgba(79,125,243,0.12)' : 'transparent',
                  borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AccountSummaryBar />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
