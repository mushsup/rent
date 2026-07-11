import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTenantDetail from './pages/admin/AdminTenantDetail';
import AdminBikes from './pages/admin/AdminBikes';
import AdminPayments from './pages/admin/AdminPayments';
import TenantPublic from './pages/TenantPublic';
import Home from './pages/Home';

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: '#374151',
          color: '#fff',
        },
      }} />
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
    </>
  );
}

export default App;
