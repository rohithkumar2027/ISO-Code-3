import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/PageShell';
import { useSession } from './lib/SessionContext';
import Home from './pages/Home';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';
import Consent from './pages/Consent';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import LinkLanding from './pages/LinkLanding';
import LinkVerify from './pages/LinkVerify';
import NotFound from './pages/NotFound';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { patient, logout } = useSession();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <Header loggedIn={!!patient} onLogout={onLogout} />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={patient ? <Navigate to="/reports" replace /> : <Login />} />
          <Route path="/login/verify" element={<LoginVerify />} />
          <Route path="/consent" element={<Consent />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/r/:token" element={<LinkLanding />} />
          <Route path="/r/:token/verify" element={<LinkVerify />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
