import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { VerifyForm } from '../components/VerifyForm';
import { api } from '../lib/api';
import { useSession } from '../lib/SessionContext';

export default function LoginVerify() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { refresh } = useSession();

  // A direct visit or reload has no pending-login state to show; the signed
  // "pl" cookie (if any) is short-lived anyway, so send them back to start.
  if (!state?.maskedMobile) return <Navigate to="/login" replace />;

  async function onVerify(code) {
    const r = await api.verify(code);
    await refresh();
    navigate(r.consent ? '/reports' : '/consent', { replace: true });
  }

  return (
    <VerifyForm
      maskedMobile={state?.maskedMobile}
      demoCode={state?.demoCode}
      onVerify={onVerify}
      onResend={() => api.resend()}
    />
  );
}
