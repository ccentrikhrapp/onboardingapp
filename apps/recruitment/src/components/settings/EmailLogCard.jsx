import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { SkeletonBlock } from '../common/States.jsx';
import { listEmailLog } from '../../api/emailLog.js';

const STATUS_META = {
  sent: { label: 'Sent', bg: '#DCFCE7', fg: '#166534', icon: 'CheckCircle2' },
  queued: { label: 'Queued', bg: '#FEF3C7', fg: '#92400E', icon: 'Clock' },
  failed: { label: 'Failed', bg: '#FEE2E2', fg: '#B91C1C', icon: 'XCircle' },
};
const FILTERS = [['all', 'All'], ['failed', 'Failed'], ['queued', 'Queued'], ['sent', 'Sent']];

const when = (d) => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/* Settings -> Email delivery log. Every email the system queues (interview
   invites, offers, document requests, HR's candidate/TA notifications — all
   of it, this app and HR's integration calls alike) already gets a real
   status and error written to the `emails` table. Nothing ever showed that
   to a person, so a failed send was invisible unless someone queried the
   database directly. This is that missing surface. */
export default function EmailLogCard() {
  const [status, setStatus] = useState('all');
  const [state, setState] = useState({ loading: true, emails: [], failedCount: 0 });
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    listEmailLog(status)
      .then((d) => !cancelled && setState({ loading: false, emails: d.emails || [], failedCount: d.failedCount || 0 }))
      .catch((e) => !cancelled && (setErr(e.message || 'Could not load the email log.'), setState({ loading: false, emails: [], failedCount: 0 })));
    return () => { cancelled = true; };
  }, [status]);

  const box = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 24, marginTop: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' };

  return (
    <section style={box} aria-label="Email delivery log">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Email delivery log</h3>
        {state.failedCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', borderRadius: 999, padding: '3px 10px' }}>
            <Icon name="AlertTriangle" size={13} /> {state.failedCount} failed
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
        Every email the system has queued — interview invites, offers, document requests, and HR's own
        candidate/TA notifications. A failed send shows its error here instead of failing silently.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(([v, label]) => (
          <button
            key={v} type="button" onClick={() => setStatus(v)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: status === v ? '1px solid #2563EB' : '1px solid #D1D5DB',
              background: status === v ? '#EFF6FF' : '#fff', color: status === v ? '#1D4ED8' : '#374151',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {err && <p role="alert" style={{ color: '#B91C1C', fontSize: 13, marginBottom: 12 }}>{err}</p>}

      {state.loading ? (
        <SkeletonBlock lines={4} />
      ) : state.emails.length === 0 ? (
        <p style={{ fontSize: 13.5, color: '#6b7280', padding: '16px 0' }}>No emails match this filter.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {state.emails.map((e) => {
            const m = STATUS_META[e.status] || { label: e.status, bg: '#F3F4F6', fg: '#374151', icon: 'Mail' };
            return (
              <div key={e.id} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: m.fg, background: m.bg, borderRadius: 999, padding: '2px 9px' }}>
                    <Icon name={m.icon} size={11} /> {m.label}
                  </span>
                  <strong style={{ fontSize: 13, flex: '1 1 200px', minWidth: 0 }}>{e.subject || '(no subject)'}</strong>
                  <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>{when(e.created_at)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4 }}>
                  To {e.recipient} {e.template ? `· ${e.template}` : ''}
                </div>
                {e.status === 'failed' && e.error && (
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 6, background: '#FEF2F2', borderRadius: 8, padding: '6px 10px' }}>
                    {e.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
