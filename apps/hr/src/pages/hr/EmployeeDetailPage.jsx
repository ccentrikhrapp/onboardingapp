import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listEmployeesWithTasks, listTasksForEmployee, listOnboardingEvents, updateOnboardingTask,
  listSuperAdmins, notifySuperAdmins, updateEmployeeDetails, uploadEmployeePhoto, getEmployeePhotoUrl,
} from '../../api/onboardingTasks.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const TASK_STATUS_META = {
  not_started: { label: 'Not started', tone: 'grey' },
  in_progress: { label: 'In progress', tone: 'blue' },
  blocked: { label: 'Blocked', tone: 'red' },
  completed: { label: 'Completed', tone: 'green' },
  not_required: { label: 'Not required', tone: 'grey' },
};
const OVERALL_META = {
  employee_created: { label: 'Employee created', tone: 'grey' },
  awaiting_accounts_it: { label: 'Awaiting Accounts/IT', tone: 'amber' },
  partially_completed: { label: 'Partially completed', tone: 'blue' },
  completed: { label: 'Onboarding completed', tone: 'green' },
  blocked: { label: 'Blocked / requires attention', tone: 'red' },
};
const DISTINCT_REQUEST_KEYS = ['email_setup', 'id_card_creation', 'laptop_allocation'];
const DISTINCT_REQUEST_META = {
  email_setup: { icon: 'Mail', note: 'Google Workspace or Microsoft 365 account.' },
  id_card_creation: { icon: 'CreditCard', note: 'Printed ID — name, Employee ID, designation, blood group, address, phone only.' },
  laptop_allocation: { icon: 'Laptop', note: 'Device + asset/serial number.' },
};

const resolved = (s) => s === 'completed' || s === 'not_required';
function deriveOverallStatus(tasks) {
  if (!tasks.length) return 'employee_created';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  const required = tasks.filter((t) => t.required);
  const byCategory = (cat) => required.filter((t) => t.category === cat);
  const isDone = (list) => list.length === 0 || list.every((t) => resolved(t.status));
  const accountsItDone = isDone(byCategory('accounts_it'));
  const arrangementsDone = isDone(byCategory('joining_arrangements'));
  if (accountsItDone && arrangementsDone) return 'completed';
  if (!accountsItDone && !arrangementsDone) return 'awaiting_accounts_it';
  return 'partially_completed';
}

const JOINING_FIELDS = [
  ['joiningDate', 'joining_date', 'Joining date', 'date'],
  ['department', 'department', 'Department', 'text'],
  ['designation', 'designation', 'Designation', 'text'],
  ['position', 'position', 'Position', 'text'],
  ['phone', 'phone', 'Phone', 'text'],
  ['bloodGroup', 'blood_group', 'Blood group', 'text'],
  ['officeLocation', 'office_location', 'Office location', 'text'],
];
const MANDATORY = ['joining_date', 'department', 'designation', 'phone', 'blood_group'];

export default function EmployeeDetailPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const [remote, setRemote] = useState({ loading: true, employees: [], tasks: [], events: [], admins: [] });
  const [busy, setBusy] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  const load = () => {
    Promise.all([listEmployeesWithTasks(), listTasksForEmployee(employeeId), listOnboardingEvents(employeeId), listSuperAdmins().catch(() => [])])
      .then(([employees, tasks, events, admins]) => setRemote({ loading: false, employees: employees || [], tasks: tasks || [], events: events || [], admins: admins || [] }))
      .catch((e) => { toast.error(e.message || 'Could not load this employee.'); setRemote((s) => ({ ...s, loading: false })); });
  };
  useEffect(load, [employeeId]);

  const employee = remote.employees.find((e) => e.id === employeeId);
  useEffect(() => {
    let cancelled = false;
    if (employee?.photo_path) getEmployeePhotoUrl(employee.photo_path).then((u) => !cancelled && setPhotoUrl(u));
    else setPhotoUrl(null);
    return () => { cancelled = true; };
  }, [employee?.photo_path]);

  const overall = deriveOverallStatus(remote.tasks);
  const missingMandatory = employee ? MANDATORY.filter((col) => !employee[col]) : [];

  const setTaskStatus = async (task, status) => {
    setBusy(task.id);
    try { await updateOnboardingTask(task.id, { status }); load(); }
    catch (e) { toast.error(e.message || 'Could not update this task.'); }
    finally { setBusy(null); }
  };

  if (remote.loading) return <SkeletonPage />;
  if (!employee) return <Card><p className="hr-cell-sub">Employee not found.</p></Card>;

  const distinctRequests = DISTINCT_REQUEST_KEYS.map((k) => remote.tasks.find((t) => t.key === k)).filter(Boolean);
  const otherAccountsIt = remote.tasks.filter((t) => t.category === 'accounts_it' && !DISTINCT_REQUEST_KEYS.includes(t.key));
  const arrangementTasks = remote.tasks.filter((t) => t.category === 'joining_arrangements');
  const superAdminEmails = remote.events.filter((e) => e.kind === 'notification' && e.remark?.startsWith('Super Admin request'));
  const canManage = role === 'admin' || role === 'hr';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <button className="hr-link" onClick={() => navigate('/hr/employees')}>
          <Icon name="ArrowLeft" size={14} /> Back to employees
        </button>
        {employee?.onboarding_case_id && (
          <button className="hr-link" onClick={() => navigate(`/hr/candidates/${employee.onboarding_case_id}`)}>
            View original recruitment record <Icon name="ChevronRight" size={14} />
          </button>
        )}
      </div>
      <HRHeader title={employee.full_name} subtitle={`${employee.employee_code} · ${employee.designation || '—'}${employee.department ? ` · ${employee.department}` : ''}`} />

      {/* ---------- Employee Overview + readiness summary ---------- */}
      <Card>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: 'var(--hr-bg-soft, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {photoUrl ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="UserRound" size={28} />}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 16 }}>{employee.full_name}</strong>
              <Tag tone={OVERALL_META[overall].tone}>{OVERALL_META[overall].label}</Tag>
            </div>
            <div className="hr-cell-sub" style={{ marginTop: 4 }}>
              Employee ID {employee.employee_code} · Joined {formatDate(employee.joining_date)} · Confirmed by {employee.created_by_name || '—'}
            </div>
          </div>
          {missingMandatory.length > 0 && (
            <div className="hr-note hr-note--warn" style={{ margin: 0 }}>
              <Icon name="AlertTriangle" size={14} />
              <span>{missingMandatory.length} required joining detail{missingMandatory.length > 1 ? 's' : ''} missing</span>
            </div>
          )}
        </div>
      </Card>
      <div style={{ height: 14 }} />

      <JoiningDetailsCard employee={employee} missingMandatory={missingMandatory} canManage={canManage} toast={toast} onSaved={load} />
      <div style={{ height: 14 }} />

      <AccountsItCard
        distinctRequests={distinctRequests} otherAccountsIt={otherAccountsIt} admins={remote.admins}
        superAdminEmails={superAdminEmails} employeeId={employeeId} canManage={canManage} busy={busy}
        setTaskStatus={setTaskStatus} toast={toast} onSent={load}
      />
      <div style={{ height: 14 }} />

      {arrangementTasks.length > 0 && (
        <>
          <Card title="Joining day checklist">
            <TaskList tasks={arrangementTasks} busy={busy} setTaskStatus={setTaskStatus} />
          </Card>
          <div style={{ height: 14 }} />
        </>
      )}

      <Card title="Activity history">
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

function TaskList({ tasks, busy, setTaskStatus }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.map((t) => {
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
              <select className="hr-input" style={{ width: 150 }} value={t.status} disabled={busy === t.id} onChange={(e) => setTaskStatus(t, e.target.value)}>
                {Object.entries(TASK_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JoiningDetailsCard({ employee, missingMandatory, canManage, toast, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const startEdit = () => {
    setForm({
      joiningDate: employee.joining_date ? String(employee.joining_date).slice(0, 10) : '',
      department: employee.department || '', designation: employee.designation || '', position: employee.position || '',
      phone: employee.phone || '', bloodGroup: employee.blood_group || '', officeLocation: employee.office_location || '',
      address: employee.address || {},
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateEmployeeDetails(employee.id, form);
      toast.success('Joining details saved.');
      setEditing(false);
      onSaved();
    } catch (e) { toast.error(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const onPhoto = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const path = await uploadEmployeePhoto(employee.id, file);
      await updateEmployeeDetails(employee.id, { photoPath: path });
      toast.success('Photo updated.');
      onSaved();
    } catch (e) { toast.error(e.message || 'Could not upload the photo.'); }
    finally { setUploadingPhoto(false); }
  };

  return (
    <Card title="Joining details" action={canManage && !editing && (
      <Button variant="ghost" icon="Pencil" onClick={startEdit}>{missingMandatory.length ? 'Complete details' : 'Edit'}</Button>
    )}>
      {!editing ? (
        <div className="hr-info">
          <Info label="Joining date" value={formatDate(employee.joining_date)} missing={missingMandatory.includes('joining_date')} />
          <Info label="Department" value={employee.department} missing={missingMandatory.includes('department')} />
          <Info label="Designation" value={employee.designation} missing={missingMandatory.includes('designation')} />
          <Info label="Position" value={employee.position} />
          <Info label="Phone" value={employee.phone} missing={missingMandatory.includes('phone')} />
          <Info label="Blood group" value={employee.blood_group} missing={missingMandatory.includes('blood_group')} />
          <Info label="Office location" value={employee.office_location} />
          <Info label="Address" value={employee.address ? [employee.address.line1, employee.address.city, employee.address.state, employee.address.pin].filter(Boolean).join(', ') : null} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>Photo</label>
            <input type="file" accept="image/*" disabled={uploadingPhoto} onChange={(e) => onPhoto(e.target.files?.[0])} />
            {uploadingPhoto && <span className="hr-cell-sub">Uploading…</span>}
          </div>
          <div className="hr-formgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {JOINING_FIELDS.map(([key, , label, type]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
                {label}
                <input className="hr-input" type={type} value={form[key] || ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)', marginBottom: 6 }}>Address</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {['line1', 'city', 'state', 'pin'].map((k) => (
                <input key={k} className="hr-input" placeholder={k === 'line1' ? 'Address line' : k[0].toUpperCase() + k.slice(1)}
                  value={form.address?.[k] || ''} onChange={(e) => setForm((f) => ({ ...f, address: { ...f.address, [k]: e.target.value } }))} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AccountsItCard({ distinctRequests, otherAccountsIt, admins, superAdminEmails, employeeId, canManage, busy, setTaskStatus, toast, onSent }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => [a.name, a.email, a.designation].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [admins, query]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async () => {
    if (!selected.length) { toast.error('Choose at least one Super Admin.'); return; }
    setSending(true);
    try {
      const res = await notifySuperAdmins(employeeId, selected);
      const failed = res.results.filter((r) => !r.sent);
      if (failed.length) toast.error(`Sent to ${res.results.length - failed.length} of ${res.results.length} — ${failed[0].error || 'one or more failed'}.`);
      else toast.success(`Account creation request sent to ${res.results.length} Super Admin${res.results.length > 1 ? 's' : ''}.`);
      setPickerOpen(false); setSelected([]); setQuery('');
      onSent();
    } catch (e) { toast.error(e.message || 'Could not send the request.'); }
    finally { setSending(false); }
  };

  return (
    <Card title="Account & IT requests">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
        {distinctRequests.map((t) => {
          const meta = TASK_STATUS_META[t.status];
          const dm = DISTINCT_REQUEST_META[t.key] || {};
          return (
            <div key={t.id} style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name={dm.icon || 'ListChecks'} size={16} />
                <strong style={{ fontSize: 13 }}>{t.label}</strong>
              </div>
              {dm.note && <div className="hr-cell-sub" style={{ marginBottom: 8 }}>{dm.note}</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Tag tone={meta.tone}>{meta.label}</Tag>
                <select className="hr-input" style={{ width: 130 }} value={t.status} disabled={busy === t.id} onChange={(e) => setTaskStatus(t, e.target.value)}>
                  {Object.entries(TASK_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
              </div>
              <div className="hr-cell-sub" style={{ marginTop: 6 }}>Request ID {t.id.slice(0, 8)} · Owner: {t.owner_role || '—'}{t.completed_at ? ` · Completed ${formatDate(t.completed_at)}` : ''}</div>
            </div>
          );
        })}
      </div>

      {otherAccountsIt.length > 0 && (
        <>
          <h4 className="hr-card__title" style={{ margin: '0 0 8px' }}>Other items</h4>
          <TaskList tasks={otherAccountsIt} busy={busy} setTaskStatus={setTaskStatus} />
          <div style={{ height: 14 }} />
        </>
      )}

      <h4 className="hr-card__title" style={{ margin: '0 0 8px' }}>Super Admin — organisational account creation request</h4>
      {superAdminEmails.length > 0 && (
        <div className="hr-stack" style={{ marginBottom: 10 }}>
          {superAdminEmails.map((e) => <div key={e.id} className="hr-cell-sub">{formatDateTime(e.created_at)} — {e.remark}</div>)}
        </div>
      )}
      {canManage && (
        pickerOpen ? (
          <div style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
            <input className="hr-input" placeholder="Search Super Admins by name, email or designation…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 10 }} />
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.length === 0 && <p className="hr-cell-sub">No matching Super Admin.</p>}
              {filtered.map((a) => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                  <div style={{ flex: 1 }}>
                    <div className="hr-cell-strong">{a.name}</div>
                    <div className="hr-cell-sub">{a.email}{a.mobile ? ` · ${a.mobile}` : ''}{a.designation ? ` · ${a.designation}` : ''} · {a.accountType}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button disabled={sending} onClick={send}>{sending ? 'Sending…' : `Send to ${selected.length || 0} selected`}</Button>
              <Button variant="ghost" disabled={sending} onClick={() => { setPickerOpen(false); setSelected([]); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" icon="Send" onClick={() => setPickerOpen(true)}>Select Super Admin & send request</Button>
        )
      )}
    </Card>
  );
}

function Info({ label, value, missing }) {
  return (
    <div className="hr-info__item">
      <span className="hr-info__label">{label}</span>
      <span className="hr-info__value" style={missing ? { color: 'var(--tag-red-fg)' } : undefined}>{value || (missing ? 'Missing' : '—')}</span>
    </div>
  );
}
