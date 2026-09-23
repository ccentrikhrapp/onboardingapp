// POST /functions/v1/accept-invite   (public — the token is the credential)
//   { action: 'inspect',  token }             -> who/what this invitation is for
//   { action: 'activate', token, password }   -> sets the permanent password
//
// Tokens are single-use and expiring; only their SHA-256 hash is stored. An
// expired, used, unknown or disabled-account token is rejected here — the
// browser can't bypass it, because nothing else can set the password.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, serviceClient } from "../_shared/supabase.ts";
import { hashToken, passwordError } from "../_shared/teamInvite.ts";

const APP_NAME = "HR Portal";
const ROLE_LABEL: Record<string, string> = { admin: "Super Admin", hr: "HR" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const token = typeof body.token === "string" ? body.token : "";
  if (token.length < 32 || token.length > 128) return fail("INVALID_INVITE", "This invitation link isn't valid.", 400);

  const svc = serviceClient();
  const { data: row } = await svc.from("staff_invitation_tokens").select("id, email, expires_at, used_at").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!row) return fail("INVALID_INVITE", "This invitation link isn't valid.", 400);
  if (row.used_at) return fail("INVITE_USED", "This invitation has already been used. Sign in instead, or ask your administrator to resend it.", 410);
  if (new Date(row.expires_at).getTime() < Date.now()) return fail("INVITE_EXPIRED", "This invitation has expired. Ask your administrator to resend it.", 410);

  const pat = row.email.replace(/[\\%_]/g, (c: string) => "\\" + c);
  const { data: profile } = await svc.from("profiles").select("id, email, full_name, role, active").ilike("email", pat).maybeSingle();
  if (!profile) return fail("INVALID_INVITE", "This invitation link isn't valid.", 400);
  if (!profile.active) return fail("ACCOUNT_DISABLED", "This account has been disabled. Contact your administrator.", 403);

  if (body.action === "inspect") {
    return ok({ email: profile.email, fullName: profile.full_name, roleLabel: ROLE_LABEL[profile.role] ?? profile.role, appName: APP_NAME });
  }

  const pwErr = passwordError(body.password);
  if (pwErr) return fail("WEAK_PASSWORD", pwErr, 422, { password: pwErr });

  const { error: upErr } = await svc.auth.admin.updateUserById(profile.id, { password: body.password, email_confirm: true });
  if (upErr) return fail("ACTIVATION_FAILED", "Could not set your password. Please try again.", 500);

  await svc.from("profiles").update({ must_change_password: false }).eq("id", profile.id);
  await svc.from("staff_invitation_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await svc.from("staff_invitation_tokens").delete().ilike("email", pat).is("used_at", null);
  await svc.from("staff_invites").update({ accepted_at: new Date().toISOString() }).ilike("email", pat);
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: profile.full_name ?? profile.email, action: "team.activate_invitation",
    entity_type: "profile", entity_id: profile.id, new_state: { app: "hr", role: profile.role },
  });

  return ok({ email: profile.email });
});
