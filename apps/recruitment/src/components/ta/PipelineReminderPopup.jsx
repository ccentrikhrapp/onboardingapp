import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import Button from './Button.jsx';
import { checkPipelineReminders, dismissPipelineReminder } from '../../api/pipeline.js';
import { formatDate } from '../../utils/format.js';

/* Dashboard reminder for Pipeline Candidates entering their availability
   window (7 days before the expected availability date). Sits in a corner so
   it never blocks the page; each card is dismissible. The check also raises
   the one-time bell notification — see pipeline_check_reminders. */
export default function PipelineReminderPopup() {
  const navigate = useNavigate();
  const [due, setDue] = useState([]);

  useEffect(() => {
    let cancelled = false;
    checkPipelineReminders()
      .then((list) => { if (!cancelled) setDue(list); })
      .catch(() => { /* a failed reminder check must never get in the way of the dashboard */ });
    return () => { cancelled = true; };
  }, []);

  const dismiss = (id) => {
    setDue((d) => d.filter((c) => c.id !== id));
    dismissPipelineReminder(id).catch(() => {});
  };

  if (!due.length) return null;
  const shown = due.slice(0, 3);
  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 10, width: 340, maxWidth: 'calc(100vw - 40px)' }} aria-live="polite">
      {shown.map((c) => (
        <div key={c.id} className="ta-card" style={{ boxShadow: '0 10px 30px rgba(15,23,42,.18)', border: '1px solid var(--ta-line)' }}>
          <div className="ta-card__body" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="BellRing" size={15} />
              <strong style={{ fontSize: 13 }}>Pipeline Candidate Reminder</strong>
            </div>
            <div style={{ fontSize: 13 }}><strong>{c.name}</strong> is approaching availability.</div>
            <div className="ta-cell-sub" style={{ margin: '4px 0 10px' }}>
              Position: {c.position}<br />
              Notice Period: {c.noticeDays} days<br />
              Expected Availability: {formatDate(c.expectedAvailability)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => navigate(`/ta/pipeline?open=${c.id}`)}>View Candidate</Button>
              <Button variant="ghost" onClick={() => dismiss(c.id)}>Dismiss</Button>
            </div>
          </div>
        </div>
      ))}
      {due.length > shown.length && (
        <div className="ta-cell-sub" style={{ textAlign: 'right' }}>+{due.length - shown.length} more — <button className="ta-link" onClick={() => navigate('/ta/pipeline')}>open Pipeline Candidates</button></div>
      )}
    </div>
  );
}
