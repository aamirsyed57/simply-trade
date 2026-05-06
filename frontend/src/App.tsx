import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { PortfolioDetailPage } from './pages/PortfolioDetailPage';
import { StrategiesPage } from './pages/StrategiesPage';

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
            <Route path="/" element={<PortfoliosPage />} />
            <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
            <Route path="/strategies" element={<StrategiesPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
