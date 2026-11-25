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
  const box = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginTop: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' };
  const label = { display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: '#374151' };
  const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13.5 };
  const pillOn = { fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: 100 };

  if (state.loading) return <SkeletonBlock lines={2} />;

  return (
    <section style={box} aria-label="Email settings">
      {state.saved && !replacing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#FAFAFA' }}>
            <Icon name="Mail" size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Email Settings</span>
              <span style={pillOn}>Connected</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{profile?.email}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => { setReplacing(true); setError(''); }}
              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Replace
            </button>
            <button type="button" onClick={remove} disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #FCA5A5', background: '#fff', color: '#B91C1C', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Email Settings</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>— sends as {profile?.email}</span>
          </div>
          <form onSubmit={save} noValidate>
            <div style={{ marginBottom: 6 }}>
              <label style={label} htmlFor="mail-pass">Gmail App Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="mail-pass" type={show ? 'text' : 'password'} value={password} autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx"
                  style={{ ...input, paddingRight: 38, fontFamily: 'monospace', letterSpacing: '0.1em', borderColor: error ? '#EF4444' : '#D1D5DB' }}
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: '#6b7280' }}>
                  <Icon name={show ? 'EyeOff' : 'Eye'} size={14} />
                </button>
              </div>
              {error
                ? <p role="alert" style={{ margin: '5px 0 0', fontSize: 12, color: '#B91C1C' }}>{error}</p>
                : <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#9CA3AF' }}>myaccount.google.com → Security → App passwords</p>}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="submit" disabled={busy || !password.trim()}
                style={{ padding: '7px 14px', borderRadius: 7, border: 0, background: busy || !password.trim() ? '#93C5FD' : '#2563EB', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              {replacing && <button type="button" onClick={() => { setReplacing(false); setPassword(''); setError(''); }}
                style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>
                Cancel
              </button>}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
