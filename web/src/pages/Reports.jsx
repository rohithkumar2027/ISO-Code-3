import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '../components/PageShell';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { t } from '../i18n';

function istDate(iso, lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Reports() {
  const { lang, patient } = useSession();
  const [people, setPeople] = useState(null);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    if (!patient) return;
    api.reports().then((r) => setPeople(r.people)).catch((e) => { if (e instanceof ApiError && e.code === 'consent_required') setNeedsConsent(true); });
  }, [patient]);

  if (patient === undefined) return null;
  if (!patient) return <Navigate to="/login" replace />;
  if (needsConsent || !patient.consent) return <Navigate to="/consent" replace />;

  const empty = people && people.every((p) => !p.orders.length);

  return (
    <Page>
      <p className="eyebrow">{t(lang, 'brand')}</p>
      <h1 className="display-lg">{t(lang, 'reports_title')}</h1>

      {people === null && <div className="empty-state"><span className="spinner" /></div>}

      {people && empty && (
        <div className="card empty-state" style={{ marginTop: 28 }}>
          <p>{t(lang, 'reports_empty')}</p>
        </div>
      )}

      {people && !empty && people.map((person) => (
        <section key={person.name}>
          {people.length > 1 && <h2 className="person-name">{person.name}</h2>}
          <div style={{ display: 'grid', gap: 14, marginTop: people.length > 1 ? 0 : 16 }}>
            {person.orders.map((o, i) => (
              <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
                {o.status === 'processing' ? (
                  <div className="card order-card">
                    <div className="order-row">
                      <span className="order-id">{o.id}</span>
                      <span className="pill processing">… {t(lang, 'status_processing')}</span>
                    </div>
                    <div className="order-meta">{o.referring_doctor ?? ''}</div>
                  </div>
                ) : (
                  <Link to={`/reports/${o.id}`} className="card order-card">
                    <div className="order-row">
                      <span className="order-id">{o.id}</span>
                      <span className="pill ready">✓ {t(lang, 'status_ready')}</span>
                    </div>
                    <div className="order-meta">
                      {[t(lang, 'signed_on', { d: istDate(o.signed_at, lang) }), o.referring_doctor].filter(Boolean).join(' · ')}
                    </div>
                    {o.status === 'ready_critical' && <p style={{ color: 'var(--rust)', fontWeight: 650, marginTop: 8 }}>! {t(lang, 'critical_note')}</p>}
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}
