import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';

const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminTenantDetail = lazy(() => import('./pages/admin/AdminTenantDetail'));
const AdminBikes = lazy(() => import('./pages/admin/AdminBikes'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminTasks = lazy(() => import('./pages/admin/AdminTasks'));
const AdminBikeDetail = lazy(() => import('./pages/admin/AdminBikeDetail'));
const PaymentHistory = lazy(() => import('./pages/admin/PaymentHistory'));
const Home = lazy(() => import('./pages/Home'));

function App() {
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
      <Suspense fallback={<div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center text-slate-950 dark:text-white">Загрузка...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route path="/history/:slug/statement" element={<PaymentHistory variant="statement" publicMode />} />
          <Route path="/history/:slug/weeks" element={<PaymentHistory variant="weeks" publicMode />} />

          {/* Защищенные роуты админки */}
          <Route path="/admin" element={<Layout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="bikes" element={<AdminBikes />} />
            <Route path="bike/:id" element={<AdminBikeDetail />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="tenant/:id" element={<AdminTenantDetail />} />
            <Route path="tenant/:id/history/statement" element={<PaymentHistory variant="statement" />} />
            <Route path="tenant/:id/history/weeks" element={<PaymentHistory variant="weeks" />} />
          </Route>

          {/* Публичный роут арендатора: основная страница теперь использует недельную историю */}
          <Route path="/:slug" element={<PaymentHistory variant="weeks" publicMode />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
