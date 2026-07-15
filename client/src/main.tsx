import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'oklch(0.175 0.008 240)',
              color: 'oklch(0.930 0 0)',
              border: '1px solid oklch(0.210 0.006 240)',
              fontSize: '0.875rem',
              borderRadius: '0.5rem',
            },
            success: { iconTheme: { primary: 'oklch(0.680 0.145 148)', secondary: 'oklch(0.930 0 0)' } },
            error:   { iconTheme: { primary: 'oklch(0.580 0.185 25)',  secondary: 'oklch(0.930 0 0)' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
