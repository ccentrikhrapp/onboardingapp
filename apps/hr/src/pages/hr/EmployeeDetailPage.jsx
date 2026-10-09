import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import {
  listEmployeesWithTasks, listTasksForEmployee, listOnboardingEvents, updateOnboardingTask,
  listSuperAdmins, notifySuperAdmin, notifyAccountsIt, updateEmployeeDetails, uploadEmployeePhoto, getEmployeePhotoUrl,
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

  // Exactly five activities (Section 7): three Accounts/IT-or-Super-Admin
  // email requests, plus Welcome Kit and Lunch below. Any other task key an
  // older employee record might still have (from a template since
  // deactivated) is simply never rendered here — its history stays in the
  // database, nothing is deleted, it just isn't one of the five anymore.
  const emailTask = (key) => remote.tasks.find((t) => t.key === key);
  const superAdminTask = emailTask('email_setup');
  const laptopTask = emailTask('laptop_allocation');
  const idCardTask = emailTask('id_card_creation');
  const welcomeKitTask = emailTask('welcome_kit');
  const lunchTask = emailTask('lunch_arrangement');
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

      {superAdminTask && (
        <>
          <SuperAdminRequestCard
            task={superAdminTask} employee={employee} admins={remote.admins} superAdminEmails={superAdminEmails}
            employeeId={employeeId} canManage={canManage} toast={toast} onSent={load}
          />
          <div style={{ height: 14 }} />
        </>
      )}

      <AccountsItRequestsCard
        laptopTask={laptopTask} idCardTask={idCardTask} employeeId={employeeId} canManage={canManage}
        busy={busy} setTaskStatus={setTaskStatus} toast={toast} onSent={load}
      />
      <div style={{ height: 14 }} />

      {(welcomeKitTask || lunchTask) && (
        <>
          <Card title="Welcome kit & lunch">
            <SimpleStatusRow task={welcomeKitTask} label="Welcome kit" busy={busy} setTaskStatus={setTaskStatus} />
            <SimpleStatusRow task={lunchTask} label="Lunch arrangement" busy={busy} setTaskStatus={setTaskStatus} last />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>Photo</label>
            <input type="file" accept="image/*" disabled={uploadingPhoto} onChange={(e) => onPhoto(e.target.files?.[0])} />
            {uploadingPhoto && <span className="hr-cell-sub">Uploading…</span>}
          </div>
          <div className="hr-formgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '18px 20px' }}>
            {JOINING_FIELDS.map(([key, , label, type]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
                {label}
                <input className="hr-input" type={type} value={form[key] || ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)', marginBottom: 8 }}>Address</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 16px' }}>
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

/* Section 1 — organisational Gmail/Microsoft Teams account creation. Three
   employee fields only, prepopulated but editable; a single-admin dropdown
   (not the old multi-select checklist); a confirmation step before the
   email actually goes out. Status moves to In Progress automatically once
   that email sends (handled server-side in notify-super-admin) — never
   just because the button was clicked. */
function SuperAdminRequestCard({ task, employee, admins, superAdminEmails, employeeId, canManage, toast, onSent }) {
  const [stage, setStage] = useState('idle'); // idle | form | confirm
  const [fields, setFields] = useState({ name: '', mobile: '', designation: '' });
  const [adminId, setAdminId] = useState('');
  const [sending, setSending] = useState(false);

  if (!task) return null;
  const meta = TASK_STATUS_META[task.status];
  const lastSent = superAdminEmails[0];
  const selectedAdmin = admins.find((a) => a.id === adminId);

  const openForm = () => {
    setFields({ name: employee.full_name || '', mobile: employee.phone || '', designation: employee.designation || '' });
    setAdminId('');
    setStage('form');
  };
  const reviewAndSend = () => {
    if (!fields.name.trim() || !fields.mobile.trim() || !fields.designation.trim()) { toast.error('Name, mobile number and designation are all required.'); return; }
    if (!adminId) { toast.error('Choose which Super Admin should receive this request.'); return; }
    setStage('confirm');
  };
  const confirmSend = async () => {
    setSending(true);
    try {
      const res = await notifySuperAdmin(employeeId, adminId, fields);
      const sent = res.results.some((r) => r.sent);
      if (sent) toast.success(`Account creation request sent to ${selectedAdmin?.name || 'the Super Admin'}.`);
      else toast.error(res.results[0]?.error || 'Could not send the request. You can try again.');
      setStage('idle');
      onSent();
    } catch (e) { toast.error(e.message || 'Could not send the request.'); }
    finally { setSending(false); }
  };

  return (
    <Card title="Organisational account creation" action={<Tag tone={meta.tone}>{meta.label}</Tag>}>
      <p className="hr-cell-sub" style={{ margin: '0 0 12px' }}>Google Workspace or Microsoft Teams account — sent to a Super Admin, who creates it and marks this request Completed once it's ready.</p>
      {lastSent && <div className="hr-cell-sub" style={{ marginBottom: 12 }}>Last sent {formatDateTime(lastSent.created_at)} — {lastSent.remark}</div>}

      {stage === 'idle' && canManage && (
        <Button variant="ghost" icon="Send" onClick={openForm}>{lastSent ? 'Send another request' : 'Send account creation request'}</Button>
      )}

      {stage === 'form' && (
        <div style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
          <div className="hr-formgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '18px 20px' }}>
            <FieldInput label="Name" value={fields.name} onChange={(v) => setFields((f) => ({ ...f, name: v }))} />
            <FieldInput label="Mobile number" value={fields.mobile} onChange={(v) => setFields((f) => ({ ...f, mobile: v }))} />
            <FieldInput label="Designation" value={fields.designation} onChange={(v) => setFields((f) => ({ ...f, designation: v }))} />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
            Send to
            <select className="hr-input" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              <option value="">Select a Super Admin…</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.email}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={reviewAndSend}>Review &amp; send</Button>
            <Button variant="ghost" onClick={() => setStage('idle')}>Cancel</Button>
          </div>
        </div>
      )}

      <Modal open={stage === 'confirm'} onClose={() => !sending && setStage('idle')} title="Confirm account creation request">
        <div className="hr-info" style={{ marginBottom: 16 }}>
          <Info label="Name" value={fields.name} />
          <Info label="Mobile number" value={fields.mobile} />
          <Info label="Designation" value={fields.designation} />
          <Info label="Request type" value="Organisational Gmail / Microsoft Teams account creation" />
          <Info label="Sending to" value={selectedAdmin ? `${selectedAdmin.name} (${selectedAdmin.email})` : '—'} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button disabled={sending} onClick={confirmSend}>{sending ? 'Sending…' : 'Confirm & send'}</Button>
          <Button variant="ghost" disabled={sending} onClick={() => setStage('form')}>Back</Button>
        </div>
      </Modal>
    </Card>
  );
}

function FieldInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--hr-text-soft)' }}>
      {label}
      <input className="hr-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* Sections 2 & 3 — Laptop allocation and ID card creation, both plain
   one-click requests to the Accounts/IT team (no recipient picker: it
   always goes to the whole team, not someone HR chooses). Each tile is
   otherwise independent — its own status, its own send history. */
function AccountsItRequestsCard({ laptopTask, idCardTask, employeeId, canManage, busy, setTaskStatus, toast, onSent }) {
  const tiles = [
    laptopTask && { task: laptopTask, requestType: 'laptop_allocation', icon: 'Laptop', note: 'Device + asset/serial number, once allocated.' },
    idCardTask && { task: idCardTask, requestType: 'id_card_creation', icon: 'CreditCard', note: 'Uses the employee’s name, Employee ID, designation, photo, blood group, address and phone.' },
  ].filter(Boolean);

  if (!tiles.length) return null;

  return (
    <Card title="Account & IT requests">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {tiles.map(({ task, requestType, icon, note }) => (
          <AccountsItTile
            key={task.id} task={task} requestType={requestType} icon={icon} note={note}
            employeeId={employeeId} canManage={canManage} busy={busy} setTaskStatus={setTaskStatus} toast={toast} onSent={onSent}
          />
        ))}
      </div>
    </Card>
  );
}

function AccountsItTile({ task, requestType, icon, note, employeeId, canManage, busy, setTaskStatus, toast, onSent }) {
  const [sending, setSending] = useState(false);
  const meta = TASK_STATUS_META[task.status];
  const alreadySent = task.status !== 'not_started';

  const send = async () => {
    setSending(true);
    try {
      const res = await notifyAccountsIt(employeeId, requestType, alreadySent);
      const sent = res.results.some((r) => r.sent);
      if (sent) toast.success('Request sent to the Accounts/IT team.');
      else toast.error(res.results[0]?.error || 'Could not send the request. You can try again.');
      onSent();
    } catch (e) { toast.error(e.message || 'Could not send the request.'); }
    finally { setSending(false); }
  };

  return (
    <div style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} />
        <strong style={{ fontSize: 13 }}>{task.label}</strong>
      </div>
      <div className="hr-cell-sub">{note}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Tag tone={meta.tone}>{meta.label}</Tag>
        <select className="hr-input" style={{ width: 130 }} value={task.status} disabled={busy === task.id} onChange={(e) => setTaskStatus(task, e.target.value)}>
          {Object.entries(TASK_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
      </div>
      {task.completed_at && <div className="hr-cell-sub">Completed {formatDate(task.completed_at)}</div>}
      {canManage && (
        <Button variant="ghost" icon="Send" disabled={sending} onClick={send}>
          {sending ? 'Sending…' : alreadySent ? 'Resend request' : 'Send request to Accounts/IT'}
        </Button>
      )}
    </div>
  );
}

/* Sections 4 & 5 — Welcome Kit and Lunch, each just a Completed /
   Not Completed dropdown HR sets by hand. No email, no extra fields. */
function SimpleStatusRow({ task, label, busy, setTaskStatus, last }) {
  if (!task) return null;
  const completed = task.status === 'completed';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--hr-line, #eef0f3)' }}>
      <span className="hr-cell-strong">{label}</span>
      <select
        className="hr-input" style={{ width: 150 }} disabled={busy === task.id}
        value={completed ? 'completed' : 'not_started'}
        onChange={(e) => setTaskStatus(task, e.target.value)}
      >
        <option value="not_started">Not Completed</option>
        <option value="completed">Completed</option>
      </select>
    </div>
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
