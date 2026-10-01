import { callFn } from './client.js';

/** Teams: every call is authorised again on the server (team-* edge
    functions check the caller's role + active flag) — the UI only hides. */
export const listTeam = () => callFn('team-list', { body: {} });

export const inviteMember = ({ fullName, email, role }) =>
  callFn('team-invite', { body: { action: 'invite', fullName, email, role } });

export const resendInvitation = (email) => callFn('team-invite', { body: { action: 'resend', email } });

export const setMemberRole = (profileId, role) =>
  callFn('team-manage', { body: { profileId, action: 'set_role', value: role } });

export const setMemberActive = (profileId, active) =>
  callFn('team-manage', { body: { profileId, action: 'set_active', value: active } });

/** Super Admin: edit a member in place (same account/id — name, email, phone, department, role). */
export const updateMemberDetails = (profileId, { fullName, email, phone, department, role }) =>
  callFn('team-manage', { body: { profileId, action: 'update_details', value: { fullName, email, phone, department, role } } });

/** Public (token is the credential): who an invitation link is for. */
export const inspectInvitation = (token) => callFn('accept-invite', { body: { action: 'inspect', token } });

/** Public: sets the permanent password and burns the single-use token. */
export const activateInvitation = (token, password) =>
  callFn('accept-invite', { body: { action: 'activate', token, password } });

/** Only call a temporary-password session may make: sets the permanent password. */
export const setInitialPassword = (password) => callFn('set-initial-password', { body: { password } });

/** Best-effort audit row for a real sign-in (server verifies who you are). */
export const recordLogin = (provider) => callFn('record-login', { body: { provider } }).catch(() => {});

/** Super Admin: permanently remove a member (account, Google grant, invites; email blocked until re-invited). */
export const deleteMember = (profileId) =>
  callFn('team-manage', { body: { profileId, action: 'delete' } });
