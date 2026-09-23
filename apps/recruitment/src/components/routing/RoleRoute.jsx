import { Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';

export default function RoleRoute({ allow, children }) {
  const { role, authConfigured, authLoading } = useApp();

  // Wait for the real session + profile before deciding anything.
  if (authConfigured && authLoading) {
    return <div className="route-loading" style={{ padding: 48, textAlign: 'center', color: '#8a93a3' }}>Loading…</div>;
  }

  // Not signed in: send to the login page matching what was requested,
  // not always the candidate one (a TA hitting /ta/* directly, or after
  // logging out, must land on /ta/login — never the candidate screen).
  if (!role) return <Navigate to={allow === 'ta' ? '/ta/login' : '/'} replace />;
  // admin/admin_ta are supersets of ta ("Super TA" tier) — same workspace,
  // plus cross-team oversight; Teams is open to Super Admin + Talent Acquisition
  // Head (allow="team"), with finer limits enforced server-side (team-* functions).
  const isTaTier = (r) => r === 'ta' || r === 'admin' || r === 'admin_ta';
  const permitted = allow === 'ta' ? isTaTier(role) : allow === 'team' ? (role === 'admin' || role === 'admin_ta') : role === allow;
  if (allow && !permitted) {
    const home = isTaTier(role) ? '/ta' : '/candidate';
    return <Navigate to={home} replace />;
  }
  return children;
}
