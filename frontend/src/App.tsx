import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FilterProvider } from './context/FilterContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { AcquisitionPage } from './pages/AcquisitionPage';
import { CustomersPage } from './pages/CustomersPage';
import { RetentionPage } from './pages/RetentionPage';
import { ProfitabilityPage } from './pages/ProfitabilityPage';
import { LifecyclePage } from './pages/LifecyclePage';
import { ProductsPage } from './pages/ProductsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 min
    },
  },
});

function OverviewRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/overview', search }} replace />;
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <FilterProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<OverviewRedirect />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/acquisition" element={<AcquisitionPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/retention" element={<RetentionPage />} />
                <Route path="/profitability" element={<OverviewRedirect />} />
                <Route path="/lifecycle" element={<LifecyclePage />} />
                <Route path="*" element={<OverviewRedirect />} />
              </Route>
            </Routes>
          </FilterProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
