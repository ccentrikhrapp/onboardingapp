import { Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../common/States.jsx';

export default function RoleRoute({ allow, children }) {
  const { role, authConfigured, authLoading } = useApp();

  // Wait for the real session + profile before deciding anything.
  if (authConfigured && authLoading) {
    return <SkeletonPage />;
  }

  // Not signed in: send to the login page matching what was requested,
  // not always the candidate one (a TA hitting /ta/* directly, or after
  // logging out, must land on /ta/login — never the candidate screen).
  if (!role) return <Navigate to={allow === 'ta' ? '/ta/login' : '/'} replace />;
  // admin/admin_ta are supersets of ta ("Super TA" tier) — same workspace,
  // plus cross-team oversight; Teams is open to Super Admin + Talent Acquisition
  // Head (allow="team"), with finer limits enforced server-side (team-* functions).
  // developer is deliberately NOT part of isTaTier — it never gets real-data
  // access through the generic 'ta' check; only routes that explicitly pass
  // 'team_or_developer' / 'ta_or_developer' admit it.
  const isTaTier = (r) => r === 'ta' || r === 'admin' || r === 'admin_ta';
  const permitted =
    allow === 'ta' ? isTaTier(role) :
    allow === 'team' ? (role === 'admin' || role === 'admin_ta') :
    allow === 'team_or_developer' ? (role === 'admin' || role === 'admin_ta' || role === 'developer') :
    allow === 'ta_or_developer' ? (isTaTier(role) || role === 'developer') :
    role === allow;
  if (allow && !permitted) {
    const home = role === 'developer' ? '/ta/team' : isTaTier(role) ? '/ta' : '/candidate';
    return <Navigate to={home} replace />;
  }
  return children;
}
