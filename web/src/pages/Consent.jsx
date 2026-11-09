import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '../components/PageShell';
import { SprigDivider } from '../components/Mark';
import { api } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { t } from '../i18n';

export default function Consent() {
  const { lang, patient, refresh } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (patient === undefined) return null;
  if (!patient) return <Navigate to="/login" replace />;
  if (patient.consent) return <Navigate to="/reports" replace />;

  async function decide(decision) {
    setBusy(true);
    try {
      const r = await api.consent(decision, patient.csrf);
      if (r.loggedOut) { await refresh(); navigate('/login', { replace: true }); return; }
      await refresh();
      navigate('/reports', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  const points = [t(lang, 'consent_1'), t(lang, 'consent_2'), t(lang, 'consent_3'), t(lang, 'consent_4')];

  return (
    <Page narrow>
      <p className="eyebrow">{t(lang, 'brand')}</p>
      <h1 className="display-lg">{t(lang, 'consent_title')}</h1>
      <SprigDivider className="mark" style={{ width: 160, height: 22, margin: '20px 0' }} />
      <div className="card">
        <ul style={{ margin: 0, padding: '0 0 0 1.1em', display: 'grid', gap: 16 }}>
          {points.map((p, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}>
              {p}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={() => decide('agree')}>{t(lang, 'consent_agree')}</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => decide('decline')}>{t(lang, 'consent_decline')}</button>
      </div>
    </Page>
  );
}
