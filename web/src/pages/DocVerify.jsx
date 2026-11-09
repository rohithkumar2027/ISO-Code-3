import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { VerifyForm } from '../components/VerifyForm';
import { Page } from '../components/PageShell';
import { api, docFileUrl } from '../lib/api';

export default function DocVerify() {
  const { token } = useParams();
  const { state } = useLocation();
  const [opened, setOpened] = useState(false);

  if (!state?.maskedMobile) return <Navigate to={`/d/${token}`} replace />;

  async function onVerify(code) {
    await api.docLinkVerify(token, code);
    setOpened(true);
  }

  if (opened) {
    return (
      <Page narrow>
        <h1 className="display-lg">✓ Verified</h1>
        <p className="lede" style={{ margin: '14px 0 28px' }}>You can now open <strong>{state.documentName}</strong>.</p>
        <div className="actions">
          <a className="btn" href={docFileUrl(token)} target="_blank" rel="noreferrer">Open document →</a>
        </div>
      </Page>
    );
  }

  return (
    <VerifyForm
      maskedMobile={state.maskedMobile}
      demoCode={state.demoCode}
      onVerify={onVerify}
      onResend={() => api.docLinkSend(token)}
    />
  );
}
