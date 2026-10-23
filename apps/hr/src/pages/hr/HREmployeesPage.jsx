import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import Tag from '../../components/kit/Tag.jsx';
import { WorkListGroup, WorkListRow } from '../../components/kit/WorkList.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { listOnboardingCases } from '../../api/onboarding.js';
import { listEmployeesWithTasks } from '../../api/onboardingTasks.js';
import { formatDate } from '../../utils/format.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - Date.now()) / 86400000);
}

const resolved = (s) => s === 'completed' || s === 'not_required';
const READINESS_META = {
  employee_created: { label: 'Not started', tone: 'grey' },
  awaiting_accounts_it: { label: 'Awaiting Accounts/IT', tone: 'amber' },
  partially_completed: { label: 'In progress', tone: 'blue' },
  completed: { label: 'Ready', tone: 'green' },
  blocked: { label: 'Blocked', tone: 'red' },
};
// Same five-activity set EmployeeDetailPage/OnboardingTasksPage render —
// an employee hired before the workflow was simplified can still have task
// rows for a since-deactivated template (kept for history, never shown),
// which would otherwise leave their readiness permanently stuck on a item
// nobody can act on anymore.
const KEPT_KEYS = new Set(['email_setup', 'laptop_allocation', 'id_card_creation', 'welcome_kit', 'lunch_arrangement']);
function deriveReadiness(allTasks) {
  const tasks = allTasks.filter((t) => KEPT_KEYS.has(t.key));
  if (!tasks.length) return 'employee_created';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  const required = tasks.filter((t) => t.required);
  const isDone = (list) => list.length === 0 || list.every((t) => resolved(t.status));
  const accountsItDone = isDone(required.filter((t) => t.category === 'accounts_it'));
  const arrangementsDone = isDone(required.filter((t) => t.category === 'joining_arrangements'));
  if (accountsItDone && arrangementsDone) return 'completed';
  if (!accountsItDone && !arrangementsDone) return 'awaiting_accounts_it';
  return 'partially_completed';
}

export default function HREmployeesPage() {
  const navigate = useNavigate();
  const [remote, setRemote] = useState({ loading: true, employees: [], cases: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEmployeesWithTasks(), listOnboardingCases()])
      .then(([employees, cases]) => !cancelled && setRemote({ loading: false, employees: employees || [], cases: cases || [] }))
      .catch(() => !cancelled && setRemote({ loading: false, employees: [], cases: [] }));
    return () => { cancelled = true; };
  }, []);

  const employees = useMemo(() => remote.employees.map((e) => ({ ...e, readiness: deriveReadiness(e.onboarding_tasks || []) })), [remote.employees]);
  const { cases } = remote;
  const joiningPending = useMemo(
    () => cases.filter((c) => ['ready_for_joining', 'joining_confirmed'].includes(c.status)),
    [cases]
  );
  const joinedThisMonth = useMemo(() => {
    const now = new Date();
    return employees.filter((e) => {
      if (!e.joining_date) return false;
      const d = new Date(e.joining_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [employees]);
  const missingDetails = useMemo(
    () => employees.filter((e) => !e.joining_date || !e.department || !e.designation || !e.phone || !e.blood_group).length,
    [employees]
  );

  const view = useCollectionView(employees, {
    searchFields: ['full_name', 'employee_code', 'designation'],
    pageSize: 30,
    initialSort: { key: 'joining_date', dir: 'desc' },
  });

  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(), [employees]);
  const positions = useMemo(() => [...new Set(employees.map((e) => e.designation).filter(Boolean))].sort(), [employees]);

  const [dept, setDept] = useState('all');
  const [position, setPosition] = useState('all');
  const [readiness, setReadiness] = useState('all');

  const applyDept = (v) => { setDept(v); view.setFilter('department', v); };
  const applyPosition = (v) => { setPosition(v); view.setFilter('designation', v); };
  const applyReadiness = (v) => { setReadiness(v); view.setFilter('readiness', v); };

  const chips = [
    dept !== 'all' && { key: 'dept', label: dept, onRemove: () => applyDept('all') },
    position !== 'all' && { key: 'position', label: position, onRemove: () => applyPosition('all') },
    readiness !== 'all' && { key: 'readiness', label: READINESS_META[readiness]?.label || readiness, onRemove: () => applyReadiness('all') },
  ].filter(Boolean);

  if (remote.loading) return <SkeletonPage />;

  return (
    <>
      <HRHeader
        title="Employees"
        subtitle={`${employees.length} onboarded · ${joinedThisMonth} joined this month${missingDetails ? ` · ${missingDetails} missing joining details` : ''}`}
      />

      {joiningPending.length > 0 && (
        <div className="hr-upnext">
          <span className="hr-upnext__label"><Icon name="Rocket" size={13} /> Joining soon</span>
          <div className="hr-upnext__list">
            {joiningPending.map((c) => {
              const d = daysUntil(c.joining_date);
              return (
                <button key={c.id} type="button" className="hr-upnext__pill" onClick={() => navigate(`/hr/candidates/${c.id}`)}>
                  {c.candidate_name}
                  {d != null && <span className={`hr-upnext__days${d <= 7 ? ' is-soon' : ''}`}>{d <= 0 ? 'now' : `${d}d`}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Toolbar
        filters={[
          { label: 'Department', value: dept, onChange: applyDept, options: departments.map((d) => ({ value: d, label: d })) },
          { label: 'Position', value: position, onChange: applyPosition, options: positions.map((p) => ({ value: p, label: p })) },
          { label: 'Readiness', value: readiness, onChange: applyReadiness, options: Object.entries(READINESS_META).map(([v, m]) => ({ value: v, label: m.label })) },
        ]}
        chips={chips}
        onClearAll={chips.length > 0 ? () => { applyDept('all'); applyPosition('all'); applyReadiness('all'); } : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      <WorkListGroup
        title="Employees"
        count={view.total}
        empty="No employees onboarded yet — employees appear here once joining is confirmed from a candidate's page."
      >
        {view.rows.length > 0 && (
          <div className="hr-pipe">
            {view.rows.map((e) => (
              <WorkListRow
                key={e.id}
                onClick={() => navigate(`/hr/employees/${e.id}`)}
                lead={e.full_name}
                sub={`${e.designation || 'No position set'}${e.department ? ` · ${e.department}` : ''} · ${e.employee_code}`}
                tag={<Tag tone={READINESS_META[e.readiness].tone}>{READINESS_META[e.readiness].label}</Tag>}
                trail={(
                  <>
                    <span className="hr-cell-sub" style={{ whiteSpace: 'nowrap' }}><Icon name="CalendarCheck" size={13} /> {formatDate(e.joining_date)}</span>
                    <Icon name="ChevronRight" size={16} />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </WorkListGroup>
    </>
  );
}
