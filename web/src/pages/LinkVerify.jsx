import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { VerifyForm } from '../components/VerifyForm';
import { api } from '../lib/api';
import { useSession } from '../lib/SessionContext';

export default function LinkVerify() {
  const { token } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { refresh } = useSession();

  if (!state?.maskedMobile) return <Navigate to={`/r/${token}`} replace />;

  async function onVerify(code) {
    const r = await api.linkVerify(token, code);
    await refresh();
    navigate(r.consent ? `/reports/${r.orderId}` : `/consent`, { replace: true });
  }

  return (
    <VerifyForm
      maskedMobile={state.maskedMobile}
      demoCode={state.demoCode}
      onVerify={onVerify}
      onResend={() => api.linkSend(token)}
    />
  );
}
