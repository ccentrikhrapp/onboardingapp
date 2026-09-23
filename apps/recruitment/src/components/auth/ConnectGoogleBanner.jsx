import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { SITE_URL } from '../../lib/supabase.js';
import { callFn } from '../../api/client.js';

const DISMISS_KEY = 'ccx_gconnect_dismissed';

/* Staff sign in with basic Google identity only. Sending email and creating
   Meet links needs extra Google permissions, asked for once, on purpose, here.
   `needCalendar` is true where interviews are scheduled (Talent Acquisition). */
export default function ConnectGoogleBanner({ needCalendar = false, settingsPath = '/' }) {
  const { connectGoogle } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // null = unknown yet
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const refresh = useCallback(() => {
    callFn('google-connection', { body: {} }).then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refresh();
    const onConnected = () => setTimeout(refresh, 800);
    window.addEventListener('ccx-google-connected', onConnected);
    return () => window.removeEventListener('ccx-google-connected', onConnected);
  }, [refresh]);

  // Email: the person's own App Password (Settings -> Email, like the CRM), or a connected
  // Google account, or a server-side company mailbox. Google is otherwise needed only for
  // Meet links (Talent Acquisition), which is a calendar permission.
  const emailOk = status && (status.mailSaved || status.connected || status.mailConfigured);
  const needsEmail = status && !emailOk;
  const needsMeet = status && emailOk && needCalendar && !status.calendar;
  if (!status || dismissed || (!needsEmail && !needsMeet)) return null;

  const connect = async () => {
    setBusy(true);
    setProblem('');
    const { error } = await connectGoogle(`${SITE_URL}${window.location.pathname}`);
    if (error) {
      setProblem("We couldn't open Google. Please try again.");
      setBusy(false);
    }
  };
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px', background: '#eef4ff', borderBottom: '1px solid #cfe0ff', color: '#1e3a8a', fontSize: 13 }}>
      <span style={{ flex: '1 1 320px' }}>
        {needsEmail
          ? <><strong>Set up your email</strong> so interview invitations, offers and other emails are sent from your own address. Add your Gmail App Password once in Settings.</>
          : <><strong>Connect your Google account</strong> so interview Meet links are created on your own calendar. You approve it once.</>}
        {problem && <span style={{ color: '#b91c1c' }}> {problem}</span>}
      </span>
      {needsEmail ? (
        <button type="button" onClick={() => navigate(settingsPath)} style={{ padding: '7px 14px', borderRadius: 8, border: 0, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Open Settings</button>
      ) : (
        <button type="button" onClick={connect} disabled={busy} style={{ padding: '7px 14px', borderRadius: 8, border: 0, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Opening Google…' : 'Connect Google'}
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 0, color: '#1e3a8a', cursor: 'pointer', fontSize: 13 }}>Later</button>
    </div>
  );
}
