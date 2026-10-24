import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { EmptyState } from './shared/ui';
import { useI18n } from './i18n';

const Layout = lazy(() => import('./components/Layout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminTenantDetail = lazy(() => import('./pages/admin/AdminTenantDetail'));
const AdminBikes = lazy(() => import('./pages/admin/AdminBikes'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminPaymentApprovals = lazy(() => import('./pages/admin/AdminPaymentApprovals'));
const AdminTasks = lazy(() => import('./pages/admin/AdminTasks'));
const AdminBikeDetail = lazy(() => import('./pages/admin/AdminBikeDetail'));
const PaymentHistory = lazy(() => import('./pages/admin/PaymentHistory'));

function AdminAlias() {
  const location = useLocation();
  const target = location.pathname.replace(/^\/admin/, '') || '/';
  return <Navigate to={`${target}${location.search}`} replace />;
}

function App() {
  const { t } = useI18n();
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#03080a',
          color: '#fff',
          border: '1px solid #fcfcfe14',
          borderRadius: '6px',
        },
      }} />
      <Suspense fallback={<div role="status" aria-label={t('Загрузка приложения')} className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950 sm:p-6"><div className="mx-auto max-w-7xl animate-pulse"><div className="h-14 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="mt-6 h-10 w-48 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="h-24 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="h-24 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="h-24 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="h-24 rounded-lg bg-white/70 dark:bg-slate-900/70" /></div></div></div>}>
        <Routes>
          {/* Админка — корень сайта. Без сессии Layout показывает форму входа инлайн, без редиректов. */}
          <Route path="/admin" element={<AdminAlias />} />
          <Route path="/admin/*" element={<AdminAlias />} />

          <Route path="/" element={<Layout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="bikes" element={<AdminBikes />} />
            <Route path="bike/:id" element={<AdminBikeDetail />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="payments/today" element={<AdminPaymentApprovals />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="tenant/:id" element={<AdminTenantDetail />} />
            <Route path="tenant/:id/history/statement" element={<PaymentHistory variant="statement" />} />
            <Route path="tenant/:id/history/weeks" element={<PaymentHistory variant="weeks" />} />
          </Route>

          {/* Публичные страницы арендатора */}
          <Route path="/history/:slug/statement" element={<PaymentHistory variant="statement" publicMode />} />
          <Route path="/history/:slug/weeks" element={<PaymentHistory variant="weeks" publicMode />} />
          <Route path="/:slug" element={<PaymentHistory variant="statement" publicMode />} />

          <Route path="*" element={<div className="min-h-screen bg-slate-100 py-20 dark:bg-slate-950"><div className="mx-auto max-w-4xl px-4 sm:px-6"><EmptyState title={t('Страница не найдена')} /></div></div>} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
