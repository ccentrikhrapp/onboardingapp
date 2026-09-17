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
  const { configured, role, loading: authLoading, signInWithPassword } = useAuth();
  const { error: googleError, signing, trigger } = useGoogleSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — send them straight to their own portal instead of
  // trapping them on a dead-end "wrong account type" screen (see the
  // matching fix in LoginPage.jsx — same bug, same reason: a stray link can
  // land any already-authenticated role on this staff-only page).
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
      theme="ta"
      floatIn={{ icon: 'FileText', label: 'New Application' }}
      floatOut={{ icon: 'UserRoundCheck', label: 'Candidate hired!' }}
      title={<>Talent Acquisition<br /><span>Workspace</span></>}
      subtitle="Review applications, run interviews, and move candidates forward — one pipeline, end to end."
      journey={JOURNEY}
      tags="Recruitment Team"
      panelTitle="Recruiter sign-in"
      panelLede="Sign in with your Ccentrik credentials or Google account."
      error={googleError}
      notConfigured={!configured}
      configured={configured}
      signing={signing}
      authLoading={authLoading}
      onGoogleClick={trigger}
      footer="For internal use by the Ccentrik Talent Acquisition team."
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
          onClick={() => setFormError('Password resets are handled by your workspace administrator.')}
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
