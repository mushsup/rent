import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';

const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminTenantDetail = lazy(() => import('./pages/admin/AdminTenantDetail'));
const AdminBikes = lazy(() => import('./pages/admin/AdminBikes'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const TenantPublic = lazy(() => import('./pages/TenantPublic'));
const Home = lazy(() => import('./pages/Home'));

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#374151',
          color: '#fff',
        },
      }} />
      <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center text-gray-900 dark:text-white">Загрузка...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Защищенные роуты админки */}
          <Route path="/admin" element={<Layout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="bikes" element={<AdminBikes />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="tenant/:id" element={<AdminTenantDetail />} />
          </Route>

          {/* Публичный роут арендатора */}
          <Route path="/:slug" element={<TenantPublic />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
