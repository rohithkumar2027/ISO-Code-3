import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/SessionContext';

/** "/" just routes to the right place; it has no page of its own. */
export default function Home() {
  const { patient } = useSession();
  if (patient === undefined) return null;
  return <Navigate to={patient ? '/reports' : '/login'} replace />;
}
