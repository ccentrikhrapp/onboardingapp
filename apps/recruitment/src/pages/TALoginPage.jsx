import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_META } from '../constants/roles.js';
import AuthHeroLayout from '../components/auth/AuthHeroLayout.jsx';
import { useGoogleSignIn } from '../components/auth/useGoogleSignIn.js';
import { emailError } from '../utils/validation.js';
import { isAuthReturn, hasStoredSession, returnErrorMessage, cleanAuthUrl, SIGN_IN_FAILED, NOT_AUTHORIZED } from '../utils/authFlow.js';

function homeForRole(role) {
  return ROLE_META[role]?.home || '/candidate';
}

// Talent Acquisition's own recruitment funnel — same shell as the candidate
// page, deliberately different colour + copy so the two never feel identical.
const JOURNEY = [
  { label: 'Applied', icon: 'FileText', desc: 'Every candidate, one view', c: '#818cf8', c2: '#4f46e5' },
  { label: 'Screening', icon: 'Eye', desc: 'Review efficiently', c: '#a78bfa', c2: '#7c3aed' },
  { label: 'Interview', icon: 'CalendarDays', desc: 'Coordinate the panel', c: '#38bdf8', c2: '#0284c7' },
  { label: 'Hired', icon: 'UserRoundCheck', desc: 'Close the loop', c: '#34d399', c2: '#059669' },
];

/* Talent Acquisition's own sign-in — a distinct page from the candidate one
   (route, copy, colour). Recruiters get a password form too (for accounts an
   admin has provisioned), on top of Google — candidates only ever use Google. */
export default function TALoginPage() {
  const { configured, session, role, loading: authLoading, signInWithPassword, requestPasswordReset, signOut } = useAuth();
  const { error: googleError, signing, trigger } = useGoogleSignIn('/ta/login');

  const [email, setEmail] = useState(() => { try { return new URLSearchParams(window.location.search).get('email') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState(() => {
    // Set by AuthContext when a disabled account was just signed out.
    try {
      const n = sessionStorage.getItem('ccx_auth_notice');
      if (n) sessionStorage.removeItem('ccx_auth_notice');
      if (n) return n;
      // Supabase sends the browser back with an error in the URL when the
      // database refuses to create the account (e.g. a removed member's
      // address signing in with Google) — shown in plain language.
      return returnErrorMessage();
    } catch { return ''; }
  });
  const [formInfo, setFormInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — send them straight to their own portal instead of
  // trapping them on a dead-end "wrong account type" screen (see the
  // matching fix in LoginPage.jsx — same bug, same reason: a stray link can
  // land any already-authenticated role on this staff-only page).
  // A Google account that isn't on the staff list still gets a (candidate)
  // session from Google — it must never look like a successful staff login.
  const notStaff = configured && !authLoading && role === 'candidate';
  // Signed in with Google but no usable profile could be loaded: say so plainly
  // and reset, instead of leaving a silent login form.
  const noProfile = configured && !authLoading && !!session && !session.user?.is_anonymous && !role;
  useEffect(() => {
    if (authLoading) return;
    cleanAuthUrl();
    if (noProfile) {
      setFormError(SIGN_IN_FAILED);
      signOut();
    }
  }, [authLoading, noProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (configured && !authLoading && role && !notStaff) {
    return <Navigate to={homeForRole(role)} replace />;
  }
  // Coming back from Google (or restoring a saved session): show one calm
  // "signing you in" screen — never the login form, never the main screen.
  if (configured && authLoading && (isAuthReturn() || hasStoredSession())) {
    return (
      <div className="wsauth wsauth--ta" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="wsauth__spinner" style={{ display: 'inline-block' }} />
          <p className="wsauth__lede" style={{ marginTop: 12 }}>Signing you in…</p>
        </div>
      </div>
    );
  }

  const forgot = async () => {
    setFormInfo('');
    const trimmed = email.trim();
    const msg = emailError(trimmed, { required: true });
    if (msg) { setFormError('Enter your email above, then choose Forgot password.'); return; }
    setFormError('');
    await requestPasswordReset(trimmed);
    setFormInfo(`If an account exists for ${trimmed}, we've emailed a password reset link.`);
  };

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
      setFormError(
        error.message === 'Invalid login credentials' ? 'Incorrect email or password.'
          : /banned/i.test(error.message) ? 'Your account has been disabled. Please contact your administrator.'
            : SIGN_IN_FAILED,
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthHeroLayout
      theme="ta"
      floatIn={{ icon: 'FileText', label: 'New Application' }}
      floatOut={{ icon: 'UserRoundCheck', label: 'Candidate hired!' }}
      title={<>Talent Acquisition<br /><span>Workspace</span></>}
      subtitle="Review applications, run interviews, and move candidates forward — one pipeline, end to end."
      journey={JOURNEY}
      tags="Recruitment Team"
      panelTitle="Recruiter sign-in"
      panelLede="Sign in with your Ccentrik credentials or Google account."
      error={googleError || (notStaff ? NOT_AUTHORIZED : '')}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      footer="For internal use by the Ccentrik Talent Acquisition team."
    >
      <form onSubmit={submitPassword} noValidate>
        {notStaff && (
          <button type="button" className="wsauth__forgot" onClick={() => signOut()}>Use a different account</button>
        )}
        {formInfo && (
          <div className="wsauth__alert" role="status">
            <Icon name="Check" size={15} /> {formInfo}
          </div>
        )}
        {formError && (
          <div className="wsauth__alert" role="alert">
            <Icon name="AlertCircle" size={15} /> {formError}
          </div>
        )}
        <label className="wsauth__field">
          <span className="wsauth__label">Email</span>
          <span className="wsauth__box">
            <input
              type="email" autoComplete="username" placeholder="you@ccentrik.com"
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
        <button
          type="button" className="wsauth__forgot"
          onClick={forgot}
        >
          Forgot password?
        </button>
        <button type="submit" className="wsauth__submit" disabled={!configured || submitting}>
          {submitting ? <><span className="wsauth__spinner" /> Signing in…</> : <>Sign in <Icon name="ArrowRight" size={16} /></>}
        </button>
      </form>
    </AuthHeroLayout>
  );
}
