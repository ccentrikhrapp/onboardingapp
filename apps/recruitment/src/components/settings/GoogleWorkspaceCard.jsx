import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import Icon from '../common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { callFn } from '../../api/client.js';

// Same restriction as ConnectGoogleBanner.jsx — these two accounts are
// password-only (see AuthContext); Google can never actually be connected
// for them, so this never offers a button that can't work.
const PASSWORD_ONLY_EMAILS = ['sarthak.tyagi@ccentrik.com', 'sachin.chaudhary@ccentrik.com'];

/* Compact, single-row settings card — wired to this app's own, already
   -working connectGoogle() (AuthContext) and google-connection status check.
   No new backend behavior: a TA who connects here gets exactly the same
   gmail.send + calendar.events grant ConnectGoogleBanner already asks for. */
export default function GoogleWorkspaceCard() {
  const { connectGoogle, profile } = useAuth();
  const [status, setStatus] = useState({ loading: true, connected: false });
  const [connecting, setConnecting] = useState(false);

  const refresh = () => {
    callFn('google-connection', { body: {} })
      .then((d) => setStatus({ loading: false, connected: d.connected }))
      .catch(() => setStatus({ loading: false, connected: false }));
  };
  useEffect(refresh, []);

  const passwordOnly = profile?.email && PASSWORD_ONLY_EMAILS.includes(profile.email.toLowerCase());

  // Nothing here can actually work for a password-only account — Email
  // Settings (App Password) already covers everything it's able to do for
  // them, so showing a second, contradictory "Connected" card is just noise.
  if (passwordOnly) return null;

  const connect = async () => {
    setConnecting(true);
    const { error } = await connectGoogle(`${window.location.origin}${window.location.pathname}`);
    if (error) setConnecting(false);
  };

  const card = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginTop: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' };
  const logo = { width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#FAFAFA' };
  const pillOn = { fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: 100 };
  const pillOff = { fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 100 };

  if (status.loading) return null;

  return (
    <section style={card} aria-label="Google Workspace settings">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={logo}>
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Google Workspace</span>
            <span style={status.connected ? pillOn : pillOff}>{status.connected ? 'Connected' : 'Not connected'}</span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
            {status.connected ? profile?.email : 'Real Meet links + sending from your Gmail'}
          </p>
        </div>

        <button
          onClick={connect} disabled={connecting}
          style={status.connected
            ? { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, background: '#EFF6FF', border: '1px solid #BFDBFE', cursor: connecting ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, color: '#2563EB', fontFamily: 'inherit', whiteSpace: 'nowrap' }
            : { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, background: '#2563EB', border: 'none', cursor: connecting ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, color: '#fff', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          {status.connected ? <Icon name="RefreshCw" size={12} /> : <Link2 size={12} />}
          {connecting ? '…' : status.connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    </section>
  );
}
