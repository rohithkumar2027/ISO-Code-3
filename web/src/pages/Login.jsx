import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { errText, t } from '../i18n';

export default function Login() {
  const { lang } = useSession();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.login(mobile);
      navigate('/login/verify', { state: { maskedMobile: r.maskedMobile, demoCode: r.demoCode } });
    } catch (e2) {
      setError(e2 instanceof ApiError ? (e2.code === 'mobile_invalid' ? t(lang, 'mobile_invalid') : errText(lang, e2.code, { n: e2.extra?.retryAfterSec })) : t(lang, 'err_server'));
    } finally {
      setBusy(false);
    }
  }

  function handleQuickNumber(num) {
    setMobile(num);
  }

  return (
    <Page narrow>
      <div className="card login-container-card">
        {/* Pharmacy Cross & Patient Profile Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--forest-tint)',
              border: '2px solid var(--forest-tint-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              color: 'var(--forest)',
              boxShadow: '0 4px 14px rgba(15, 118, 110, 0.15)',
            }}
          >
            👤
          </div>
        </div>

        <p className="eyebrow" style={{ textAlign: 'center' }}>
          PATIENT DIGITAL LAB PORTAL
        </p>
        <h1 className="display-lg" style={{ textAlign: 'center', margin: '6px 0 8px' }}>
          {t(lang, 'login_title')}
        </h1>
        <p className="lede" style={{ textAlign: 'center', margin: '0 auto 24px', fontSize: '0.95rem' }}>
          {t(lang, 'login_sub')}
        </p>

        <Banner kind="bad">{error}</Banner>

        <form onSubmit={onSubmit}>
          <label htmlFor="mobile">{t(lang, 'mobile_label')}</label>
          <input
            id="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={16}
            placeholder="98765 43210"
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />

          <div className="actions" style={{ marginTop: '16px' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : t(lang, 'send_code')}
            </button>
          </div>
        </form>

        {/* 1-Click Demo Patient Accounts */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: '24px', paddingTop: '18px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '650', color: 'var(--ink-soft)', marginBottom: '8px', textAlign: 'center' }}>
            Quick Demo Patient Accounts:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="btn small secondary"
              style={{ fontSize: '0.78rem', minHeight: '34px', padding: '0 8px' }}
              onClick={() => handleQuickNumber('9000000001')}
            >
              Lakshmi & Rao (`…001`)
            </button>
            <button
              type="button"
              className="btn small secondary"
              style={{ fontSize: '0.78rem', minHeight: '34px', padding: '0 8px' }}
              onClick={() => handleQuickNumber('9000000002')}
            >
              Farzana Begum (`…002`)
            </button>
          </div>
        </div>

        {/* Dedicated Link to Doctor Login */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px',
            background: 'var(--ivory-deep)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            textAlign: 'center',
            color: 'var(--ink-soft)',
          }}
        >
          <span>Are you a medical doctor or pathologist? </span>
          <Link
            to="/doctor/login"
            style={{ color: 'var(--forest)', fontWeight: '700', textDecoration: 'underline' }}
          >
            Doctor Sign-In Portal →
          </Link>
        </div>
      </div>
    </Page>
  );
}
