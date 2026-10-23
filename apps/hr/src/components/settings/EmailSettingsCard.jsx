import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { callFn } from '../../api/client.js';
import { SkeletonBlock } from '../kit/Skeleton.jsx';

/* Settings -> Email. Same idea as the CRM's "Meeting Email Settings": save your Gmail
   App Password once, and the emails you trigger (interview invites, offers, document
   requests, team invitations) are sent from YOUR own address. The password is verified
   with a real test email before it is stored, is kept encrypted on the server, and is
   never sent back to the browser — this screen only ever knows "saved or not". */
export default function EmailSettingsCard() {
  const { profile } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, saved: false });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    callFn('mail-settings', { body: { action: 'get' } })
      .then((d) => setState({ loading: false, saved: d.saved }))
      .catch(() => setState({ loading: false, saved: false }));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError('');
    try {
      await callFn('mail-settings', { body: { action: 'save', password } });
      setPassword('');
      setReplacing(false);
      setState({ loading: false, saved: true });
      toast.success(`Email connected — we sent a test email to ${profile?.email}. Your emails now go out from your own account.`);
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await callFn('mail-settings', { body: { action: 'remove' } });
      setState({ loading: false, saved: false });
      toast.success('App Password removed.');
    } catch {
      toast.error('Could not remove it. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const showForm = !state.saved || replacing;
  const box = { background: 'var(--hr-surface)', border: '1px solid var(--hr-line)', borderRadius: 'var(--hr-radius)', padding: 24, marginTop: 16 };
  const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--hr-text-soft)' };
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--hr-line)', borderRadius: 'var(--hr-radius-sm)', fontSize: 14, background: 'var(--hr-surface)', color: 'var(--hr-text)' };

  if (state.loading) return <SkeletonBlock lines={3} />;

  return (
    <section style={box} aria-label="Email settings">
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>Email Settings</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--hr-text-soft)', lineHeight: 1.6 }}>
        Emails you trigger here — interview invitations, offers, document requests, team invitations — are sent
        {' '}<strong>from your own email</strong> ({profile?.email}). Enter your Gmail App Password once to enable this.
      </p>

      {state.saved && !replacing && (
        <div role="status" className="hr-note hr-note--ok" style={{ flexWrap: 'wrap' }}>
          <Icon name="CheckCircle2" size={16} />
          <span style={{ flex: '1 1 260px' }}><strong>Connected.</strong> Your emails are sent from {profile?.email}.</span>
          <button type="button" className="hr-btn hr-btn--ghost" onClick={() => { setReplacing(true); setError(''); }}>Replace</button>
          <button type="button" className="hr-btn hr-btn--danger" onClick={remove} disabled={busy}>Remove</button>
        </div>
      )}

      {showForm && !state.loading && (
        <form onSubmit={save} noValidate>
          <div className="hr-note hr-note--info" style={{ marginBottom: 18, flexDirection: 'column', lineHeight: 1.65 }}>
            <strong>How to get your App Password:</strong>
            1. Go to <strong>myaccount.google.com</strong> → Security → turn on <strong>2-Step Verification</strong>
            2. Open <strong>App passwords</strong> → Create → name it "Ccentrik"
            3. Copy the 16-character code and paste it below.
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={label} htmlFor="mail-user">Your email</label>
            <input id="mail-user" style={{ ...input, background: 'var(--hr-bg)', color: 'var(--hr-text-soft)' }} value={profile?.email || ''} disabled readOnly />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={label} htmlFor="mail-pass">Gmail App Password <span style={{ color: 'var(--tag-red-fg)' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                id="mail-pass" type={show ? 'text' : 'password'} value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx"
                style={{ ...input, paddingRight: 42, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', borderColor: error ? 'var(--tag-red-fg)' : 'var(--hr-line)' }}
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'var(--hr-text-soft)' }}>
                <Icon name={show ? 'EyeOff' : 'Eye'} size={16} />
              </button>
            </div>
            {error
              ? <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--tag-red-fg)' }}>{error}</p>
              : <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--hr-text-mute)' }}>Stored encrypted. Used only to send the emails you trigger from your own account. We send you a test email first.</p>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={busy || !password.trim()}>
              {busy ? 'Sending test email…' : 'Save & send test email'}
            </button>
            {replacing && <button type="button" className="hr-btn hr-btn--ghost" onClick={() => { setReplacing(false); setPassword(''); setError(''); }}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}
