import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, ROLE_META } from '../constants/roles.js';
import AuthHeroLayout from '../components/auth/AuthHeroLayout.jsx';
import { useGoogleSignIn } from '../components/auth/useGoogleSignIn.js';

function homeForRole(role) {
  return ROLE_META[role]?.home || '/candidate';
}

// This app owns the recruitment journey only — onboarding and beyond live in
// the separate HR application (docs/requirements/02-two-application-architecture.md).
const JOURNEY = [
  { label: 'Applied', icon: 'FileText', desc: 'All in one place', c: '#60a5fa', c2: '#2563eb' },
  { label: 'Screening', icon: 'Eye', desc: 'Find the right fit', c: '#a78bfa', c2: '#7c3aed' },
  { label: 'Interview', icon: 'CalendarDays', desc: 'Coordinate with ease', c: '#f472b6', c2: '#db2777' },
  { label: 'Offer', icon: 'FileCheck', desc: 'Move forward fast', c: '#fbbf24', c2: '#f59e0b' },
];

/* The public candidate sign-in — Careers-facing, warm and simple. Talent
   Acquisition has its own separate page at /ta/login (different look, own copy) —
   the two are deliberately not the same screen. */
export default function LoginPage() {
  const { configured, role, loading: authLoading, signOut } = useAuth();
  const { error, signing, trigger } = useGoogleSignIn();

  if (configured && !authLoading && role) {
    // A TA or HR account somehow reached this candidate-facing page.
    if (role !== ROLES.CANDIDATE) {
      return (
        <div className="wsauth" style={{ placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <p>This is a Talent Acquisition/HR account. Please use the appropriate sign-in page instead.</p>
            <button type="button" className="wsauth__forgot" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      );
    }
    return <Navigate to={homeForRole(role)} replace />;
  }

  return (
    <AuthHeroLayout
      theme="candidate"
      floatIn={{ icon: 'UserRound', label: 'New Applicant' }}
      floatOut={{ icon: 'FileCheck', label: 'Offer sent!' }}
      title={<>Find your next<br /><span>opportunity here.</span></>}
      subtitle="Apply in minutes and track every step, from application to offer."
      journey={JOURNEY}
      tags="Careers at Ccentrik"
      panelTitle="Welcome"
      panelLede="Sign in to apply for a role or track an application you've already submitted."
      error={error}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      footer="New here? Signing in with Google creates your candidate account automatically — no separate sign-up needed."
      crossLink={<p className="wsauth__foot"><Link to="/ta/login">Talent Acquisition team? Sign in here →</Link></p>}
    />
  );
}
