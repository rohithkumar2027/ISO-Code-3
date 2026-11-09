import { useState } from 'react';
import { Page } from './PageShell';
import { Banner } from './Banner';
import { LeafMark } from './Mark';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { errText, t } from '../i18n';

/** Shared OTP-entry screen for both the login flow and the report-link flow. */
export function VerifyForm({ maskedMobile, demoCode: initialDemoCode, onVerify, onResend }) {
  const { lang } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [demoCode, setDemoCode] = useState(initialDemoCode);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await onVerify(code.replace(/\s+/g, ''));
    } catch (e2) {
      setError(e2 instanceof ApiError ? errText(lang, e2.code, { n: e2.extra?.retryAfterSec }) : t(lang, 'err_server'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null); setNotice(null);
    try {
      const r = await onResend();
      setDemoCode(r?.demoCode ?? demoCode);
      setNotice(t(lang, 'resend'));
    } catch (e2) {
      setError(e2 instanceof ApiError ? errText(lang, e2.code, { n: e2.extra?.retryAfterSec }) : t(lang, 'err_server'));
    }
  }

  return (
    <Page narrow>
      <LeafMark className="mark" />
      <p className="eyebrow">{t(lang, 'brand')}</p>
      <h1 className="display-xl">{t(lang, 'verify_title')}</h1>
      <p className="lede" style={{ margin: '14px 0 28px' }}>{t(lang, 'verify_sub', { m: maskedMobile ?? '' })}</p>
      <Banner kind="bad">{error}</Banner>
      <Banner kind="info">{notice}</Banner>
      <form onSubmit={submit}>
        <label htmlFor="code" className="sr-only">{t(lang, 'code_label')}</label>
        <input
          id="code" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code"
          maxLength={8} pattern="[0-9 ]*" required autoFocus value={code} onChange={(e) => setCode(e.target.value)}
        />
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : t(lang, 'continue')}</button>
          <button className="btn quiet" type="button" onClick={resend}>{t(lang, 'resend')}</button>
        </div>
      </form>
      {demoCode && <div className="banner info" style={{ marginTop: 20 }}>{t(lang, 'demo_code', { c: demoCode })}</div>}
    </Page>
  );
}
