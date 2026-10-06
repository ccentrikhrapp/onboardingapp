// POST /functions/v1/team-invite
// Auth: Super Admin (admin) or Talent Acquisition Head (admin_ta).
//   Super Admin       -> may invite Super Admin / Talent Acquisition Head / Talent Acquisition
//   TA Head           -> may invite Talent Acquisition only
// Body: { action: 'invite' | 'resend', fullName, email, role }   (resend needs email only)
//
// Creates the (passwordless) auth account + staff_invites allowlist row, then a
// single-use, expiring, hash-stored token and emails the activation link from
// the inviter's own Gmail. The response says truthfully whether the email
// actually went out — a failed send leaves a real "pending" invitation that
// can be resent, never a fake success.

import { fail, ok, preflight } from "../_shared/http.ts";
import { phoneOk } from "../_shared/phone.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { appBaseUrl, deliverInvitation, generateTempPassword, hashToken, INVITATION_EXPIRY_DAYS, invitationEmail, randomToken } from "../_shared/teamInvite.ts";

const APP_NAME = "Recruitment Portal";
const ROLE_LABEL: Record<string, string> = { admin: "Super Admin", admin_ta: "Talent Acquisition Head", ta: "Talent Acquisition" };
const INVITABLE: Record<string, string[]> = { admin: ["admin", "admin_ta", "ta"], admin_ta: ["ta"] };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Optional. Accepts international formats (+91 98765 43210, (022) 1234 5678...).


Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !INVITABLE[me.role]) return fail("FORBIDDEN", "You don't have permission to invite team members.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }

  const action = body.action === "resend" ? "resend" : "invite";
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return fail("VALIDATION_ERROR", "Enter a valid email address.", 422, { email: "Enter a valid email address." });

  const phone = String(body.phone ?? "").trim();
  if (action === "invite" && phone && !phoneOk(phone)) return fail("VALIDATION_ERROR", "Enter a valid phone number.", 422, { phone: "Enter a valid phone number." });

  const svc = serviceClient();
  const pat = email.replace(/[\\%_]/g, (c) => "\\" + c); // escape LIKE wildcards so ilike is an exact, case-insensitive match
  const { data: existing } = await svc.from("profiles").select("id, email, full_name, role, active, must_change_password").ilike("email", pat).maybeSingle();

  let fullName = String(body.fullName ?? "").trim();
  let role = String(body.role ?? "");
  let profileId: string;
  // Emailed once; the database keeps only the auth provider's hash of it.
  const tempPassword = generateTempPassword();

  if (action === "invite") {
    if (fullName.length < 2) return fail("VALIDATION_ERROR", "Enter the person's full name.", 422, { fullName: "Enter the person's full name." });
    if (!INVITABLE[me.role].includes(role)) return fail("FORBIDDEN", `You can't invite someone as ${ROLE_LABEL[role] ?? "that role"}.`, 403);
    if (existing) return fail("ALREADY_EXISTS", "This email already has an account. Manage it from the team list instead.", 409);
    // A previously removed member can be brought back — only by this deliberate invite.
    await svc.from("blocked_emails").delete().ilike("email", pat);

    const { error: invErr } = await svc.from("staff_invites").upsert(
      { email, role, full_name: fullName, invited_by: me.id, invited_at: new Date().toISOString(), accepted_at: null },
      { onConflict: "email" },
    );
    if (invErr) return fail("DB_ERROR", "Could not create the invitation.", 500);

    // The profile row (and role) is created by the handle_new_user trigger from
    // the staff_invites row above. The account starts with the emailed temporary
    // password and must_change_password, which limits that session to setting a
    // permanent password.
    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email, email_confirm: true, password: tempPassword, user_metadata: { full_name: fullName },
    });
    if (cErr || !created.user) return fail("CREATE_FAILED", cErr?.message || "Could not create the account.", 500);
    profileId = created.user.id;
    await svc.from("profiles").update({ must_change_password: true, ...(phone ? { phone } : {}) }).eq("id", profileId);
  } else {
    if (!existing) return fail("NOT_FOUND", "No invitation exists for this email.", 404);
    if (!INVITABLE[me.role].includes(existing.role)) return fail("FORBIDDEN", "You can't manage this user's invitation.", 403);
    const { data: inv } = await svc.from("staff_invites").select("accepted_at").ilike("email", pat).maybeSingle();
    const { data: au } = await svc.auth.admin.getUserById(existing.id);
    if (inv?.accepted_at || (au.user?.last_sign_in_at && !existing.must_change_password)) return fail("ALREADY_ACTIVE", "This user has already activated their account.", 409);
    if (!existing.active) return fail("DISABLED", "This user is disabled. Re-enable them first.", 409);
    fullName = existing.full_name || fullName || email;
    role = existing.role;
    profileId = existing.id;
    // Fresh temporary password; the previous one stops working.
    const { error: pErr } = await svc.auth.admin.updateUserById(existing.id, { password: tempPassword });
    if (pErr) return fail("DB_ERROR", "Could not reset the temporary password.", 500);
    await svc.from("profiles").update({ must_change_password: true }).eq("id", existing.id);
  }

  // New token; any earlier unused ones for this email are void.
  await svc.from("staff_invitation_tokens").delete().ilike("email", pat).is("used_at", null);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 86_400_000);
  const { error: tErr } = await svc.from("staff_invitation_tokens").insert({
    email, token_hash: await hashToken(token), expires_at: expiresAt.toISOString(), created_by: me.id,
  });
  if (tErr) return fail("DB_ERROR", "Could not create the invitation link.", 500);

  const { data: inv2 } = await svc.from("staff_invites").select("send_count").ilike("email", pat).maybeSingle();
  await svc.from("staff_invites").update({
    expires_at: expiresAt.toISOString(), last_sent_at: new Date().toISOString(), send_count: (inv2?.send_count ?? 0) + 1,
  }).ilike("email", pat);

  const link = `${appBaseUrl()}/accept-invite?token=${token}`;
  const mail = invitationEmail({
    appName: APP_NAME, name: fullName, email, roleLabel: ROLE_LABEL[role] ?? role, link, expiresAt,
    inviterName: me.full_name || me.email, inviterEmail: me.email,
    tempPassword, loginUrl: `${appBaseUrl()}/ta/login?email=${encodeURIComponent(email)}`,
  });
  const delivery = await deliverInvitation(svc, { to: email, inviterEmail: me.email, ...mail });

  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email,
    action: action === "invite" ? "team.invite" : "team.invite_resend",
    entity_type: "profile", entity_id: profileId,
    new_state: { email, role, app: "recruitment", emailSent: delivery.sent },
  });

  return ok({ profileId, emailSent: delivery.sent, emailError: delivery.error ?? null, expiresAt: expiresAt.toISOString() });
});
