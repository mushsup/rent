import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistOfflineQueryCache, restoreOfflineQueryCache, restoreSynchronousOfflineQueryCache } from './shared/lib/offlineQueryCache';
import { I18nProvider } from './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // показываем кэш до 5 минут без блокировки интерфейса
      gcTime: 1000 * 60 * 30, // держим посещённые страницы в памяти 30 минут
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден корневой элемент приложения');
const appRoot = rootElement;

function startApp() {
  const root = ReactDOM.createRoot(appRoot);
  restoreSynchronousOfflineQueryCache(queryClient);
  persistOfflineQueryCache(queryClient);

  root.render(
    <React.StrictMode>
      <I18nProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </ErrorBoundary>
      </I18nProvider>
    </React.StrictMode>,
  );

  // IndexedDB remains the durable cache. Its restoration is a fallback when
  // the synchronous launch snapshot is unavailable.
  void restoreOfflineQueryCache(queryClient);
}

startApp();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
