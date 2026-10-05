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
import { taWorkloadCounts } from '../../api/staff.js';
import { listTeam, inviteMember, resendInvitation, setMemberRole, setMemberActive, deleteMember, updateMemberDetails } from '../../api/team.js';
import { emailError, nameError } from '../../utils/validation.js';
import { formatDate } from '../../utils/format.js';

// Optional, international formats allowed (+91 98765 43210) — mirrors team-invite.
const phoneProblem = (p) => {
  const v = p.trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[0-9 ()-]+$/.test(v) && digits >= 7 && digits <= 15 ? '' : 'Enter a valid phone number.';
};

const ROLE_LABEL = { admin: 'Super Admin', admin_ta: 'Talent Acquisition Head', ta: 'Talent Acquisition' };
const ROLE_TONE = { admin: 'green', admin_ta: 'violet', ta: 'blue' };
const INVITATION_TONE = { pending: 'amber', accepted: 'blue', active: 'green', expired: 'red', disabled: 'grey' };
const INVITATION_LABEL = { pending: 'Pending', accepted: 'Accepted', active: 'Active', expired: 'Expired', disabled: 'Disabled' };
const ACCOUNT_TONE = { ACTIVE: 'green', INVITED: 'amber', DISABLED: 'grey' };
const ACCOUNT_LABEL = { ACTIVE: 'Active', INVITED: 'Invited', DISABLED: 'Disabled' };

const COLUMNS = [
  { key: 'name', label: 'Name / Email' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Account status' },
  { key: 'invitation', label: 'Invitation' },
  { key: 'login', label: 'Last login' },
  { key: 'workload', label: 'Assigned' },
  { key: 'actions', label: 'Actions' },
];

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/* Teams — Super Admin and Talent Acquisition Head. What each may do is
   decided by the team-* edge functions (the UI below only mirrors it so
   people aren't offered buttons that would be refused): a Super Admin
   manages everyone, a Talent Acquisition Head can invite / resend / disable
   Talent Acquisition users only. */
export default function TAManagementPage() {
  const toast = useToast();
  const [team, setTeam] = useState(null); // { actorRole, actorId, members }
  const [workload, setWorkload] = useState({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'ta' });
  const [formErrors, setFormErrors] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // member being edited
  const [editForm, setEditForm] = useState({ fullName: '', email: '', phone: '', department: '', role: 'ta' });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const actorRole = team?.actorRole;
  const inviteRoles = actorRole === 'admin'
    ? ['admin', 'admin_ta', 'ta']
    : ['ta'];
  const canManageRow = (m) => m.id !== team?.actorId && (actorRole === 'admin' || (actorRole === 'admin_ta' && m.role === 'ta'));

  const load = () => {
    Promise.all([listTeam(), taWorkloadCounts().catch(() => ({}))])
      .then(([t, counts]) => {
        setTeam(t);
        setWorkload(counts);
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load the team.');
        setTeam({ actorRole: null, actorId: null, members: [] });
      });
  };
  useEffect(load, []);

  const submitInvite = async () => {
    const e = {};
    const n = nameError(form.fullName, { required: true, label: 'full name' });
    if (n) e.fullName = n;
    const em = emailError(form.email, { required: true });
    if (em) e.email = em;
    const ph = phoneProblem(form.phone);
    if (ph) e.phone = ph;
    setFormErrors(e);
    if (Object.keys(e).length) return;

    setInviting(true);
    try {
      const res = await inviteMember({ ...form, email: form.email.trim() });
      if (res.emailSent) toast.success(`Invitation emailed to ${form.email}.`);
      else toast.error(`Invitation created, but the email could not be sent. ${res.emailError || ''} Use "Resend" once fixed.`);
      setInviteOpen(false);
      setForm({ fullName: '', email: '', phone: '', role: inviteRoles.includes('ta') ? 'ta' : inviteRoles[0] });
      load();
    } catch (err) {
      toast.error(err.message || 'Could not send the invitation.');
    } finally {
      setInviting(false);
    }
  };

  const openEdit = (m) => {
    setEditing(m);
    setEditForm({ fullName: m.fullName || '', email: m.email || '', phone: m.phone || '', department: m.department || '', role: m.role });
    setEditErrors({});
  };

  const saveEdit = async () => {
    const e = {};
    const n = nameError(editForm.fullName, { required: true, label: 'full name' });
    if (n) e.fullName = n;
    const em = emailError(editForm.email, { required: true });
    if (em) e.email = em;
    const ph = phoneProblem(editForm.phone);
    if (ph) e.phone = ph;
    setEditErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await updateMemberDetails(editing.id, {
        fullName: editForm.fullName.trim(), email: editForm.email.trim(),
        phone: editForm.phone.trim(), department: editForm.department.trim(), role: editForm.role,
      });
      toast.success(`${editForm.fullName.trim()}'s details were updated.`);
      setEditing(null);
      load();
    } catch (err) {
      // The server re-validates everything (e.g. an email another account already uses) and names the field.
      if (err.fields && Object.keys(err.fields).length) setEditErrors(err.fields);
      toast.error(err.message || 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  };

  const resend = async (m) => {
    setBusyId(m.id);
    try {
      const res = await resendInvitation(m.email);
      if (res.emailSent) toast.success(`Invitation re-sent to ${m.email}.`);
      else toast.error(`The email could not be sent. ${res.emailError || ''}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not resend the invitation.');
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (m, role) => {
    if (role === m.role) return;
    if (!window.confirm(`Change ${m.fullName || m.email}'s role to ${ROLE_LABEL[role]}?`)) return;
    setBusyId(m.id);
    try {
      await setMemberRole(m.id, role);
      toast.success(`${m.fullName || m.email} is now ${ROLE_LABEL[role]}.`);
      load();
    } catch (err) {
      toast.error(err.message || "Could not change this user's role.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (m) => {
    const next = m.accountStatus === 'DISABLED';
    if (!window.confirm(`${next ? 'Re-enable' : 'Disable'} ${m.fullName || m.email}?`)) return;
    setBusyId(m.id);
    try {
      await setMemberActive(m.id, next);
      toast.success(`${m.fullName || m.email} ${next ? 're-enabled' : 'disabled'}.`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not update this user.');
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (m) => {
    const who = m.fullName || m.email;
    if (!window.confirm(`Permanently delete ${who}?

This removes their account, revokes their Google access and blocks ${m.email} from signing in again. Their applications and job links move to you. This cannot be undone.`)) return;
    setBusyId(m.id);
    try {
      const res = await deleteMember(m.id);
      toast.success(`${who} was deleted.${res.applicationsTransferred ? ` ${res.applicationsTransferred} application(s) moved to you.` : ''}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not delete this member.');
    } finally {
      setBusyId(null);
    }
  };

  const members = team?.members || [];

  return (
    <>
      <TAHeader title="Teams" subtitle="Invite people, assign roles, and control access for the recruitment portal." />

      <DataGrid
        columns={COLUMNS}
        rows={members}
        loading={!team}
        title={team ? `${members.length} team member${members.length === 1 ? '' : 's'}` : 'Team'}
        action={<Button icon="UserPlus" onClick={() => { setForm((f) => ({ ...f, role: inviteRoles.includes(f.role) ? f.role : inviteRoles[0] })); setInviteOpen(true); }}>Add Team Member</Button>}
        empty={{ icon: 'Users', title: 'No team members yet', message: 'Add your first team member to get started.' }}
        renderRow={(m) => (
          <tr key={m.id}>
            <td>
              <span className="ta-cell-strong">{m.fullName || '—'}</span><br />
              <span className="ta-cell-sub">{m.email}{m.phone ? ` · ${m.phone}` : ''}</span>
            </td>
            <td><Tag tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role] || m.role}</Tag></td>
            <td><Tag tone={ACCOUNT_TONE[m.accountStatus]}>{ACCOUNT_LABEL[m.accountStatus]}</Tag></td>
            <td>
              <Tag tone={INVITATION_TONE[m.invitationStatus]}>{INVITATION_LABEL[m.invitationStatus]}</Tag>
              {m.expiresAt && (m.invitationStatus === 'pending' || m.invitationStatus === 'expired') && (
                <><br /><span className="ta-cell-sub">{m.invitationStatus === 'expired' ? 'Expired' : 'Expires'} {formatDate(m.expiresAt)}</span></>
              )}
            </td>
            <td className="ta-cell-mute">{formatDateTime(m.lastLoginAt)}</td>
            <td className="ta-cell-mute">{m.role === 'ta' ? (workload[m.id] || 0) : '—'}</td>
            <td>
              <span className="ta-rowactions">
                {actorRole === 'admin' && (
                  <button className="ta-iconbtn" disabled={busyId === m.id} onClick={() => openEdit(m)} aria-label={`Edit ${m.fullName || m.email}`} title="Edit details">
                    <Icon name="Pencil" size={16} />
                  </button>
                )}
                {canManageRow(m) && (m.invitationStatus === 'pending' || m.invitationStatus === 'expired') && (
                  <button className="ta-iconbtn" disabled={busyId === m.id} onClick={() => resend(m)} aria-label="Resend invitation" title="Resend invitation">
                    <Icon name="Send" size={16} />
                  </button>
                )}
                {actorRole === 'admin' && (
                  <select
                    className="ta-select"
                    value={m.role}
                    disabled={busyId === m.id || m.id === team?.actorId}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={`Change role for ${m.fullName || m.email}`}
                  >
                    {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
                {canManageRow(m) && (
                  <button
                    className="ta-iconbtn"
                    disabled={busyId === m.id}
                    onClick={() => toggleActive(m)}
                    aria-label={m.accountStatus === 'DISABLED' ? 'Re-enable' : 'Disable'}
                    title={m.accountStatus === 'DISABLED' ? 'Re-enable' : 'Disable'}
                  >
                    <Icon name={m.accountStatus === 'DISABLED' ? 'UserCheck' : 'UserX'} size={16} />
                  </button>
                )}
                {actorRole === 'admin' && canManageRow(m) && (
                  <button className="ta-iconbtn" disabled={busyId === m.id} onClick={() => removeMember(m)} aria-label="Delete member" title="Delete member permanently" style={{ color: '#dc2626' }}>
                    <Icon name="Trash2" size={16} />
                  </button>
                )}
              </span>
            </td>
          </tr>
        )}
      />

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title="Edit Details"
        footer={
          <>
            <CommonButton variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</CommonButton>
            <CommonButton onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</CommonButton>
          </>
        }
      >
        {editing && (
          <>
            <FieldGrid>
              <Field label="Full name" required full error={editErrors.fullName}>
                <Input value={editForm.fullName} error={editErrors.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} />
              </Field>
              <Field
                label="Email (login)" required full error={editErrors.email}
                hint={editing.id === team?.actorId ? "You can't change your own email." : 'Same account and history — only the address changes.'}
              >
                <Input type="email" value={editForm.email} error={editErrors.email} disabled={editing.id === team?.actorId} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </Field>
              <Field label="Phone" error={editErrors.phone}>
                <Input type="tel" value={editForm.phone} error={editErrors.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="Department" error={editErrors.department}>
                <Input value={editForm.department} error={editErrors.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))} />
              </Field>
              <Field label="Role" full error={editErrors.role}>
                <Select
                  value={editForm.role} disabled={editing.id === team?.actorId}
                  options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                />
              </Field>
            </FieldGrid>
            <p className="ta-cell-sub" style={{ marginTop: 4 }}>
              Their assignments, applications and history stay attached to the same person. If the new email is a different Google account, they will need to reconnect Google in Settings to send email from it.
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={() => !inviting && setInviteOpen(false)}
        title="Invite Team Member"
        footer={
          <>
            <CommonButton variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</CommonButton>
            <CommonButton onClick={submitInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send Invitation'}</CommonButton>
          </>
        }
      >
        <FieldGrid>
          <Field label="Full name" required full error={formErrors.fullName}>
            <Input placeholder="Jane Smith" value={form.fullName} error={formErrors.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          </Field>
          <Field label="Email (login)" required full error={formErrors.email} hint="Any email address works — Gmail, a company address, anything they can sign in with.">
            <Input type="email" placeholder="jane.smith@gmail.com" value={form.email} error={formErrors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Phone" full error={formErrors.phone}>
            <Input type="tel" placeholder="+91 98765 43210" value={form.phone} error={formErrors.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="Assign role" required full>
            <Select
              value={form.role}
              options={inviteRoles.map((value) => ({ value, label: ROLE_LABEL[value] }))}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
          </Field>
        </FieldGrid>
        <p className="ta-cell-sub" style={{ marginTop: 4 }}>
          They'll receive an email with a secure, one-time link (valid for 7 days) to activate their account and set a password. They can also sign in with Google using this same email.
        </p>
      </Modal>
    </>
  );
}
