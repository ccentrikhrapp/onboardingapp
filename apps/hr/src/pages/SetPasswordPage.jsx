import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import markColor from '../assets/ccentrik-logo.png';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { inspectInvitation, activateInvitation, setInitialPassword } from '../api/team.js';

/* Same rule the server enforces (accept-invite) — checked here first only
   so the person gets instant feedback. */
function passwordProblem(pw) {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number.';
  if (pw.length > 72) return 'Use 72 characters or fewer.';
  return '';
}

/**
 * Two entry points, one screen:
 *  mode="invite" — /accept-invite?token=…  activates an invited account
 *  mode="reset"  — /reset-password         finishes a Supabase recovery link
 *  mode="temp"   — shown by AppRoutes right after signing in with the emailed
 *                  temporary password, until a permanent one is chosen
 */
export default function SetPasswordPage({ mode }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { session, profile, signInWithPassword, signOut, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState(mode === 'temp' ? 'ready' : 'loading'); // loading | ready | error | done
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'invite') return;
    if (!token) {
      setError("This invitation link isn't valid.");
      setPhase('error');
      return;
    }
    inspectInvitation(token)
      .then((d) => { setInfo(d); setPhase('ready'); })
      .catch((e) => { setError(e.message); setPhase('error'); });
  }, [mode, token]);

  // Recovery: supabase-js turns the emailed link into a temporary session.
  useEffect(() => {
    if (mode !== 'reset') return;
    if (session) { setPhase('ready'); return undefined; }
    if (authLoading) return undefined;
    const t = setTimeout(() => {
      setError('This password reset link is invalid or has expired. Request a new one from the sign-in page.');
      setPhase('error');
    }, 2500);
    return () => clearTimeout(t);
  }, [mode, session, authLoading]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError("The two passwords don't match.");
    setError('');
    setBusy(true);
    try {
      if (mode === 'invite') {
        await activateInvitation(token, pw);
        const { error: signInErr } = await signInWithPassword(info.email, pw);
        if (signInErr) throw new Error('Your password is set. Please sign in with it.');
      } else if (mode === 'temp') {
        const email = profile.email;
        await setInitialPassword(pw);
        // Changing the password ends the temporary session server-side. Drop the
        // stale local copy first so its failing token refresh can't sign out the
        // new session, then sign in again with the new password.
        await supabase.auth.signOut({ scope: 'local' });
        const { error: signInErr } = await signInWithPassword(email, pw);
        if (signInErr) throw new Error('Your password is set. Please sign in with it.');
        setPhase('done');
        // Full reload so the profile is re-read without the temporary-password flag.
        setTimeout(() => window.location.replace('/'), 900);
        return;
      } else {
        const { error: updErr } = await supabase.auth.updateUser({ password: pw });
        if (updErr) throw new Error(updErr.message);
      }
      setPhase('done');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="wsauth" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box', overflowX: 'hidden', padding: 24, background: '#f4f5f7' }}>
      <div className="wsauth__panel" style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 8px 30px rgba(15,23,41,.08)' }}>
        <img className="wsauth__logo wsauth__logo--sm" src={markColor} alt="Ccentrik" />

        {phase === 'loading' && <p className="wsauth__lede">Checking your link…</p>}

        {phase === 'error' && (
          <>
            <h2>Link problem</h2>
            <div className="wsauth__alert" role="alert"><Icon name="AlertCircle" size={15} /> {error}</div>
            <p className="wsauth__foot"><Link to="/">Go to sign in</Link></p>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2>You're all set</h2>
            <p className="wsauth__lede">Password saved. Taking you to your workspace…</p>
          </>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} noValidate>
            <h2>{mode === 'invite' ? 'Activate your account' : mode === 'temp' ? 'Choose your password' : 'Set a new password'}</h2>
            <p className="wsauth__lede">
              {mode === 'invite'
                ? <>Welcome{info?.fullName ? `, ${info.fullName}` : ''}. You're joining the Ccentrik {info?.appName} as <strong>{info?.roleLabel}</strong> ({info?.email}). Choose a password to finish.</>
                : mode === 'temp'
                  ? <>Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}. You signed in with a temporary password. Choose your own password now &mdash; it must be different from the temporary one.</>
                  : 'Choose a new password for your account.'}
            </p>
            {error && <div className="wsauth__alert" role="alert"><Icon name="AlertCircle" size={15} /> {error}</div>}
            <label className="wsauth__field">
              <span className="wsauth__label">New password</span>
              <span className="wsauth__box">
                <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
                <button type="button" className="wsauth__eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <Icon name={showPw ? 'EyeOff' : 'Eye'} size={16} />
                </button>
              </span>
            </label>
            <label className="wsauth__field">
              <span className="wsauth__label">Confirm password</span>
              <span className="wsauth__box">
                <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label="Confirm password" />
              </span>
            </label>
            <p className="wsauth__foot" style={{ textAlign: 'left', marginBottom: 14 }}>At least 10 characters, with a letter and a number.</p>
            <button type="submit" className="wsauth__submit" disabled={busy}>
              {busy ? <><span className="wsauth__spinner" /> Saving…</> : mode === 'invite' ? 'Activate account' : 'Save password'}
            </button>
            {mode === 'temp' && (
              <p className="wsauth__foot"><button type="button" className="wsauth__link" onClick={() => signOut()} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Sign out</button></p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
