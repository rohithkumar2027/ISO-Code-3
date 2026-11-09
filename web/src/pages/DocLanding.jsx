import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '../components/PageShell';
import { Banner } from '../components/Banner';
import { LeafMark } from '../components/Mark';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/SessionContext';
import { t } from '../i18n';

/** Landing page for a broadcast-document link (sent by the doctor/lab console, not tied to a report). */
export default function DocLanding() {
  const { token } = useParams();
  const { lang } = useSession();
  const navigate = useNavigate();
  const [state, setState] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.docLink(token).then(setState).catch((e) => setState(e instanceof ApiError ? { error: e.code } : { error: 'server_error' }));
  }, [token]);

  if (state === undefined) return <Page narrow><div className="empty-state"><span className="spinner" /></div></Page>;

  if (state.error) {
    const expired = state.error === 'expired';
    return (
      <Page narrow>
        <h1 className="display-lg">{t(lang, expired ? 'err_expired_link_title' : 'err_invalid_link_title')}</h1>
        <p className="lede">{t(lang, expired ? 'err_expired_link_body' : 'err_invalid_link_body')}</p>
      </Page>
    );
  }

  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.docLinkSend(token);
      navigate(`/d/${token}/verify`, { state: { maskedMobile: r.maskedMobile, demoCode: r.demoCode, documentName: state.documentName } });
    } catch {
      setError(t(lang, 'err_server'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page narrow>
      <LeafMark className="mark" />
      <p className="eyebrow">{t(lang, 'brand')}</p>
      <h1 className="display-xl">A document was sent to you</h1>
      <p className="lede" style={{ margin: '14px 0 8px' }}><strong>{state.documentName}</strong></p>
      {state.description && <p className="lede" style={{ margin: '0 0 20px' }}>{state.description}</p>}
      <p className="lede" style={{ margin: '0 0 28px' }}>{t(lang, 'link_body', { m: state.maskedMobile })}</p>
      <Banner kind="bad">{error}</Banner>
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? <span className="spinner" /> : t(lang, 'link_send')}</button>
      </div>
    </Page>
  );
}
