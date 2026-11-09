import { AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/PageShell';
import { BackgroundElements } from './components/BackgroundElements';
import { useSession } from './lib/SessionContext';
import Home from './pages/Home';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';
import Consent from './pages/Consent';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import LinkLanding from './pages/LinkLanding';
import LinkVerify from './pages/LinkVerify';
import DoctorLogin from './pages/DoctorLogin';
import DoctorPortal from './pages/DoctorPortal';
import DocLanding from './pages/DocLanding';
import DocVerify from './pages/DocVerify';
import NotFound from './pages/NotFound';

export default function App() {
  const location = useLocation();
  const { patient } = useSession();

  return (
    <>
      <BackgroundElements />
      <Header loggedIn={!!patient} />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={patient ? <Navigate to="/reports" replace /> : <Login />} />
          <Route path="/login/verify" element={<LoginVerify />} />
          <Route path="/consent" element={<Consent />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/doctor/login" element={<DoctorLogin />} />
          <Route path="/doctor" element={<DoctorPortal />} />
          <Route path="/lab" element={<DoctorPortal />} />
          <Route path="/r/:token" element={<LinkLanding />} />
          <Route path="/r/:token/verify" element={<LinkVerify />} />
          <Route path="/d/:token" element={<DocLanding />} />
          <Route path="/d/:token/verify" element={<DocVerify />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
