import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import Icon from '../../components/common/Icon.jsx';
import { listActivity, listOnboardingCases } from '../../api/onboarding.js';
import { listAllOnboardingDocuments } from '../../api/onboardingDocuments.js';
import { listVerifications } from '../../api/verification.js';
import { listOnboardingTasks } from '../../api/onboardingTasks.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const WHEN = {
  today: { label: 'Today', days: 1 },
  week: { label: 'Last 7 days', days: 7 },
  month: { label: 'Last 30 days', days: 30 },
};

const CATEGORY_LABEL = {
  account_requests: 'Account requests',
  documents: 'Documents',
  onboarding_tasks: 'Onboarding tasks',
  hr_actions: 'HR actions',
};
// "Pending" for a request/task means genuinely not done yet — not_started,
// in_progress or blocked all still need someone's attention; only
// completed/not_required are resolved.
const PENDING_TASK_STATUS = new Set(['not_started', 'in_progress', 'blocked']);

/* Which of the four feed categories an audit_logs row belongs to. Account
   requests and other onboarding tasks share the same entity_type
   ('onboarding_task' for a manual status edit, 'employee' for the request
   email itself) — the only thing that tells them apart is which checklist
   item it's actually about, so this looks that up via the onboarding_tasks
   this page already loads rather than adding a new column anywhere. */
function categoryOf(entry, taskById) {
  if (entry.entity_type === 'onboarding_document' || entry.entity_type === 'document_verification') return 'documents';
  if (entry.entity_type === 'onboarding_task') {
    const task = taskById.get(entry.entity_id);
    return task?.key === 'email_setup' ? 'account_requests' : 'onboarding_tasks';
  }
  if (entry.entity_type === 'employee') {
    if (entry.action === 'onboarding.super_admin_notified') return 'account_requests';
    if (entry.action === 'onboarding.laptop_allocation_notified' || entry.action === 'onboarding.id_card_creation_notified') return 'onboarding_tasks';
  }
  return 'hr_actions';
}

/* Pick an icon + colour from the action string, so the feed reads at a glance. */
function eventMeta(action = '') {
  const t = action.toLowerCase();
  if (t.includes('reject')) return { icon: 'XCircle', tone: 'red' };
  if (t.includes('reupload') || t.includes('revision')) return { icon: 'RotateCcw', tone: 'amber' };
  if (t.includes('approve') || t.includes('verify') || t.includes('verified')) return { icon: 'CheckCircle2', tone: 'green' };
  if (t.includes('notified') || t.includes('request')) return { icon: 'Send', tone: 'blue' };
  if (t.includes('document')) return { icon: 'Files', tone: 'teal' };
  if (t.includes('onboarding_task') || t.includes('initialized')) return { icon: 'ListChecks', tone: 'violet' };
  return { icon: 'CircleDot', tone: 'grey' };
}

function dayBucket(dateStr) {
  const start = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((start(Date.now()) - start(dateStr)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const shortTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();

export default function HRActivityPage() {
  const navigate = useNavigate();
  const [remote, setRemote] = useState({ loading: true, logs: [], docs: [], cases: [], verifications: [], tasks: [] });
  const [type, setType] = useState('all');
  const [when, setWhen] = useState('all');
  const [actor, setActor] = useState('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listActivity(), listAllOnboardingDocuments(), listOnboardingCases(), listVerifications(), listOnboardingTasks()])
      .then(([logs, docs, cases, verifications, tasks]) => {
        if (!cancelled) setRemote({ loading: false, logs: logs || [], docs: docs || [], cases: cases || [], verifications: verifications || [], tasks: tasks || [] });
      })
      .catch(() => !cancelled && setRemote({ loading: false, logs: [], docs: [], cases: [], verifications: [], tasks: [] }));
    return () => { cancelled = true; };
  }, []);

  const { logs, docs, cases, verifications, tasks } = remote;

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Every employee this page knows about, read off the tasks' own joined
  // employee record — avoids a second query just to resolve a name.
  const employeeById = useMemo(() => {
    const m = new Map();
    tasks.forEach((t) => { if (t.employees?.id) m.set(t.employees.id, t.employees); });
    return m;
  }, [tasks]);

  // Resolve each log entry to an employee/candidate name, a feed category,
  // and a place to click through to.
  const all = useMemo(() => {
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const docToCase = new Map(docs.map((d) => [d.id, d.onboarding_case_id]));
    const verById = new Map(verifications.map((v) => [v.id, v]));
    return logs.map((l) => {
      let candidate = '';
      let linkCaseId = null;
      let linkApplicationId = null;
      let linkEmployeeId = null;
      if (l.entity_type === 'onboarding_case') {
        linkCaseId = l.entity_id;
        candidate = caseById.get(l.entity_id)?.candidate_name || '';
      } else if (l.entity_type === 'onboarding_document') {
        linkCaseId = docToCase.get(l.entity_id) || null;
        candidate = linkCaseId ? caseById.get(linkCaseId)?.candidate_name || '' : '';
      } else if (l.entity_type === 'document_verification') {
        const v = verById.get(l.entity_id);
        linkApplicationId = v?.source_application_id || null;
        candidate = v?.candidate_name || '';
      } else if (l.entity_type === 'onboarding_task') {
        const task = taskById.get(l.entity_id);
        linkEmployeeId = task?.employee_id || null;
        candidate = task?.employees?.full_name || '';
      } else if (l.entity_type === 'employee') {
        linkEmployeeId = l.entity_id;
        candidate = employeeById.get(l.entity_id)?.full_name || '';
      }
      return { ...l, candidate, linkCaseId, linkApplicationId, linkEmployeeId, category: categoryOf(l, taskById) };
    });
  }, [logs, cases, docs, verifications, taskById, employeeById]);

  const categories = useMemo(() => [...new Set(all.map((a) => a.category))], [all]);
  const actors = useMemo(() => [...new Set(all.map((a) => a.actor_label).filter(Boolean))].sort(), [all]);

  const items = useMemo(
    () => all.filter((a) => {
      if (type !== 'all' && a.category !== type) return false;
      if (actor !== 'all' && a.actor_label !== actor) return false;
      if (when !== 'all' && new Date(a.created_at).getTime() < Date.now() - WHEN[when].days * 86400000) return false;
      return true;
    }),
    [all, type, actor, when]
  );

  const groups = useMemo(() => {
    const out = [];
    items.forEach((it) => {
      const key = dayBucket(it.created_at);
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; out.push(g); }
      g.items.push(it);
    });
    return out;
  }, [items]);

  const last7 = useMemo(() => all.filter((a) => new Date(a.created_at).getTime() >= Date.now() - 7 * 86400000).length, [all]);
  // These two counts come straight from the live tables, not from parsing
  // the event log — so "pending" always means the requirement's actual
  // current status, never a historical count of how many events happened.
  const pendingAccountRequests = useMemo(() => tasks.filter((t) => t.key === 'email_setup' && PENDING_TASK_STATUS.has(t.status)).length, [tasks]);
  const pendingDocuments = useMemo(() => docs.filter((d) => d.status === 'uploaded').length, [docs]);

  const clearAll = () => { setType('all'); setWhen('all'); setActor('all'); };
  const toggleType = (value) => setType((v) => (v === value ? 'all' : value));
  const toggleWeek = () => setWhen((v) => (v === 'week' ? 'all' : 'week'));

  const stats = [
    { icon: 'Activity', accent: 'blue', label: 'Events this week', value: last7, active: when === 'week', onClick: toggleWeek },
    { icon: 'FileSearch', accent: 'amber', label: 'Total logged', value: all.length, active: type === 'all' && when === 'all' && actor === 'all', onClick: clearAll },
    { icon: 'UserPlus', accent: 'green', label: 'Pending account requests', value: pendingAccountRequests, active: type === 'account_requests', onClick: () => toggleType('account_requests') },
    { icon: 'FileCheck', accent: 'violet', label: 'Pending documents', value: pendingDocuments, active: type === 'documents', onClick: () => toggleType('documents') },
  ];

  const chips = [
    type !== 'all' && { key: 'type', label: CATEGORY_LABEL[type] || cap(type.replace(/_/g, ' ')), onRemove: () => setType('all') },
    when !== 'all' && { key: 'when', label: WHEN[when].label, onRemove: () => setWhen('all') },
    actor !== 'all' && { key: 'actor', label: actor, onRemove: () => setActor('all') },
  ].filter(Boolean);

  const open = (it) => {
    if (it.linkCaseId) navigate(`/hr/candidates/${it.linkCaseId}`);
    else if (it.linkApplicationId) navigate(`/hr/applications/${it.linkApplicationId}`);
    else if (it.linkEmployeeId) navigate(`/hr/employees/${it.linkEmployeeId}`);
  };

  if (remote.loading) return <SkeletonPage />;

  return (
    <>
      <HRHeader title="Activity" subtitle="All HR actions, account requests, document updates and onboarding tasks in one place." />

      <StatBar items={stats} />

      <Toolbar
        filters={[
          { label: 'Type', value: type, onChange: setType, options: categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] || cap(c.replace(/_/g, ' ')) })) },
          { label: 'When', value: when, onChange: setWhen, options: Object.entries(WHEN).map(([value, w]) => ({ value, label: w.label })) },
          { label: 'Person', value: actor, onChange: setActor, options: actors.map((p) => ({ value: p, label: p })) },
        ]}
        chips={chips}
        onClearAll={chips.length ? clearAll : undefined}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="History"
            title="No activity found"
            message={type !== 'all' || when !== 'all' || actor !== 'all' ? 'Try changing your filters or check again when new activity is recorded.' : 'Nothing has been recorded yet.'}
          />
        </Card>
      ) : (
        <Card>
          {groups.map((g) => (
            <div className="act-day" key={g.key}>
              <div className="act-day__label">{g.key}<span className="act-day__count">{g.items.length}</span></div>
              <div className="act-feed">
                {g.items.map((it) => {
                  const m = eventMeta(it.action);
                  const clickable = !!(it.linkCaseId || it.linkApplicationId || it.linkEmployeeId);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`act-feed__item${clickable ? ' act-feed__item--link' : ''}`}
                      onClick={clickable ? () => open(it) : undefined}
                      disabled={!clickable}
                    >
                      <span className={`act-feed__icon act-feed__icon--${m.tone}`}><Icon name={m.icon} size={15} /></span>
                      <div className="act-feed__body">
                        <div className="act-feed__head">
                          <span className="act-feed__title">
                            {cap(it.action.replace(/[._]/g, ' '))}
                            {it.candidate && <span className="act-feed__cand"> · {it.candidate}</span>}
                          </span>
                          <span className="act-feed__when">{shortTime(it.created_at)}</span>
                        </div>
                        <div className="act-feed__desc">
                          {it.remarks}
                          {it.actor_label && <span className="act-feed__actor"> · by {it.actor_label}</span>}
                        </div>
                      </div>
                      {clickable && <Icon name="ChevronRight" size={16} className="act-feed__go" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
