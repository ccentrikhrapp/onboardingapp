import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../kit/Skeleton.jsx';

/* Every real route in this app requires an hr/admin session. */
export default function RoleRoute({ allow, children }) {
  const { configured, role, loading } = useAuth();

  if (!configured) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--hr-text-soft)' }}>
        This app needs a Supabase project configured — copy .env.example to .env.
      </div>
    );
  }
  if (loading) {
    return <SkeletonPage />;
  }
  if (!role || ![ROLES.HR, ROLES.ADMIN].includes(role)) return <Navigate to="/" replace />;
  // allow="admin": Super Admin only (e.g. Teams) — the team-* edge functions
  // enforce the same rule server-side.
  if (allow === 'admin' && role !== ROLES.ADMIN) return <Navigate to="/hr" replace />;
  return children;
}
