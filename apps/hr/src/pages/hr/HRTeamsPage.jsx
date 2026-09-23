import { useEffect, useState } from 'react';
import HRHeader from '../../components/kit/HRHeader.jsx';
import DataGrid from '../../components/kit/DataGrid.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import Icon from '../../components/common/Icon.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listTeam, inviteMember, resendInvitation, setMemberRole, setMemberActive, deleteMember } from '../../api/team.js';

const ROLE_LABEL = { admin: 'Super Admin', hr: 'HR' };
const ROLE_TONE = { admin: 'green', hr: 'blue' };
const INVITATION_TONE = { pending: 'amber', accepted: 'blue', active: 'green', expired: 'red', disabled: 'grey' };
const INVITATION_LABEL = { pending: 'Pending', accepted: 'Accepted', active: 'Active', expired: 'Expired', disabled: 'Disabled' };
const ACCOUNT_TONE = { ACTIVE: 'green', INVITED: 'amber', DISABLED: 'grey' };
const ACCOUNT_LABEL = { ACTIVE: 'Active', INVITED: 'Invited', DISABLED: 'Disabled' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Optional, international formats allowed (+91 98765 43210) — mirrors team-invite.
const phoneProblem = (p) => {
  const v = p.trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[0-9 ()-]+$/.test(v) && digits >= 7 && digits <= 15 ? '' : 'Enter a valid phone number.';
};

const COLUMNS = [
  { key: 'name', label: 'Name / Email' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Account status' },
  { key: 'invitation', label: 'Invitation' },
  { key: 'login', label: 'Last login' },
  { key: 'actions', label: 'Actions' },
];

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/* Teams — Super Admin only (route guard + the team-* edge functions both
   enforce it; HR users have no user-management rights). */
export default function HRTeamsPage() {
  const toast = useToast();
  const [team, setTeam] = useState(null); // { actorId, members }
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'hr' });
  const [errors, setErrors] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    listTeam()
      .then(setTeam)
      .catch((err) => {
        toast.error(err.message || 'Could not load the team.');
        setTeam({ actorId: null, members: [] });
      });
  };
  useEffect(load, []);

  const submitInvite = async () => {
    const e = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter the full name.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    const ph = phoneProblem(form.phone);
    if (ph) e.phone = ph;
    setErrors(e);
    if (Object.keys(e).length) return;
    setInviting(true);
    try {
      const res = await inviteMember({ ...form, email: form.email.trim() });
      if (res.emailSent) toast.success(`Invitation emailed to ${form.email.trim()}.`);
      else toast.error(`Invitation created, but the email could not be sent. ${res.emailError || ''} Use "Resend" once fixed.`);
      setInviteOpen(false);
      setForm({ fullName: '', email: '', phone: '', role: 'hr' });
      load();
    } catch (err) {
      toast.error(err.message || 'Could not send the invitation.');
    } finally {
      setInviting(false);
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

This removes their account, revokes their Google access and stops ${m.email} from signing in again. This cannot be undone.`)) return;
    setBusyId(m.id);
    try {
      await deleteMember(m.id);
      toast.success(`${who} was deleted.`);
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
      <HRHeader title="Teams" subtitle="Invite people, assign roles, and control access for the HR portal." />

      <DataGrid
        columns={COLUMNS}
        rows={members}
        title={`${members.length} team member${members.length === 1 ? '' : 's'}`}
        action={<Button icon="UserPlus" onClick={() => setInviteOpen(true)}>Add Team Member</Button>}
        empty={{ icon: 'Users', title: 'No team members yet', message: 'Add your first team member to get started.' }}
        renderRow={(m) => (
          <tr key={m.id}>
            <td>
              <span className="hr-cell-strong">{m.fullName || '—'}</span><br />
              <span className="hr-cell-sub">{m.email}{m.phone ? ` · ${m.phone}` : ''}</span>
            </td>
            <td><Tag tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role] || m.role}</Tag></td>
            <td><Tag tone={ACCOUNT_TONE[m.accountStatus]}>{ACCOUNT_LABEL[m.accountStatus]}</Tag></td>
            <td>
              <Tag tone={INVITATION_TONE[m.invitationStatus]}>{INVITATION_LABEL[m.invitationStatus]}</Tag>
              {m.expiresAt && (m.invitationStatus === 'pending' || m.invitationStatus === 'expired') && (
                <><br /><span className="hr-cell-sub">{m.invitationStatus === 'expired' ? 'Expired' : 'Expires'} {formatDate(m.expiresAt)}</span></>
              )}
            </td>
            <td className="hr-cell-mute">{formatDateTime(m.lastLoginAt)}</td>
            <td>
              <span className="hr-rowactions" style={{ opacity: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                {m.id !== team?.actorId && (m.invitationStatus === 'pending' || m.invitationStatus === 'expired') && (
                  <button className="hr-iconbtn" disabled={busyId === m.id} onClick={() => resend(m)} aria-label="Resend invitation" title="Resend invitation">
                    <Icon name="Send" size={16} />
                  </button>
                )}
                <select
                  className="hr-input"
                  style={{ width: 'auto', padding: '6px 8px' }}
                  value={m.role}
                  disabled={busyId === m.id || m.id === team?.actorId}
                  onChange={(e) => changeRole(m, e.target.value)}
                  aria-label={`Change role for ${m.fullName || m.email}`}
                >
                  {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {m.id !== team?.actorId && (
                  <button
                    className="hr-iconbtn"
                    disabled={busyId === m.id}
                    onClick={() => toggleActive(m)}
                    aria-label={m.accountStatus === 'DISABLED' ? 'Re-enable' : 'Disable'}
                    title={m.accountStatus === 'DISABLED' ? 'Re-enable' : 'Disable'}
                  >
                    <Icon name={m.accountStatus === 'DISABLED' ? 'UserCheck' : 'UserX'} size={16} />
                  </button>
                )}
                {m.id !== team?.actorId && (
                  <button className="hr-iconbtn" disabled={busyId === m.id} onClick={() => removeMember(m)} aria-label="Delete member" title="Delete member permanently" style={{ color: '#dc2626' }}>
                    <Icon name="Trash2" size={16} />
                  </button>
                )}
              </span>
            </td>
          </tr>
        )}
      />

      <Modal open={inviteOpen} onClose={() => !inviting && setInviteOpen(false)} title="Invite Team Member">
        <div className="hr-field hr-field--full">
          <label className="hr-field__label" htmlFor="tm-name">Full name<span className="req">*</span></label>
          <input id="tm-name" className="hr-input" placeholder="Jane Smith" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          {errors.fullName && <span className="hr-field__error">{errors.fullName}</span>}
        </div>
        <div className="hr-field hr-field--full">
          <label className="hr-field__label" htmlFor="tm-email">Email (login)<span className="req">*</span></label>
          <input id="tm-email" type="email" className="hr-input" placeholder="jane.smith@gmail.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          {errors.email
            ? <span className="hr-field__error">{errors.email}</span>
            : <span className="hr-field__hint">Any email address works — Gmail, a company address, anything they can sign in with.</span>}
        </div>
        <div className="hr-field hr-field--full">
          <label className="hr-field__label" htmlFor="tm-phone">Phone</label>
          <input id="tm-phone" type="tel" className="hr-input" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          {errors.phone && <span className="hr-field__error">{errors.phone}</span>}
        </div>
        <div className="hr-field hr-field--full">
          <label className="hr-field__label" htmlFor="tm-role">Assign role<span className="req">*</span></label>
          <select id="tm-role" className="hr-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <p className="hr-cell-sub">
          They'll receive an email with a secure, one-time link (valid for 7 days) to activate their account and set a password. They can also sign in with Google using this same email.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
          <Button onClick={submitInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send Invitation'}</Button>
        </div>
      </Modal>
    </>
  );
}
