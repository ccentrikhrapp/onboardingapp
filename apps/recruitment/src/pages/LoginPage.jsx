import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCandidateAuth } from '../context/CandidateAuthContext.jsx';
import { ROLE_META } from '../constants/roles.js';
import AuthHeroLayout from '../components/auth/AuthHeroLayout.jsx';
import { useGoogleSignIn } from '../components/auth/useGoogleSignIn.js';
import { emailError } from '../utils/validation.js';
import { isAuthReturn, hasStoredCandidateSession, returnErrorMessage, cleanAuthUrl } from '../utils/authFlow.js';

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

   Candidates are meant to be Google-only — the single "Continue with Google"
   button below signs up a new candidate or signs in an existing one
   transparently (Supabase resolves that by the verified email; see
   CandidateAuthContext#signInWithGoogle). A password form is kept alongside
   it (same as TALoginPage) only for a manually-created test account. */
export default function LoginPage() {
  // Two separate identities are relevant on this one screen: if a TA/HR
  // account is ALREADY signed in on this device (their own, separate session —
  // see lib/supabase.js), send them straight to their portal instead of
  // showing a candidate login form. Everything the person actually does here
  // (Google sign-in, the password form) acts on the candidate session only,
  // and never assumes an existing TA session means this person is a candidate.
  const { role, loading: staffLoading } = useAuth();
  const { configured, loading: authLoading, user, signInWithPassword } = useCandidateAuth();
  const { error: googleError, signing, trigger } = useGoogleSignIn('/candidate/login', useCandidateAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState(() => {
    // Supabase sends the browser back with an error in the URL when the
    // Google round-trip itself failed (declined, or a real auth error) —
    // shown in plain language instead of silently doing nothing.
    try { return returnErrorMessage(); } catch { return ''; }
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    cleanAuthUrl();
  }, [authLoading]);

  // Already signed in — send them straight to their own portal instead of
  // trapping them on a dead-end "wrong account type" screen. The generic
  // "Login / Sign Up" link on the main landing page always points here
  // regardless of who clicks it, so a TA/HR account landing on this
  // candidate-only page is expected, not an error — homeForRole already
  // knows exactly where every role belongs.
  if (configured && !staffLoading && role) {
    return <Navigate to={homeForRole(role)} replace />;
  }
  // A candidate who just finished a real (non-anonymous) Google sign-in/up
  // lands back here (this page's own landingPath) — without this, they'd
  // just sit on the login form forever with no visible next step, since
  // nothing else on this page reacts to a completed candidate sign-in.
  if (configured && !authLoading && user && !user.is_anonymous) {
    return <Navigate to="/candidate/application" replace />;
  }
  // Coming back from Google (or restoring a saved session): show one calm
  // "signing you in" screen — never a flash of the login form, which is
  // exactly what used to look like the sign-in silently failing.
  if (configured && authLoading && (isAuthReturn() || hasStoredCandidateSession())) {
    return (
      <div className="wsauth" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="wsauth__spinner" style={{ display: 'inline-block' }} />
          <p className="wsauth__lede" style={{ marginTop: 12 }}>Signing you in…</p>
        </div>
      </div>
    );
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
      panelTitle="Join Ccentrik Careers"
      panelLede="Sign up with Google to apply for a role and track every step — or sign in if you already have an account."
      error={googleError}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      googleFirst
      googleLabel="Sign up with Google"
      signingLabel="Opening Google…"
      crossLink={(
        <button type="button" className="wsauth__google" style={{ marginTop: 10 }} onClick={trigger} disabled={!configured || signing || authLoading}>
          Already have an account? Sign in with Google
        </button>
      )}
      footer="New here? Sign up with Google and your candidate account is created automatically. Returning candidates are signed in to the account they already have."
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
