import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { callFn } from '../../api/client.js';

// Mirrors EmailSettingsCard's shape, but for connecting Microsoft so
// Schedule Interview can create a real Teams link instead of a mock one
// (see supabase/functions/_shared/meetingProviders.ts). Microsoft isn't a
// sign-in option in this app (staff use Google or a password), so this is
// its own standalone consent flow — see oauth-microsoft-authorize/callback.
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

  const box = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 24, marginTop: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };

  if (state.loading) return null;

  return (
    <section style={box} aria-label="Microsoft Teams settings">
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Microsoft Teams</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
        Connect your Microsoft account so Teams links generated when scheduling an interview are
        real, working meetings instead of a placeholder.
      </p>

      {state.connected ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px', color: '#166534', fontSize: 13.5 }}>
          <Icon name="CheckCircle2" size={16} />
          <span style={{ flex: '1 1 260px' }}><strong>Connected.</strong> Teams meetings are created on {state.email}.</span>
          <button type="button" onClick={connect} disabled={connecting} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #86EFAC', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {connecting ? 'Opening…' : 'Reconnect'}
          </button>
        </div>
      ) : (
        <button
          type="button" onClick={connect} disabled={connecting}
          style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: connecting ? '#93C5FD' : '#2563EB', color: '#fff', fontWeight: 700, cursor: connecting ? 'wait' : 'pointer' }}
        >
          {connecting ? 'Opening Microsoft…' : 'Connect Microsoft Teams'}
        </button>
      )}
    </section>
  );
}
