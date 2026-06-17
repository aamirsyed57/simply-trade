import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { PortfolioDetailPage } from './pages/PortfolioDetailPage';
import { StrategiesPage } from './pages/StrategiesPage';
import { BacktestsPage } from './pages/BacktestsPage';
import { HistoricalDataPage } from './pages/HistoricalDataPage';
import { WorkerLogsPage } from './pages/WorkerLogsPage';
import { IBKROrdersPage } from './pages/IBKROrdersPage';
import { IBKRDashboardPage } from './pages/IBKRDashboardPage';
import { ExchangeHoursPage } from './pages/ExchangeHoursPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { TopMoversPage } from './pages/TopMoversPage';
import { LiveChartsPage } from './pages/LiveChartsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<IBKRDashboardPage />} />
            <Route path="/portfolios" element={<PortfoliosPage />} />
            <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
            <Route path="/reconciliation" element={<ReconciliationPage />} />
            <Route path="/strategies" element={<StrategiesPage />} />
            <Route path="/backtests" element={<BacktestsPage />} />
            <Route path="/historical" element={<HistoricalDataPage />} />
            <Route path="/logs" element={<WorkerLogsPage />} />
            <Route path="/ibkr-orders" element={<IBKROrdersPage />} />
            <Route path="/exchange-hours" element={<ExchangeHoursPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/top-movers" element={<TopMoversPage />} />
            <Route path="/charts" element={<LiveChartsPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
