import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import DataGrid from '../../components/kit/DataGrid.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Card from '../../components/kit/Card.jsx';
import Button from '../../components/kit/Button.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { listEmployeesWithTasks, listTasksForEmployee, listOnboardingEvents, updateOnboardingTask } from '../../api/onboardingTasks.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const CATEGORY_LABEL = { accounts_it: 'Accounts & IT', joining_arrangements: 'Joining arrangements' };
const TASK_STATUS_META = {
  not_started: { label: 'Not started', tone: 'grey' },
  in_progress: { label: 'In progress', tone: 'blue' },
  blocked: { label: 'Blocked', tone: 'red' },
  completed: { label: 'Completed', tone: 'green' },
};
const OVERALL_META = {
  employee_created: { label: 'Employee created', tone: 'grey' },
  awaiting_accounts_it: { label: 'Awaiting Accounts/IT', tone: 'amber' },
  awaiting_joining_arrangements: { label: 'Awaiting joining arrangements', tone: 'amber' },
  partially_completed: { label: 'Partially completed', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  blocked: { label: 'Blocked / requires attention', tone: 'red' },
};

/* Computed fresh from the actual task rows every time — never a stored
   flag. "Completed" means every REQUIRED task in both checklists is
   actually done, not that the employee record exists or an email went
   out. */
function deriveOverallStatus(tasks) {
  if (!tasks.length) return 'employee_created';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  const required = tasks.filter((t) => t.required);
  const byCategory = (cat) => required.filter((t) => t.category === cat);
  const isDone = (list) => list.length === 0 || list.every((t) => t.status === 'completed');
  const accountsItDone = isDone(byCategory('accounts_it'));
  const arrangementsDone = isDone(byCategory('joining_arrangements'));
  if (accountsItDone && arrangementsDone) return 'completed';
  if (!accountsItDone && !arrangementsDone) return 'awaiting_accounts_it';
  if (!accountsItDone) return 'partially_completed';
  return 'awaiting_joining_arrangements';
}
function categoryStatus(tasks, category) {
  const list = tasks.filter((t) => t.category === category && t.required);
  if (!list.length) return null;
  if (list.some((t) => t.status === 'blocked')) return 'blocked';
  if (list.every((t) => t.status === 'completed')) return 'completed';
  if (list.some((t) => t.status !== 'not_started')) return 'in_progress';
  return 'not_started';
}

export default function EmployeeOnboardingPage() {
  const { employeeId } = useParams();
  return employeeId ? <DetailView employeeId={employeeId} /> : <ListView />;
}

function ListView() {
  const navigate = useNavigate();
  const [remote, setRemote] = useState({ loading: true, employees: [] });

  useEffect(() => {
    let cancelled = false;
    listEmployeesWithTasks()
      .then((employees) => !cancelled && setRemote({ loading: false, employees: employees || [] }))
      .catch(() => !cancelled && setRemote({ loading: false, employees: [] }));
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => remote.employees.map((e) => {
    const tasks = e.onboarding_tasks || [];
    const overall = deriveOverallStatus(tasks);
    const lastUpdated = tasks.length ? tasks.reduce((latest, t) => (!latest || t.updated_at > latest ? t.updated_at : latest), e.updated_at) : e.updated_at;
    return { ...e, tasks, overall, accountsItStatus: categoryStatus(tasks, 'accounts_it'), arrangementsStatus: categoryStatus(tasks, 'joining_arrangements'), lastUpdated };
  }), [remote.employees]);

  const now = Date.now();
  const stats = useMemo(() => {
    const thirtyDaysAgo = now - 30 * 86400000;
    return {
      newlyJoined: rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= thirtyDaysAgo).length,
      pendingAccountsIt: rows.filter((r) => r.accountsItStatus && r.accountsItStatus !== 'completed').length,
      pendingArrangements: rows.filter((r) => r.arrangementsStatus && r.arrangementsStatus !== 'completed').length,
      completed: rows.filter((r) => r.overall === 'completed').length,
      overdue: rows.filter((r) => r.tasks.some((t) => t.due_date && t.status !== 'completed' && new Date(t.due_date).getTime() < now)).length,
      blocked: rows.filter((r) => r.overall === 'blocked').length,
    };
  }, [rows, now]);

  const view = useCollectionView(rows, {
    searchFields: ['full_name', 'employee_code', 'designation', 'department'],
    pageSize: 25,
    initialSort: { key: 'created_at', dir: 'desc' },
  });

  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]);
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const applyDept = (v) => { setDept(v); view.setFilter('department', v); };
  const applyStatus = (v) => { setStatus(v); view.setFilter('overall', v); };
  const chips = [
    dept !== 'all' && { key: 'dept', label: dept, onRemove: () => applyDept('all') },
    status !== 'all' && { key: 'status', label: OVERALL_META[status]?.label || status, onRemove: () => applyStatus('all') },
  ].filter(Boolean);

  if (remote.loading) return <SkeletonPage />;

  return (
    <>
      <HRHeader title="Employee onboarding" subtitle="Everything that happens after an employee record is created — Accounts/IT, joining arrangements, and HR's own tracking." />

      <StatBar items={[
        { icon: 'UserRoundCheck', accent: 'blue', label: 'Newly joined (30d)', value: stats.newlyJoined },
        { icon: 'ListChecks', accent: 'amber', label: 'Pending Accounts/IT', value: stats.pendingAccountsIt },
        { icon: 'Building2', accent: 'amber', label: 'Pending arrangements', value: stats.pendingArrangements },
        { icon: 'CheckCircle2', accent: 'green', label: 'Completed', value: stats.completed },
        { icon: 'AlertTriangle', accent: 'red', label: 'Overdue tasks', value: stats.overdue },
        { icon: 'AlertCircle', accent: 'red', label: 'Blocked', value: stats.blocked },
      ]} />

      <Toolbar
        filters={[
          { label: 'Department', value: dept, onChange: applyDept, options: departments.map((d) => ({ value: d, label: d })) },
          { label: 'Status', value: status, onChange: applyStatus, options: Object.entries(OVERALL_META).map(([v, m]) => ({ value: v, label: m.label })) },
        ]}
        chips={chips}
        onClearAll={chips.length > 0 ? () => { applyDept('all'); applyStatus('all'); } : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      <DataGrid
        columns={[
          { key: 'full_name', label: 'Employee', sortable: true },
          { key: 'employee_code', label: 'Employee ID', sortable: true },
          { key: 'designation', label: 'Designation', sortable: true },
          { key: 'department', label: 'Department', sortable: true },
          { key: 'joining_date', label: 'Joining date', sortable: true },
          { key: 'created_by_name', label: 'HR owner', sortable: true },
          { key: 'accountsIt', label: 'Accounts/IT' },
          { key: 'arrangements', label: 'Arrangements' },
          { key: 'overall', label: 'Overall status', sortable: true },
          { key: 'lastUpdated', label: 'Last updated', sortable: true },
          { key: 'actions', label: '' },
        ]}
        rows={view.rows}
        sort={view.sort}
        onSort={view.onSort}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
        empty={{ icon: 'ListChecks', title: 'No employees yet', message: 'This fills in once HR confirms a candidate\'s joining and creates their employee record.' }}
        renderRow={(r) => (
          <tr key={r.id} onClick={() => navigate(`/hr/employee-onboarding/${r.id}`)} style={{ cursor: 'pointer' }}>
            <td><span className="hr-cell-strong">{r.full_name}</span></td>
            <td className="hr-cell-mute">{r.employee_code}</td>
            <td>{r.designation || '—'}</td>
            <td>{r.department || '—'}</td>
            <td className="hr-cell-mute">{formatDate(r.joining_date)}</td>
            <td className="hr-cell-mute">{r.created_by_name || '—'}</td>
            <td>{r.accountsItStatus ? <Tag tone={TASK_STATUS_META[r.accountsItStatus].tone}>{TASK_STATUS_META[r.accountsItStatus].label}</Tag> : <span className="hr-cell-mute">—</span>}</td>
            <td>{r.arrangementsStatus ? <Tag tone={TASK_STATUS_META[r.arrangementsStatus].tone}>{TASK_STATUS_META[r.arrangementsStatus].label}</Tag> : <span className="hr-cell-mute">—</span>}</td>
            <td><Tag tone={OVERALL_META[r.overall].tone}>{OVERALL_META[r.overall].label}</Tag></td>
            <td className="hr-cell-mute">{formatDateTime(r.lastUpdated)}</td>
            <td><Icon name="ChevronRight" size={17} /></td>
          </tr>
        )}
      />
    </>
  );
}

function DetailView({ employeeId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [remote, setRemote] = useState({ loading: true, employees: [], tasks: [], events: [] });
  const [busy, setBusy] = useState(null);

  const load = () => {
    Promise.all([listEmployeesWithTasks(), listTasksForEmployee(employeeId), listOnboardingEvents(employeeId)])
      .then(([employees, tasks, events]) => setRemote({ loading: false, employees: employees || [], tasks: tasks || [], events: events || [] }))
      .catch((e) => { toast.error(e.message || 'Could not load this employee.'); setRemote((s) => ({ ...s, loading: false })); });
  };
  useEffect(load, [employeeId]);

  const employee = remote.employees.find((e) => e.id === employeeId);
  const overall = deriveOverallStatus(remote.tasks);

  const setTaskStatus = async (task, status) => {
    setBusy(task.id);
    try { await updateOnboardingTask(task.id, { status }); load(); }
    catch (e) { toast.error(e.message || 'Could not update this task.'); }
    finally { setBusy(null); }
  };

  if (remote.loading) return <SkeletonPage />;
  if (!employee) return <Card><p className="hr-cell-sub">Employee not found.</p></Card>;

  const groups = ['accounts_it', 'joining_arrangements'];

  return (
    <>
      <button className="hr-link" onClick={() => navigate('/hr/employee-onboarding')} style={{ marginBottom: 10 }}>
        <Icon name="ArrowLeft" size={14} /> Back to employee onboarding
      </button>

      <HRHeader title={employee.full_name} subtitle={`${employee.employee_code} · ${employee.designation || '—'}${employee.department ? ` · ${employee.department}` : ''}`} />
      <div style={{ marginBottom: 10 }}><Tag tone={OVERALL_META[overall].tone}>{OVERALL_META[overall].label}</Tag></div>

      <Card title="Joining details">
        <div className="hr-info">
          <Info label="Employee ID" value={employee.employee_code} />
          <Info label="Joining date" value={formatDate(employee.joining_date)} />
          <Info label="Office location" value={employee.office_location} />
          <Info label="Confirmed by (HR)" value={employee.created_by_name} />
          <Info label="Confirmed at" value={formatDateTime(employee.created_at)} />
        </div>
      </Card>
      <div style={{ height: 14 }} />

      {groups.map((cat) => {
        const items = remote.tasks.filter((t) => t.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <Card title={CATEGORY_LABEL[cat]}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((t) => {
                  const meta = TASK_STATUS_META[t.status];
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--hr-line, #eef0f3)' }}>
                      <div>
                        <div className="hr-cell-strong">{t.label}{t.required && <span style={{ color: 'var(--tag-red-fg)' }}> *</span>}</div>
                        {t.remarks && <div className="hr-cell-sub">{t.remarks}</div>}
                        {t.asset_identifier && <div className="hr-cell-sub">Asset: {t.asset_identifier}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                        <select className="hr-input" style={{ width: 140 }} value={t.status} disabled={busy === t.id} onChange={(e) => setTaskStatus(t, e.target.value)}>
                          {Object.entries(TASK_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <div style={{ height: 14 }} />
          </div>
        );
      })}

      <Card title="Activity timeline">
        <div className="hr-stack" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {remote.events.length === 0 && <p className="hr-cell-sub">No activity recorded yet.</p>}
          {remote.events.map((e) => (
            <div key={e.id} className="hr-cell-sub">
              <strong>{formatDateTime(e.created_at)}</strong> · {e.actor_label || 'System'} · {e.kind}{e.remark ? ` — ${e.remark}` : ''}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="hr-info__item">
      <span className="hr-info__label">{label}</span>
      <span className="hr-info__value">{value || '—'}</span>
    </div>
  );
}
