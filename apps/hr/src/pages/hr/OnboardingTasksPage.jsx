import { useEffect, useMemo, useState } from 'react';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import Icon from '../../components/common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listOnboardingTasks, updateOnboardingTask } from '../../api/onboardingTasks.js';
import { formatDate } from '../../utils/format.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const STATUS_META = {
  not_started: { label: 'Not started', tone: 'grey' },
  in_progress: { label: 'In progress', tone: 'blue' },
  blocked: { label: 'Blocked', tone: 'red' },
  completed: { label: 'Completed', tone: 'green' },
};
const CATEGORY_LABEL = { accounts_it: 'Accounts & IT', joining_arrangements: 'Joining arrangements' };
const STATUS_OPTIONS = Object.entries(STATUS_META);

/* "My Onboarding Tasks" — Accounts, IT and Office Administration land here
   (their only real page in this app). admin/hr see every task for
   oversight; everyone else sees only what's assigned to their own role. */
export default function OnboardingTasksPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, tasks: [] });
  const [filter, setFilter] = useState('open'); // open | completed | all
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // task id with the remarks/asset box open

  const load = () => {
    listOnboardingTasks()
      .then((tasks) => setState({ loading: false, tasks: tasks || [] }))
      .catch((e) => { toast.error(e.message || 'Could not load your tasks.'); setState({ loading: false, tasks: [] }); });
  };
  useEffect(load, []);

  const tasks = useMemo(() => {
    if (filter === 'open') return state.tasks.filter((t) => t.status !== 'completed');
    if (filter === 'completed') return state.tasks.filter((t) => t.status === 'completed');
    return state.tasks;
  }, [state.tasks, filter]);

  const setStatus = async (task, status) => {
    setBusy(task.id);
    try {
      await updateOnboardingTask(task.id, { status });
      toast.success(`Marked "${task.label}" ${STATUS_META[status].label.toLowerCase()}.`);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not update this task.');
    } finally {
      setBusy(null);
    }
  };

  const saveDetails = async (task, patch) => {
    setBusy(task.id);
    try {
      await updateOnboardingTask(task.id, patch);
      toast.success('Saved.');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  if (state.loading) return <SkeletonPage />;

  const counts = {
    open: state.tasks.filter((t) => t.status !== 'completed').length,
    completed: state.tasks.filter((t) => t.status === 'completed').length,
  };

  return (
    <>
      <HRHeader title="My onboarding tasks" subtitle="Items assigned to your team for new employees joining Ccentrik." />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['open', `Open (${counts.open})`], ['completed', `Completed (${counts.completed})`], ['all', 'All']].map(([v, label]) => (
          <button
            key={v} type="button" onClick={() => setFilter(v)}
            className="hr-btn hr-btn--sm"
            style={{ background: filter === v ? 'var(--hr-accent-wash, #eef2ff)' : undefined, fontWeight: filter === v ? 700 : 500 }}
          >
            {label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <Card><EmptyState icon="ClipboardCheck" title="Nothing here" message="No onboarding tasks match this filter." /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((t) => {
            const meta = STATUS_META[t.status] || STATUS_META.not_started;
            const emp = t.employees;
            return (
              <Card key={t.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{t.label}</strong>
                      {t.required && <span className="hr-cell-sub" style={{ color: 'var(--tag-red-fg)' }}>Required</span>}
                      <Tag tone="grey">{CATEGORY_LABEL[t.category] || t.category}</Tag>
                    </div>
                    <div className="hr-cell-sub" style={{ marginTop: 4 }}>
                      {emp?.full_name} ({emp?.employee_code}) — {emp?.designation || '—'}{emp?.department ? ` · ${emp.department}` : ''}
                      {emp?.joining_date ? ` · Joining ${formatDate(emp.joining_date)}` : ''}
                    </div>
                    {t.remarks && <div className="hr-cell-sub" style={{ marginTop: 4 }}>Note: {t.remarks}</div>}
                    {t.asset_identifier && <div className="hr-cell-sub" style={{ marginTop: 2 }}>Asset: {t.asset_identifier}</div>}
                    {t.unavailable && <div className="hr-cell-sub" style={{ marginTop: 2, color: 'var(--tag-amber-fg)' }}>Marked unavailable / needs clarification</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    <select
                      className="hr-input" style={{ width: 150 }} value={t.status} disabled={busy === t.id}
                      onChange={(e) => setStatus(t, e.target.value)}
                    >
                      {STATUS_OPTIONS.map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                    <Button variant="ghost" icon="Pencil" disabled={busy === t.id} onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      Details
                    </Button>
                  </div>
                </div>

                {editing === t.id && (
                  <TaskDetailForm task={t} busy={busy === t.id} onSave={(patch) => saveDetails(t, patch)} onCancel={() => setEditing(null)} />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function TaskDetailForm({ task, busy, onSave, onCancel }) {
  const [remarks, setRemarks] = useState(task.remarks || '');
  const [assetIdentifier, setAssetIdentifier] = useState(task.asset_identifier || '');
  const [unavailable, setUnavailable] = useState(!!task.unavailable);

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hr-line, #e5e7eb)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
        Asset identifier <span style={{ fontWeight: 400, color: 'var(--hr-text-mute)' }}>— e.g. laptop serial number, if relevant</span>
        <input className="hr-input" value={assetIdentifier} onChange={(e) => setAssetIdentifier(e.target.value)} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
        Remarks
        <textarea className="hr-input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>
      <label className="hr-check" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={unavailable} onChange={(e) => setUnavailable(e.target.checked)} />
        <span>This item is unavailable or needs clarification</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button disabled={busy} onClick={() => onSave({ remarks, assetIdentifier, unavailable })}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
