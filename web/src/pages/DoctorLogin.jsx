import { useState } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import './doctor-login.css';

export default function DoctorLogin() {
  const { doctor, refreshDoctor } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (doctor) return <Navigate to="/doctor" replace />;

  async function handleDoctorLogin(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.doctorLogin(username.trim(), password);
      await refreshDoctor();
      navigate('/doctor', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'too_many'
          ? 'Too many attempts. Please wait 15 minutes and try again.'
          : 'Wrong username or password.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page narrow>
      <div className="doctor-login-card">
        <div className="doctor-login-icon">🩺</div>

        <div className="doctor-portal-tag">AUTHORIZED MEDICAL STAFF ONLY</div>
        <h1 className="doctor-login-title">Doctor &amp; Pathologist Portal</h1>
        <p className="doctor-login-sub">
          Review analyzer results, verify multi-lingual summaries, digitally sign reports for
          WhatsApp/SMS dispatch, and send documents to patients.
        </p>

        {error && <Banner kind="bad">{error}</Banner>}

        <form onSubmit={handleDoctorLogin} className="doctor-login-form">
          <div className="form-group">
            <label htmlFor="doc-username">Username</label>
            <input
              id="doc-username" type="text" autoComplete="username" required autoFocus
              value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. pathologist1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="doc-password">Password</label>
            <input
              id="doc-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn doctor-submit-btn" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Sign In to Pathology Station →'}
          </button>
        </form>

        <p className="doctor-demo-hint">
          Demo account: <strong>pathologist1</strong> — the password is printed to the server console
          each time it starts (same account used by the staff console's "Summary review" page).
        </p>

        <div className="switch-portal-box">
          <span>Are you a patient looking for your test reports?</span>
          <Link to="/login" className="switch-portal-link">Switch to Patient Portal →</Link>
        </div>
      </div>
    </Page>
  );
}
