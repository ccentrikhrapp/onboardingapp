import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

/* Every real route in this app requires an hr/admin session. */
export default function RoleRoute({ children }) {
  const { configured, role, loading } = useAuth();

  if (!configured) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--hr-text-soft)' }}>
        This app needs a Supabase project configured — copy .env.example to .env.
      </div>
    );
  }
  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--hr-text-soft)' }}>Loading…</div>;
  }
  if (!role || ![ROLES.HR, ROLES.ADMIN].includes(role)) return <Navigate to="/" replace />;
  return children;
}
