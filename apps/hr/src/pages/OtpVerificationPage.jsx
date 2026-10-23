import { useEffect, useRef, useState } from 'react';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sendSuperAdminOtp, verifySuperAdminOtp } from '../api/superAdminOtp.js';

function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
}

/* Super Admin's extra sign-in step (see AuthContext's otpRequired). The code
   is generated, emailed and checked entirely on the server
   (send-super-admin-otp / verify-super-admin-otp) — this page only collects
   it and calls markOtpVerified() once the server has accepted it. */
export default function OtpVerificationPage() {
  const { profile, markOtpVerified, signOut } = useAuth();
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [maskedEmail, setMaskedEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [resendAt, setResendAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const inputs = useRef([]);

  const requestCode = async () => {
    setSending(true);
    setError('');
    try {
      const data = await sendSuperAdminOtp();
      setMaskedEmail(data.maskedEmail);
      setExpiresAt(Date.parse(data.expiresAt));
      setResendAt(Date.now() + data.resendAfterSeconds * 1000);
      setDigits(Array(6).fill(''));
      setTimeout(() => inputs.current[0]?.focus(), 0);
    } catch (e) {
      setError(e.message || 'Could not send a verification code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => { requestCode(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expired = !!expiresAt && now >= expiresAt;
  const resendWaitMs = resendAt ? Math.max(0, resendAt - now) : 0;

  const setDigit = (i, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, i) => text[i] || ''));
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const code = digits.join('');

  const submit = async (e) => {
    e.preventDefault();
    if (verifying || code.length !== 6 || expired) return;
    setVerifying(true);
    setError('');
    try {
      await verifySuperAdminOtp(code);
      markOtpVerified();
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setDigits(Array(6).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="wsauth" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', placeItems: 'center', minHeight: '100vh', boxSizing: 'border-box', overflowX: 'hidden', padding: 24 }}>
      <div className="wsauth__panel" style={{ width: '100%', maxWidth: 420 }}>
        <h2>Verify your identity</h2>
        <p className="wsauth__lede">
          We&rsquo;ve sent a 6-digit verification code to your registered email address{maskedEmail ? <> (<strong>{maskedEmail}</strong>)</> : null}.
        </p>

        {error && <div className="wsauth__alert" role="alert"><Icon name="AlertCircle" size={15} /> {error}</div>}
        {expired && !error && (
          <div className="wsauth__alert" role="alert"><Icon name="AlertCircle" size={15} /> This verification code has expired. Please request a new code.</div>
        )}

        <form onSubmit={submit} noValidate>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '18px 0' }} onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
                value={d}
                disabled={sending || verifying}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                style={{ width: 40, height: 48, textAlign: 'center', fontSize: 18, fontFamily: 'var(--font-mono)', border: '1px solid var(--hr-line)', borderRadius: 'var(--hr-radius-sm)', background: 'var(--hr-bg)' }}
              />
            ))}
          </div>

          {!sending && expiresAt && !expired && (
            <p className="wsauth__foot" style={{ marginBottom: 14 }}>Code expires in {formatRemaining(expiresAt - now)}</p>
          )}

          <button type="submit" className="wsauth__submit" disabled={sending || verifying || code.length !== 6 || expired}>
            {verifying ? <><span className="wsauth__spinner" /> Verifying…</> : 'Verify OTP'}
          </button>

          <p className="wsauth__foot" style={{ marginTop: 14 }}>
            {resendWaitMs > 0 ? (
              `Resend code in ${Math.ceil(resendWaitMs / 1000)}s`
            ) : (
              <button
                type="button"
                onClick={requestCode}
                disabled={sending}
                style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Resend OTP
              </button>
            )}
          </p>
          <p className="wsauth__foot">
            Signed in as {profile?.email}.{' '}
            <button type="button" onClick={() => signOut()} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
              Sign out
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
