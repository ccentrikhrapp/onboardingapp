// POST /functions/v1/notify-super-admin
// Auth: hr/admin. Sends the organisational-account-creation request to the
// Super Admin(s) HR selected from the searchable picker — not an automatic
// blast to every admin. Body: { employeeId, adminIds: string[], resend? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { render } from "../_shared/emailTemplates.ts";
import { sendStaffMail } from "../_shared/notify.ts";
import { employeeMailContext } from "../_shared/onboardingWorkflow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !["admin", "hr"].includes(me.role)) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const adminIds: string[] = Array.isArray(body.adminIds) ? body.adminIds.filter((x: unknown) => typeof x === "string") : [];
  if (!body.employeeId || !adminIds.length) return fail("VALIDATION_ERROR", "Choose at least one Super Admin.", 422);

  const svc = serviceClient();
  const { data: admins } = await svc.from("profiles").select("id, email, full_name").in("id", adminIds).eq("role", "admin").eq("active", true);
  if (!admins?.length) return fail("NOT_FOUND", "No matching Super Admin account found.", 404);

  let ctx;
  try { ctx = await employeeMailContext(svc, body.employeeId); }
  catch (e) { return fail("NOT_FOUND", (e as Error).message, 404); }
  const { emp, designation, department, joiningDate, location, mobile, officialEmail, profileLink } = ctx;

  const results: { adminId: string; email: string; sent: boolean; error?: string }[] = [];
  for (const admin of admins) {
    if (!admin.email) continue;
    const mail = render("employee_onboarded_super_admin", {
      employee_name: emp.full_name, employee_code: emp.employee_code, designation, department,
      mobile, official_email: officialEmail, joining_date: joiningDate, location, hr_name: me.full_name ?? me.email,
      confirmed_at: new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }),
      attention_summary: null, profile_link: profileLink,
    });
    // A deliberate "Resend" bypasses the usual dedupe; an ordinary click
    // for someone already notified is a safe no-op, not a second email.
    const res = await sendStaffMail(svc, {
      to: admin.email, subject: mail.subject, html: mail.html, text: mail.text,
      template: "employee_onboarded_super_admin", entityType: "employee", entityId: body.employeeId,
      actorEmail: me.email, idempotencyKey: body.resend ? undefined : `super-admin-request-${body.employeeId}-${admin.id}`,
    });
    results.push({ adminId: admin.id, email: admin.email, sent: res.sent, error: res.error });
    await svc.from("employee_onboarding_events").insert({
      employee_id: body.employeeId, kind: "notification", actor_profile_id: me.id, actor_label: me.full_name ?? me.email,
      remark: `Super Admin request to ${admin.full_name || admin.email}: ${res.sent ? "sent" : res.skipped ? "already sent — use Resend to send again" : `failed — ${res.error}`}`,
    });
  }

  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "onboarding.super_admin_notified",
    entity_type: "employee", entity_id: body.employeeId, new_state: { adminIds, results },
  });

  return ok({ results });
});
