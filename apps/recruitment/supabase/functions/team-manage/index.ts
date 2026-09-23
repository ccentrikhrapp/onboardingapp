// POST /functions/v1/team-manage
// Auth + rules (enforced here, not just hidden in the UI):
//   Super Admin (admin)          set_role, set_active, set_department on any team member
//   Talent Acquisition Head      set_active on Talent Acquisition users only
//   Talent Acquisition           no access
// Nobody can act on their own account, and the last active Super Admin can
// never be demoted or disabled.
// Body: { profileId, action: 'set_role' | 'set_active' | 'set_department', value }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const TEAM_ROLES = ["admin", "admin_ta", "ta"];
const ROLE_LABEL: Record<string, string> = { admin: "Super Admin", admin_ta: "Talent Acquisition Head", ta: "Talent Acquisition" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !["admin", "admin_ta"].includes(me.role)) return fail("FORBIDDEN", "You don't have permission to manage team members.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const { profileId, action, value } = body;
  if (!profileId || !["set_role", "set_active", "set_department", "delete"].includes(action)) return fail("VALIDATION_ERROR", "Invalid request.", 422);
  if (profileId === me.id) return fail("FORBIDDEN", "You can't change your own account.", 403);

  const svc = serviceClient();
  const { data: target } = await svc.from("profiles").select("id, email, full_name, role, active").eq("id", profileId).maybeSingle();
  if (!target || !TEAM_ROLES.includes(target.role)) return fail("NOT_FOUND", "Team member not found.", 404);

  // Talent Acquisition Head: only enable/disable plain Talent Acquisition users.
  if (me.role === "admin_ta" && !(action === "set_active" && target.role === "ta")) {
    return fail("FORBIDDEN", "Only a Super Admin can do that.", 403);
  }

  const otherActiveAdmins = async () => {
    const { count } = await svc.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true).neq("id", target.id);
    return count ?? 0;
  };

  if (action === "delete") {
    // Permanent removal — Super Admin only (a TA Head was already stopped above).
    const likeEmail = target.email.replace(/[\\%_]/g, (c: string) => "\\" + c);
    if (target.role === "admin" && (await otherActiveAdmins()) === 0) {
      return fail("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.", 409);
    }
    // Deleting a profile cascades to candidate records — never allow that.
    const { count: candidateRows } = await svc.from("candidates").select("id", { count: "exact", head: true }).eq("profile_id", target.id);
    if ((candidateRows ?? 0) > 0) {
      return fail("OWNS_CANDIDATE_DATA", "This account also owns candidate records, so it can't be deleted. Disable it instead.", 409);
    }

    // Their work stays usable: applications and job links move to the Super Admin doing this.
    const { count: apps } = await svc.from("applications").select("id", { count: "exact", head: true }).eq("assigned_ta_id", target.id);
    const { count: links } = await svc.from("application_links").select("id", { count: "exact", head: true }).eq("ta_id", target.id);
    await svc.from("applications").update({ assigned_ta_id: me.id }).eq("assigned_ta_id", target.id);
    await svc.from("application_links").update({ ta_id: me.id }).eq("ta_id", target.id);

    // Revoke the Google grant (Gmail send + Calendar) at Google itself, then drop it here.
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

    // Block the address first, so a failure below can't leave it free to sign up again.
    await svc.from("blocked_emails").upsert({ email: target.email.toLowerCase(), blocked_by: me.id, reason: "removed by Super Admin" }, { onConflict: "email" });
    await svc.from("staff_invitation_tokens").delete().ilike("email", likeEmail);
    await svc.from("staff_invites").delete().ilike("email", likeEmail);
    await svc.from("emails").delete().ilike("recipient", likeEmail).eq("template", "team_invitation");

    // Deleting the auth user deletes the profile, sessions and identities (incl. Google).
    const { error: delErr } = await svc.auth.admin.deleteUser(target.id);
    if (delErr) {
      await svc.from("blocked_emails").delete().eq("email", target.email.toLowerCase());
      return fail("DELETE_FAILED", delErr.message || "Could not delete this account.", 500);
    }

    await audit(svc, {
      actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "team.delete",
      entity_type: "profile", entity_id: target.id,
      previous_state: { email: target.email, role: target.role, name: target.full_name },
      new_state: { app: "recruitment", googleRevoked, applicationsTransferred: apps ?? 0, linksTransferred: links ?? 0 },
      remarks: `${ROLE_LABEL[target.role]} removed`,
    });
    return ok({ deleted: true, googleRevoked, applicationsTransferred: apps ?? 0, linksTransferred: links ?? 0 });
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
      previous_state: { role: target.role }, new_state: { role: value, app: "recruitment" },
      remarks: `${ROLE_LABEL[target.role]} → ${ROLE_LABEL[value]}`,
    });
    return ok({ role: value });
  }

  if (action === "set_active") {
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
      entity_type: "profile", entity_id: target.id, new_state: { active: next, app: "recruitment", email: target.email },
    });
    return ok({ active: next });
  }

  const department = typeof value === "string" ? value.trim() || null : null;
  await svc.from("profiles").update({ department }).eq("id", target.id);
  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "team.department_change",
    entity_type: "profile", entity_id: target.id, new_state: { department },
  });
  return ok({ department });
});
