// POST /functions/v1/team-manage
// Auth: Super Admin (admin) only — HR users have no user-management rights.
// Nobody can act on their own account, and the last active Super Admin can
// never be demoted or disabled.
// Body: { profileId, action: 'set_role' | 'set_active', value }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const TEAM_ROLES = ["admin", "hr", "accounts", "it", "office_admin"];
const ROLE_LABEL: Record<string, string> = { admin: "Super Admin", hr: "HR", accounts: "Accounts", it: "IT", office_admin: "Office Administration" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || me.role !== "admin") return fail("FORBIDDEN", "Only a Super Admin can manage team members.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const { profileId, action, value } = body;
  if (!profileId || !["set_role", "set_active", "delete"].includes(action)) return fail("VALIDATION_ERROR", "Invalid request.", 422);
  if (profileId === me.id) return fail("FORBIDDEN", "You can't change your own account.", 403);

  const svc = serviceClient();
  const { data: target } = await svc.from("profiles").select("id, email, full_name, role, active").eq("id", profileId).maybeSingle();
  if (!target || !TEAM_ROLES.includes(target.role)) return fail("NOT_FOUND", "Team member not found.", 404);

  const otherActiveAdmins = async () => {
    const { count } = await svc.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true).neq("id", target.id);
    return count ?? 0;
  };

  if (action === "delete") {
    const likeEmail = target.email.replace(/[\\%_]/g, (c: string) => "\\" + c);
    if (target.role === "admin" && (await otherActiveAdmins()) === 0) {
      return fail("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.", 409);
    }

    // Revoke the Google grant (Gmail send) at Google itself, then drop it here.
    let googleRevoked = false;
    const { data: tok } = await svc.from("google_oauth_tokens").select("refresh_token").ilike("google_email", likeEmail).maybeSingle();
    if (tok?.refresh_token) {
      try {
        const rev = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tok.refresh_token }),
        });
        googleRevoked = rev.ok;
      } catch { /* Google unreachable — local copy is still deleted below */ }
    }
    await svc.from("google_oauth_tokens").delete().ilike("google_email", likeEmail);

    // Removing the email from the allow-list is what stops it signing up again
    // (handle_new_user refuses any email that isn't invited).
    await svc.from("staff_invitation_tokens").delete().ilike("email", likeEmail);
    await svc.from("staff_invites").delete().ilike("email", likeEmail);
    await svc.from("emails").delete().ilike("recipient", likeEmail).eq("template", "team_invitation");

    // Deleting the auth user deletes the profile, sessions and identities (incl. Google).
    const { error: delErr } = await svc.auth.admin.deleteUser(target.id);
    if (delErr) return fail("DELETE_FAILED", delErr.message || "Could not delete this account.", 500);

    await audit(svc, {
      actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "team.delete",
      entity_type: "profile", entity_id: target.id,
      previous_state: { email: target.email, role: target.role, name: target.full_name },
      new_state: { app: "hr", googleRevoked },
      remarks: `${ROLE_LABEL[target.role]} removed`,
    });
    return ok({ deleted: true, googleRevoked });
  }

  if (action === "set_role") {
    if (!TEAM_ROLES.includes(value)) return fail("VALIDATION_ERROR", "Choose a valid role.", 422);
    if (target.role === "admin" && value !== "admin" && (await otherActiveAdmins()) === 0) {
      return fail("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.", 409);
    }
    await svc.from("profiles").update({ role: value }).eq("id", target.id);
    await svc.from("staff_invites").update({ role: value }).ilike("email", target.email.replace(/[\\%_]/g, (c: string) => "\\" + c));
    await audit(svc, {
      actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "team.role_change",
      entity_type: "profile", entity_id: target.id,
      previous_state: { role: target.role }, new_state: { role: value, app: "hr" },
      remarks: `${ROLE_LABEL[target.role]} → ${ROLE_LABEL[value]}`,
    });
    return ok({ role: value });
  }

  const next = value === true;
  if (!next && target.role === "admin" && (await otherActiveAdmins()) === 0) {
    return fail("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.", 409);
  }
  await svc.from("profiles").update({ active: next }).eq("id", target.id);
  // Ban at the auth layer too: a disabled user can't sign in or refresh a
  // session (profile.active + currentProfile() cover already-issued tokens).
  await svc.auth.admin.updateUserById(target.id, { ban_duration: next ? "none" : "876000h" });
  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: next ? "team.activate" : "team.disable",
    entity_type: "profile", entity_id: target.id, new_state: { active: next, app: "hr", email: target.email },
  });
  return ok({ active: next });
});
