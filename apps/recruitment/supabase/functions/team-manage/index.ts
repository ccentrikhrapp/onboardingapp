// POST /functions/v1/team-manage
// Auth + rules (enforced here, not just hidden in the UI):
//   Super Admin (admin)          set_role, set_active, set_department, update_details (name / email / phone /
//                                department / role in one validated call) on any team member
//   Talent Acquisition Head      set_active on Talent Acquisition users only
//   Talent Acquisition           no access
// Nobody can act on their own account, and the last active Super Admin can
// never be demoted or disabled.
// Body: { profileId, action: 'set_role' | 'set_active' | 'set_department' | 'delete' | 'update_details', value }
//   update_details value: { fullName, email, phone?, department?, role? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const TEAM_ROLES = ["admin", "admin_ta", "ta"];
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRe = /^[\p{L}][\p{L} .'-]*$/u;
const likeEsc = (v: string) => v.replace(/[\\%_]/g, (c) => "\\" + c);
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
  if (!profileId || !["set_role", "set_active", "set_department", "delete", "update_details"].includes(action)) return fail("VALIDATION_ERROR", "Invalid request.", 422);
  // Everything except correcting your own name/phone/department is off-limits on your own account.
  if (profileId === me.id && action !== "update_details") return fail("FORBIDDEN", "You can't change your own account.", 403);

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

  if (action === "update_details") {
    const v = (value ?? {}) as Record<string, any>;
    const fields: Record<string, string> = {};
    const fullName = String(v.fullName ?? "").trim();
    if (!fullName) fields.fullName = "Enter a name.";
    else if (fullName.length > 100 || !nameRe.test(fullName)) fields.fullName = "Enter a valid name.";
    const email = String(v.email ?? "").trim().toLowerCase();
    if (!email) fields.email = "Enter an email address.";
    else if (!emailRe.test(email)) fields.email = "Enter a valid email address.";
    const phone = String(v.phone ?? "").trim();
    if (phone) {
      const digits = phone.replace(/\D/g, "").length;
      if (!/^\+?[0-9 ()-]+$/.test(phone) || digits < 7 || digits > 15) fields.phone = "Enter a valid phone number.";
    }
    const department = String(v.department ?? "").trim();
    if (department.length > 100) fields.department = "That department name is too long.";
    const newRole = v.role === undefined || v.role === "" ? target.role : v.role;
    if (!TEAM_ROLES.includes(newRole)) fields.role = "Choose a valid role.";
    if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please fix the highlighted fields.", 422, fields);

    const oldEmail = target.email.toLowerCase();
    const emailChanged = email !== oldEmail;
    const roleChanged = newRole !== target.role;
    if (emailChanged && target.id === me.id) return fail("FORBIDDEN", "You can't change your own email address.", 403, { email: "You can't change your own email address." });
    if (roleChanged && target.id === me.id) return fail("FORBIDDEN", "You can't change your own role.", 403, { role: "You can't change your own role." });
    if (roleChanged && target.role === "admin" && (await otherActiveAdmins()) === 0) {
      return fail("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.", 409, { role: "There must always be at least one active Super Admin." });
    }

    if (emailChanged) {
      const taken = "Another account already uses this email address.";
      const { data: sameProfile } = await svc.from("profiles").select("id").ilike("email", likeEsc(email)).neq("id", target.id).limit(1);
      if (sameProfile?.length) return fail("EMAIL_TAKEN", taken, 409, { email: taken });
      const { data: blocked } = await svc.from("blocked_emails").select("email").eq("email", email).maybeSingle();
      if (blocked) return fail("EMAIL_BLOCKED", "This address belongs to a removed member and is blocked.", 409, { email: "This address belongs to a removed member and is blocked." });
      const { data: otherInvite } = await svc.from("staff_invites").select("email").ilike("email", likeEsc(email)).limit(1);
      if (otherInvite?.length) return fail("EMAIL_TAKEN", "This address already has a pending invitation.", 409, { email: "This address already has a pending invitation." });
    }

    // The sign-in account first (the step that can refuse); the profile follows the same id.
    const { data: authUser } = await svc.auth.admin.getUserById(target.id);
    const authPatch: Record<string, unknown> = { user_metadata: { ...(authUser?.user?.user_metadata ?? {}), full_name: fullName } };
    if (emailChanged) { authPatch.email = email; authPatch.email_confirm = true; }
    const { error: authErr } = await svc.auth.admin.updateUserById(target.id, authPatch);
    if (authErr) {
      const dup = /already|registered|exists|duplicate/i.test(authErr.message ?? "");
      return dup
        ? fail("EMAIL_TAKEN", "Another account already uses this email address.", 409, { email: "Another account already uses this email address." })
        : fail("UPDATE_FAILED", "Could not update this account. Please try again.", 500);
    }

    const { error: profErr } = await svc.from("profiles").update({
      full_name: fullName, email, phone: phone || null, department: department || null, role: newRole,
    }).eq("id", target.id);
    if (profErr) {
      if (emailChanged) await svc.auth.admin.updateUserById(target.id, { email: oldEmail, email_confirm: true });
      return fail("UPDATE_FAILED", "Could not update this member. Please try again.", 500);
    }

    // The sign-in allow-list and invitation status are keyed by email — keep them attached to the same person.
    const oldLike = likeEsc(oldEmail);
    await svc.from("staff_invites").update({ ...(emailChanged ? { email } : {}), full_name: fullName, ...(roleChanged ? { role: newRole } : {}) }).ilike("email", oldLike);
    if (emailChanged) await svc.from("staff_invitation_tokens").update({ email }).ilike("email", oldLike);

    await audit(svc, {
      actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "team.update_details",
      entity_type: "profile", entity_id: target.id,
      previous_state: { name: target.full_name, email: target.email, role: target.role },
      new_state: { name: fullName, email, role: newRole, phone: phone || null, department: department || null, app: "recruitment" },
      remarks: [emailChanged && "email changed", target.full_name !== fullName && "name changed", roleChanged && "role changed"].filter(Boolean).join(", ") || "details updated",
    });
    return ok({ id: target.id, fullName, email, phone: phone || null, department: department || null, role: newRole });
  }

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
