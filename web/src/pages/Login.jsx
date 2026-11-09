import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import { LeafMark } from '../components/Mark';
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

  return (
    <Page narrow>
      <LeafMark className="mark" />
      <p className="eyebrow">{t(lang, 'brand')}</p>
      <h1 className="display-xl">{t(lang, 'login_title')}</h1>
      <p className="lede" style={{ margin: '14px 0 32px' }}>{t(lang, 'login_sub')}</p>
      <Banner kind="bad">{error}</Banner>
      <form onSubmit={onSubmit}>
        <label htmlFor="mobile">{t(lang, 'mobile_label')}</label>
        <input
          id="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={16}
          placeholder="98765 43210" required value={mobile} onChange={(e) => setMobile(e.target.value)}
        />
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : t(lang, 'send_code')}</button>
        </div>
      </form>
    </Page>
  );
}
