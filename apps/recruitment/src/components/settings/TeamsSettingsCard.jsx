import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { callFn } from '../../api/client.js';

// Mirrors EmailSettingsCard's shape, but for connecting Microsoft so
// Schedule Interview can create a real Teams link instead of a mock one
// (see supabase/functions/_shared/meetingProviders.ts). Microsoft isn't a
// sign-in option in this app (staff use Google or a password), so this is
// its own standalone consent flow — see oauth-microsoft-authorize/callback.
// Compact single-row layout, matches GoogleWorkspaceCard.jsx.
export default function TeamsSettingsCard() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, connected: false, email: null });
  const [connecting, setConnecting] = useState(false);

  const refresh = () => {
    callFn('microsoft-connection', { body: {} })
      .then((d) => setState({ loading: false, connected: d.connected, email: d.email }))
      .catch(() => setState({ loading: false, connected: false, email: null }));
  };

  useEffect(() => {
    refresh();
    // The browser lands back here with ?teams_connected=1 or ?teams_error=...
    // after the Microsoft consent redirect round-trip (oauth-microsoft-callback).
    const params = new URLSearchParams(window.location.search);
    if (params.get('teams_connected')) {
      toast.success('Microsoft Teams connected. Interview links will now be real meetings.');
      refresh();
    } else if (params.get('teams_error')) {
      toast.error("Couldn't connect Microsoft Teams. Please try again.");
    }
    if (params.has('teams_connected') || params.has('teams_error')) {
      params.delete('teams_connected');
      params.delete('teams_error');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await callFn('oauth-microsoft-authorize', { body: {} });
      window.location.href = url;
    } catch (err) {
      toast.error(err.message || "Couldn't open Microsoft sign-in. Please try again.");
      setConnecting(false);
    }
  };

  const card = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginTop: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' };
  const logo = { width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#FAFAFA' };
  const pillOn = { fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: 100 };
  const pillOff = { fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 100 };

  if (state.loading) return null;

  return (
    <section style={card} aria-label="Microsoft Teams settings">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={logo}>
          <svg width="15" height="15" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Microsoft Teams</span>
            <span style={state.connected ? pillOn : pillOff}>{state.connected ? 'Connected' : 'Not connected'}</span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
            {state.connected ? state.email : 'Real Teams links for interviews'}
          </p>
        </div>

        <button
          onClick={connect} disabled={connecting}
          style={state.connected
            ? { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, background: '#EFF6FF', border: '1px solid #BFDBFE', cursor: connecting ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, color: '#2563EB', fontFamily: 'inherit', whiteSpace: 'nowrap' }
            : { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, background: '#5B21B6', border: 'none', cursor: connecting ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, color: '#fff', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          {state.connected ? <Icon name="RefreshCw" size={12} /> : <Link2 size={12} />}
          {connecting ? '…' : state.connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    </section>
  );
}
