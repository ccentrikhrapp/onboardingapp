import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { HR_STAFF_ROLES } from '../../constants/roles.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../kit/Skeleton.jsx';

/* `allow`: the roles permitted here, as an array — defaults to hr/admin
   (every existing route keeps working unchanged). Accounts/IT/Office Admin
   only reach routes that explicitly list them (e.g. /hr/tasks). */
export default function RoleRoute({ allow = HR_STAFF_ROLES, children }) {
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
  if (!role || !allow.includes(role)) return <Navigate to="/" replace />;
  return children;
}
