import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_META } from '../constants/roles.js';
import AuthHeroLayout from '../components/auth/AuthHeroLayout.jsx';
import { useGoogleSignIn } from '../components/auth/useGoogleSignIn.js';
import { emailError } from '../utils/validation.js';

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
   the two are deliberately not the same screen.

   Candidates are meant to be Google-only long-term, but Google OAuth isn't
   wired up in this Supabase project yet, so a password form is included here
   too (same as TALoginPage) purely so a manually-created test user can sign
   in during setup. Remove this once Google sign-in is configured. */
export default function LoginPage() {
  const { configured, role, loading: authLoading, signInWithPassword } = useAuth();
  const { error: googleError, signing, trigger } = useGoogleSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — send them straight to their own portal instead of
  // trapping them on a dead-end "wrong account type" screen. The generic
  // "Login / Sign Up" link on the main landing page always points here
  // regardless of who clicks it, so a TA/HR account landing on this
  // candidate-only page is expected, not an error — homeForRole already
  // knows exactly where every role belongs.
  if (configured && !authLoading && role) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  const submitPassword = async (e) => {
    e.preventDefault();
    if (submitting || !configured) return;
    setFormError('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError('Enter your email and password.');
      return;
    }
    const emailMsg = emailError(trimmedEmail, { required: true });
    if (emailMsg) {
      setFormError(emailMsg);
      return;
    }
    setSubmitting(true);
    const { error } = await signInWithPassword(trimmedEmail, password);
    if (error) {
      setFormError(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthHeroLayout
      theme="candidate"
      floatIn={{ icon: 'UserRound', label: 'New Applicant' }}
      floatOut={{ icon: 'FileCheck', label: 'Offer sent!' }}
      title={<>Find your next<br /><span>opportunity here.</span></>}
      subtitle="Apply in minutes and track every step, from application to offer."
      journey={JOURNEY}
      tags="Careers at Ccentrik"
      panelTitle="Welcome to Ccentrik Careers"
      panelLede="Sign in with Google to apply for a role or pick up an application you've already started."
      error={googleError}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      footer="New here? Signing in with Google creates your candidate account automatically — no separate sign-up needed."
    >
      <form onSubmit={submitPassword} noValidate>
        {formError && (
          <div className="wsauth__alert" role="alert">
            <Icon name="AlertCircle" size={15} /> {formError}
          </div>
        )}
        <label className="wsauth__field">
          <span className="wsauth__label">Email</span>
          <span className="wsauth__box">
            <input
              type="email" autoComplete="username" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email"
            />
          </span>
        </label>
        <label className="wsauth__field">
          <span className="wsauth__label">Password</span>
          <span className="wsauth__box">
            <input
              type={showPw ? 'text' : 'password'} autoComplete="current-password"
              placeholder="Enter your password" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-label="Password"
            />
            <button type="button" className="wsauth__eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
              <Icon name={showPw ? 'EyeOff' : 'Eye'} size={16} />
            </button>
          </span>
        </label>
        <button type="submit" className="wsauth__submit" disabled={!configured || submitting}>
          {submitting ? <><span className="wsauth__spinner" /> Signing in…</> : <>Sign in <Icon name="ArrowRight" size={16} /></>}
        </button>
      </form>
    </AuthHeroLayout>
  );
}
