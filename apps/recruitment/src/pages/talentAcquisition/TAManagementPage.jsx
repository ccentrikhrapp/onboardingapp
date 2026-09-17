import { useEffect, useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import DataGrid from '../../components/ta/DataGrid.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import { Field, FieldGrid, Input, Select } from '../../components/ta/Field.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import CommonButton from '../../components/common/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { listTAUsers, taWorkloadCounts, inviteTA, setTARole, setTAActive } from '../../api/staff.js';
import { emailError, nameError } from '../../utils/validation.js';
import { formatDate } from '../../utils/format.js';

const ROLE_LABEL = { ta: 'Talent Acquisition', admin_ta: 'Admin TA', hr: 'HR', admin: 'Super Admin' };
const ROLE_TONE = { ta: 'blue', admin_ta: 'violet', hr: 'teal', admin: 'green' };
const INVITE_ROLES = [
  { value: 'ta', label: 'Talent Acquisition' },
  { value: 'admin_ta', label: 'Admin TA' },
  { value: 'hr', label: 'HR' },
];
const CHANGE_ROLE_OPTIONS = [...INVITE_ROLES, { value: 'admin', label: 'Super Admin' }];

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'workload', label: 'Assigned applications' },
  { key: 'created', label: 'Created' },
  { key: 'actions', label: 'Actions' },
];

/* Super Admin only (see RoleRoute on the /ta/team route + TASidebar's Team
   link). Reuses the existing staff_invites + Supabase invite-email mechanism
   end to end (see supabase/functions/invite-ta) rather than a parallel
   account system — see role_hierarchy migration for the full rationale. */
export default function TAManagementPage() {
  const toast = useToast();
  const { profile } = useApp();
  const [rows, setRows] = useState(null);
  const [workload, setWorkload] = useState({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'ta' });
  const [formErrors, setFormErrors] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    Promise.all([listTAUsers(), taWorkloadCounts()])
      .then(([users, counts]) => {
        setRows(users);
        setWorkload(counts);
      })
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  const submitInvite = async () => {
    const e = {};
    const n = nameError(form.fullName, { required: true, label: 'full name' });
    if (n) e.fullName = n;
    const em = emailError(form.email, { required: true });
    if (em) e.email = em;
    setFormErrors(e);
    if (Object.keys(e).length) return;

    setInviting(true);
    try {
      await inviteTA(form);
      toast.success(`Invitation sent to ${form.email}.`);
      setInviteOpen(false);
      setForm({ fullName: '', email: '', role: 'ta' });
      load();
    } catch (err) {
      toast.error(err.message || 'Could not send the invitation.');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (user, role) => {
    if (role === user.role) return;
    const ok = window.confirm(`Change ${user.full_name || user.email}'s role to ${ROLE_LABEL[role]}?`);
    if (!ok) return;
    setBusyId(user.id);
    try {
      await setTARole(user.id, role);
      toast.success(`${user.full_name || user.email} is now ${ROLE_LABEL[role]}.`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not change this user\'s role.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user) => {
    const next = !user.active;
    const ok = window.confirm(`${next ? 'Activate' : 'Deactivate'} ${user.full_name || user.email}?`);
    if (!ok) return;
    setBusyId(user.id);
    try {
      await setTAActive(user.id, next);
      toast.success(`${user.full_name || user.email} ${next ? 'activated' : 'deactivated'}.`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not update this user.');
    } finally {
      setBusyId(null);
    }
  };

  const tableRows = (rows || []).map((u) => ({ ...u }));

  return (
    <>
      <TAHeader title="Team" subtitle="Manage Talent Acquisition, Admin TA and HR accounts." />

      <DataGrid
        columns={COLUMNS}
        rows={tableRows}
        title={`${tableRows.length} user${tableRows.length === 1 ? '' : 's'}`}
        action={<Button icon="UserPlus" onClick={() => setInviteOpen(true)}>Invite user</Button>}
        empty={{ icon: 'Users', title: 'No team members yet', message: 'Invite your first TA, Admin TA or HR user.' }}
        renderRow={(u) => (
          <tr key={u.id}>
            <td>
              <span className="ta-cell-strong">{u.full_name || '—'}</span><br />
              <span className="ta-cell-sub">{u.email}</span>
            </td>
            <td><Tag tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role] || u.role}</Tag></td>
            <td><Tag tone={u.active ? 'green' : 'grey'}>{u.active ? 'Active' : 'Deactivated'}</Tag></td>
            <td className="ta-cell-mute">{u.role === 'ta' ? (workload[u.id] || 0) : '—'}</td>
            <td className="ta-cell-mute">{formatDate(u.created_at)}</td>
            <td>
              <span className="ta-rowactions">
                <select
                  className="ta-select"
                  value={u.role}
                  disabled={busyId === u.id || u.id === profile?.id}
                  onChange={(e) => changeRole(u, e.target.value)}
                  aria-label={`Change role for ${u.full_name || u.email}`}
                >
                  {CHANGE_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  className="ta-iconbtn"
                  disabled={busyId === u.id || u.id === profile?.id}
                  onClick={() => toggleActive(u)}
                  aria-label={u.active ? 'Deactivate' : 'Activate'}
                  title={u.id === profile?.id ? "You can't deactivate your own account" : u.active ? 'Deactivate' : 'Activate'}
                >
                  <Icon name={u.active ? 'UserX' : 'UserCheck'} size={16} />
                </button>
              </span>
            </td>
          </tr>
        )}
      />

      <Modal
        open={inviteOpen}
        onClose={() => !inviting && setInviteOpen(false)}
        title="Invite a team member"
        footer={
          <>
            <CommonButton variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</CommonButton>
            <CommonButton onClick={submitInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send invitation'}</CommonButton>
          </>
        }
      >
        <FieldGrid>
          <Field label="Full name" required full error={formErrors.fullName}>
            <Input value={form.fullName} error={formErrors.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          </Field>
          <Field label="Email address" required full error={formErrors.email}>
            <Input type="email" value={form.email} error={formErrors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Role" required full>
            <Select value={form.role} options={INVITE_ROLES} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </Field>
        </FieldGrid>
        <p className="ta-cell-sub" style={{ marginTop: 4 }}>
          They'll receive an email with a secure link to set up their account and sign in.
        </p>
      </Modal>
    </>
  );
}
