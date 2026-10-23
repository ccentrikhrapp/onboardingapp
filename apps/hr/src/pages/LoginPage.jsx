import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, ROLE_META } from '../constants/roles.js';
import AuthHeroLayout from '../components/auth/AuthHeroLayout.jsx';
import { useGoogleSignIn } from '../components/auth/useGoogleSignIn.js';

function homeForRole(role) {
  return ROLE_META[role]?.home || '/hr';
}

// HR's own journey — picks up once Talent Acquisition hands a candidate
// over (docs/requirements/02-two-application-architecture.md): verify their
// documents, get the offer accepted, and bring them on as an employee.
const JOURNEY = [
  { label: 'Handover', icon: 'ArrowRightLeft', desc: 'From Talent Acquisition', c: '#60a5fa', c2: '#2563eb' },
  { label: 'Documents', icon: 'FileCheck2', desc: 'Verify and confirm', c: '#a78bfa', c2: '#7c3aed' },
  { label: 'Joining', icon: 'CalendarCheck2', desc: 'Set the start date', c: '#f472b6', c2: '#db2777' },
  { label: 'Employee', icon: 'UserRoundCheck', desc: 'Fully onboarded', c: '#fbbf24', c2: '#f59e0b' },
];

/* Ccentrik HR's own sign-in — same two-pane hero shell and same blue brand
   identity as the recruitment app's candidate/TA sign-in (per explicit
   request), with HR's own copy and journey. HR staff get a password form
   too (for accounts an admin has provisioned), on top of Google — same
   pattern as the recruitment app's TA login. */
export default function LoginPage() {
  const { configured, role, loading: authLoading, signOut, signInWithPassword, requestPasswordReset } = useAuth();
  const { error: googleError, signing, trigger } = useGoogleSignIn('/');

  const [email, setEmail] = useState(() => { try { return new URLSearchParams(window.location.search).get('email') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState(() => {
    // Set by AuthContext when a disabled account was just signed out; or by
    // Supabase when the Google account isn't on the HR allow-list (the
    // database refuses to create an account for it and the browser comes
    // back with an error in the URL).
    try {
      const n = sessionStorage.getItem('ccx_auth_notice');
      if (n) sessionStorage.removeItem('ccx_auth_notice');
      if (n) return n;
    } catch { /* private mode */ }
    const qs = `${window.location.search} ${window.location.hash}`;
    if (/error_description|error=/.test(qs)) {
      return 'This Google account is not associated with an authorized user account. Please sign in using the invited email address or contact your administrator.';
    }
    return '';
  });
  const [formInfo, setFormInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Match the recruitment app's login pages, which render at a global 90%
  // browser zoom on desktop (apps/recruitment/src/index.css) — applied the
  // same way here (at the document root, not a nested box) so the two
  // portals' sign-in screens are the same size. Scoping zoom to a child
  // element instead causes a layout-overflow/scrollbar bug in Chrome, so
  // this only touches <html>, and only while this page is mounted.
  useEffect(() => {
    if (window.innerWidth <= 960) return undefined;
    document.documentElement.style.zoom = '0.9';
    return () => { document.documentElement.style.zoom = ''; };
  }, []);

  if (configured && !authLoading && role) {
    if (![ROLES.HR, ROLES.ADMIN].includes(role)) {
      return (
        <div className="wsauth" style={{ placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <p>This account does not have HR access. Please use the recruitment application instead.</p>
            <button type="button" className="wsauth__forgot" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      );
    }
    return <Navigate to={homeForRole(role)} replace />;
  }

  const forgot = async () => {
    setFormInfo('');
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setFormError('Enter your email above, then choose Forgot password.'); return; }
    setFormError('');
    await requestPasswordReset(trimmed);
    setFormInfo(`If an account exists for ${trimmed}, we've emailed a password reset link.`);
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (submitting || !configured) return;
    setFormError('');
    if (!email.trim() || !password) {
      setFormError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) {
      setFormError(
        error.message === 'Invalid login credentials' ? 'Incorrect email or password.'
          : /banned/i.test(error.message) ? 'Your account has been disabled. Please contact your administrator.'
            : error.message,
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthHeroLayout
      floatIn={{ icon: 'ArrowRightLeft', label: 'Candidate handed over' }}
      floatOut={{ icon: 'UserRoundCheck', label: 'Employee onboarded!' }}
      title={<>Bring every new hire<br /><span>smoothly on board.</span></>}
      subtitle="Verify documents, track joining, and turn accepted offers into employees — end to end."
      journey={JOURNEY}
      tags="Ccentrik HR"
      panelTitle="HR sign-in"
      panelLede="Sign in with your Ccentrik HR credentials or Google account."
      error={googleError}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      footer="Access is granted by your HR administrator. Candidate/TA accounts belong to the separate recruitment application."
    >
      <form onSubmit={submitPassword} noValidate>
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
