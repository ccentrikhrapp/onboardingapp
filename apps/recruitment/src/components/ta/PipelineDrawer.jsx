import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '../common/Modal.jsx';
import Icon from '../common/Icon.jsx';
import Button from './Button.jsx';
import Tag from './Tag.jsx';
import { Field, Input, Select, Textarea } from './Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listPipelineActivities, addPipelineActivity } from '../../api/pipeline.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { pipelineStatus, PIPELINE_STATUS_TONE, daysUntil, REMINDER_WINDOW_DAYS } from '../../utils/pipelineForm.js';
import { SkeletonLine } from '../common/States.jsx';

const ACTIVITY_TYPES = ['Note', 'Follow-up', 'Call', 'Email', 'Interview Discussion', 'Job Discussion', 'Candidate Update', 'Status Update', 'Other'];
const ICONS = {
  Added: 'UserPlus', Imported: 'UploadCloud', Note: 'StickyNote', 'Follow-up': 'CalendarClock', Call: 'Phone', Email: 'Mail',
  'Interview Discussion': 'MessagesSquare', 'Job Discussion': 'Briefcase', 'Candidate Update': 'UserRoundCog', 'Status Update': 'Flag', Other: 'Circle',
};
const TITLES = { Added: 'Candidate added to Pipeline', Imported: 'Candidate imported to Pipeline' };
const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'notes', label: 'Notes', match: (t) => t === 'Note' },
  { key: 'followups', label: 'Follow-ups', match: (t) => t === 'Follow-up' },
  { key: 'calls', label: 'Calls', match: (t) => t === 'Call' },
  { key: 'emails', label: 'Emails', match: (t) => t === 'Email' },
  { key: 'jobs', label: 'Job Discussions', match: (t) => t === 'Job Discussion' },
  { key: 'status', label: 'Status Updates', match: (t) => ['Status Update', 'Added', 'Imported'].includes(t) },
];

function Info({ label, children }) {
  return (
    <div className="ta-info__item">
      <span className="ta-info__label">{label}</span>
      <span className="ta-info__value">{children ?? '—'}</span>
    </div>
  );
}

function ActivityItem({ a }) {
  const [open, setOpen] = useState(false);
  const long = (a.note || '').length > 160;
  const when = formatDateTime(a.createdAt);
  return (
    <li>
      <span className="ta-timeline__dot" />
      <div>
        <div className="ta-cell-strong" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={ICONS[a.type] || 'Circle'} size={13} /> {TITLES[a.type] || a.type}
        </div>
        <div className="ta-cell-sub">{when} · {a.by}</div>
        {a.note && (
          <div className="ta-cell-sub" style={{ marginTop: 3, color: 'var(--ta-text-soft)', whiteSpace: 'pre-wrap' }}>
            {long && !open ? `${a.note.slice(0, 160)}…` : a.note}
            {long && <> <button className="ta-link" onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show more'}</button></>}
          </div>
        )}
        {a.followUpDate && <div className="ta-cell-sub">Follow up on {formatDate(a.followUpDate)}</div>}
      </div>
    </li>
  );
}

/* Wide side panel over the Pipeline Candidates page: details, availability,
   the candidate's activity timeline and the actions (move / edit / archive). */
export default function PipelineDrawer({ candidate: c, onClose, onEdit, onMove, onArchive, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [activities, setActivities] = useState(null);
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: 'Note', note: '', followUpDate: '' });
  const [saving, setSaving] = useState(false);

  const status = pipelineStatus(c);
  const due = status === 'Reminder Due';
  const days = daysUntil(c.expectedAvailability);

  const load = () => listPipelineActivities(c.id).then(setActivities).catch(() => setActivities([]));
  useEffect(() => { setActivities(null); setFilter('all'); setAdding(false); load(); /* eslint-disable-next-line */ }, [c.id]);

  const openAdd = () => {
    // Arriving from an availability reminder: the natural next entry is a follow-up.
    setForm({ type: due ? 'Follow-up' : 'Note', note: '', followUpDate: '' });
    setAdding(true);
  };

  const save = async () => {
    if (!form.note.trim()) { toast.error('Add a note for this activity.'); return; }
    setSaving(true);
    try {
      await addPipelineActivity(c.id, form);
      setAdding(false);
      await load();
      if (form.followUpDate) onChanged?.();
      toast.success('Activity saved.');
    } catch (err) {
      toast.error(err.message || 'Could not save the activity.');
    } finally {
      setSaving(false);
    }
  };

  const shown = (activities || []).filter((a) => FILTERS.find((f) => f.key === filter).match(a.type));

  return (
    <Drawer open onClose={onClose} title="Candidate Details" wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{c.name}</h2>
            <Tag tone={PIPELINE_STATUS_TONE[status]}>{status}</Tag>
          </div>
          <div className="ta-cell-sub">{c.position} · {c.organisation} · {c.code}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {c.status === 'active' && <Button icon="ArrowRightLeft" onClick={onMove}>Move to Job Candidate</Button>}
            {c.status !== 'moved' && <Button variant="ghost" icon="Pencil" onClick={onEdit}>Edit</Button>}
            {c.status !== 'moved' && (
              <Button variant="ghost" icon={c.status === 'archived' ? 'ArchiveRestore' : 'Archive'} onClick={onArchive}>
                {c.status === 'archived' ? 'Restore' : 'Archive'}
              </Button>
            )}
          </div>
        </div>

        {c.status === 'moved' && (
          <div className="ta-note ta-note--ok" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <strong>Moved to Job Candidate</strong>
            <span>Job: {c.movedJobTitle || '—'} · Moved on {formatDate(c.movedAt)} · By {c.movedByName || '—'}</span>
            {c.movedApplicationId && (
              <button className="ta-link" onClick={() => navigate(`/ta/candidates/${c.movedApplicationId}`)}>View Job Candidate</button>
            )}
          </div>
        )}

        {due && (
          <div className="ta-note ta-note--warn">
            <Icon name="BellRing" size={15} />
            <span>{days < 0 ? `Was expected to be available ${-days} day${-days === 1 ? '' : 's'} ago` : days === 0 ? 'Expected to be available today' : `Available in ${days} day${days === 1 ? '' : 's'}`} — a good time to follow up.</span>
          </div>
        )}

        <section>
          <h4 className="ta-card__title" style={{ margin: '0 0 8px' }}>Candidate Information</h4>
          <div className="ta-info" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            <Info label="Email">{c.email}</Info>
            <Info label="Phone">{c.phone}</Info>
            <Info label="Total Exp">{c.totalExp} yrs</Info>
            <Info label="Relevant Exp">{c.relevantExp} yrs</Info>
            <Info label="Current CTC">{c.currentCtc}</Info>
            <Info label="Expected CTC">{c.expectedCtc}</Info>
            <Info label="Offer in Hand">{c.offerInHand ? 'Yes' : 'No'}</Info>
            <Info label="Notice">{c.noticeDays} days</Info>
            <Info label="Current Location">{c.currentLocation}</Info>
            <Info label="Hiring Location">{c.hiringLocation}</Info>
            <Info label="Added by">{c.createdByName}</Info>
            <Info label="Created">{formatDate(c.createdAt)}</Info>
          </div>
        </section>

        <section>
          <h4 className="ta-card__title" style={{ margin: '0 0 8px' }}>Availability</h4>
          <div className="ta-info" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            <Info label="Expected Availability">{formatDate(c.expectedAvailability)}</Info>
            <Info label="Status">{status}</Info>
            <Info label="Next follow-up">{c.nextFollowUpDate ? formatDate(c.nextFollowUpDate) : 'None set'}</Info>
            <Info label="Reminder">{days <= REMINDER_WINDOW_DAYS && c.status === 'active' ? (c.reminderDismissedAt ? 'Dismissed' : 'Due') : 'Not yet due'}</Info>
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h4 className="ta-card__title" style={{ margin: 0 }}>Activity Timeline</h4>
            {!adding && <Button variant="ghost" icon="Plus" onClick={openAdd}>Add Activity</Button>}
          </div>

          {adding && (
            <div className="ta-note ta-note--info" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Activity Type">
                  <Select value={form.type} options={ACTIVITY_TYPES} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
                </Field>
                <Field label="Next follow-up date" hint="Optional">
                  <Input type="date" value={form.followUpDate} onChange={(e) => setForm((f) => ({ ...f, followUpDate: e.target.value }))} />
                </Field>
              </div>
              <Field label="Activity Note" required>
                <Textarea rows={3} placeholder="Add your note..." value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
              </Field>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Activity'}</Button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key} type="button"
                className={`ta-btn ta-btn--sm${filter === f.key ? '' : ' ta-btn--ghost'}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 6 }}>
            {activities === null ? (
              <SkeletonLine width="50%" />
            ) : shown.length === 0 ? (
              <div className="ta-cell-sub">No activity{filter === 'all' ? ' yet' : ' of this type'}.</div>
            ) : (
              <ol className="ta-timeline">{shown.map((a) => <ActivityItem key={a.id} a={a} />)}</ol>
            )}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
