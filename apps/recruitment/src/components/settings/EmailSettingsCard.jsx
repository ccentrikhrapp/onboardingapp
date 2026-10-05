import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { callFn } from '../../api/client.js';
import { SkeletonBlock } from '../common/States.jsx';

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
  const box = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 24, marginTop: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };
  const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' };
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 10, fontSize: 14 };

  if (state.loading) return <SkeletonBlock lines={3} />;

  return (
    <section style={box} aria-label="Email settings">
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Email Settings</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
        Emails you trigger here — interview invitations, offers, document requests, team invitations — are sent
        {' '}<strong>from your own email</strong> ({profile?.email}). Enter your Gmail App Password once to enable this.
      </p>

      {state.saved && !replacing && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px', color: '#166534', fontSize: 13.5 }}>
          <Icon name="CheckCircle2" size={16} />
          <span style={{ flex: '1 1 260px' }}><strong>Connected.</strong> Your emails are sent from {profile?.email}.</span>
          <button type="button" onClick={() => { setReplacing(true); setError(''); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #86EFAC', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Replace</button>
          <button type="button" onClick={remove} disabled={busy} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#B91C1C', cursor: 'pointer', fontWeight: 600 }}>Remove</button>
        </div>
      )}

      {showForm && !state.loading && (
        <form onSubmit={save} noValidate>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderLeft: '4px solid #3B82F6', borderRadius: 8, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#1E40AF', lineHeight: 1.65 }}>
            <strong>How to get your App Password:</strong><br />
            1. Go to <strong>myaccount.google.com</strong> → Security → turn on <strong>2-Step Verification</strong><br />
            2. Open <strong>App passwords</strong> → Create → name it "Ccentrik"<br />
            3. Copy the 16-character code and paste it below.
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={label} htmlFor="mail-user">Your email</label>
            <input id="mail-user" style={{ ...input, background: '#F3F4F6', color: '#6b7280' }} value={profile?.email || ''} disabled readOnly />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={label} htmlFor="mail-pass">Gmail App Password <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                id="mail-pass" type={show ? 'text' : 'password'} value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx"
                style={{ ...input, paddingRight: 42, fontFamily: 'monospace', letterSpacing: '0.12em', borderColor: error ? '#EF4444' : '#D1D5DB' }}
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: '#6b7280' }}>
                <Icon name={show ? 'EyeOff' : 'Eye'} size={16} />
              </button>
            </div>
            {error
              ? <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#B91C1C' }}>{error}</p>
              : <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>Stored encrypted. Used only to send the emails you trigger from your own account. We send you a test email first.</p>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" disabled={busy || !password.trim()}
              style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: busy || !password.trim() ? '#93C5FD' : '#2563EB', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Sending test email…' : 'Save & send test email'}
            </button>
            {replacing && <button type="button" onClick={() => { setReplacing(false); setPassword(''); setError(''); }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}
