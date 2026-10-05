import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_META } from '../../constants/roles.js';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { isAuthReturn, hasStoredSession, peekCandidateReturn, clearCandidateReturn } from '../../utils/authFlow.js';

const STAFF = ['ta', 'admin_ta', 'admin'];

/* Google sign-in returns to the site root when the hosted redirect
   allow-list only knows that URL. A signed-in staff member must never be
   left on the generic landing page — send them straight to their portal.
   Candidates (including anonymous ones) keep seeing the public landing.
   While a sign-in is being completed or a saved session restored, show a calm
   "signing you in" screen instead of flashing the main screen first. */
export default function RootGate({ children }) {
  const { configured, role, loading } = useAuth();
  const candidate = useCandidateAuth();
  const candidateReturn = peekCandidateReturn();
  if (configured && !loading && STAFF.includes(role)) return <Navigate to={ROLE_META[role].home} replace />;
  // A candidate who started signing up on a /candidate page comes back here
  // from Google — once their candidate session is ready, send them back there.
  if (candidateReturn && candidate.configured && !candidate.loading && candidate.user && !candidate.user.is_anonymous) {
    clearCandidateReturn();
    return <Navigate to={candidateReturn} replace />;
  }
  if (candidateReturn && candidate.loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box', color: '#6b7280', fontFamily: 'inherit' }}>
        <p>Signing you in…</p>
      </div>
    );
  }
  if (configured && loading && (isAuthReturn() || hasStoredSession())) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box', color: '#6b7280', fontFamily: 'inherit' }}>
        <p>Signing you in…</p>
      </div>
    );
  }
  return children;
}
