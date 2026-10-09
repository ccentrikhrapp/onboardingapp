// POST /functions/v1/notify-accounts-it
// Auth: hr/admin. Sections 2 & 3 — HR-triggered request emails for laptop
// allocation and ID card creation, each sent to every active Accounts/IT
// staff member (no picker: unlike the Super Admin request, there's no "pick
// which one" step here — "the designated Accounts/IT recipient" is simply
// the team). Body: { employeeId, requestType: 'laptop_allocation' |
// 'id_card_creation', resend? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { render } from "../_shared/emailTemplates.ts";
import { sendStaffMail } from "../_shared/notify.ts";
import { activeTeamEmails, employeeMailContext, markTaskInProgressOnSend } from "../_shared/onboardingWorkflow.ts";
import { appBaseUrl } from "../_shared/teamInvite.ts";

const REQUEST_META: Record<string, { heading: string; subjectPrefix: string; checklistItem: string }> = {
  laptop_allocation: {
    heading: "Laptop / workstation allocation request",
    subjectPrefix: "Action Required: Laptop Allocation",
    checklistItem: "Allocate and hand over the employee's laptop or workstation.",
  },
  id_card_creation: {
    heading: "Employee ID card creation request",
    subjectPrefix: "Action Required: Employee ID Card",
    checklistItem: "Prepare and issue the employee's physical ID card.",
  },
};

function formatAddress(a: Record<string, string> | null | undefined): string {
  if (!a) return "";
  return [a.line1, a.city, a.state, a.pin].filter(Boolean).join(", ");
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !["admin", "hr"].includes(me.role)) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const requestType = body.requestType as string;
  const meta = REQUEST_META[requestType];
  if (!body.employeeId || !meta) return fail("VALIDATION_ERROR", "Unknown request type.", 422);

  const svc = serviceClient();
  const { data: task } = await svc.from("onboarding_tasks").select("*").eq("employee_id", body.employeeId).eq("key", requestType).maybeSingle();
  if (!task) return fail("NOT_FOUND", "This request isn't set up for this employee.", 404);

  let ctx;
  try { ctx = await employeeMailContext(svc, body.employeeId); }
  catch (e) { return fail("NOT_FOUND", (e as Error).message, 404); }
  const { emp, designation, department, joiningDate, location } = ctx;

  const recipients = await activeTeamEmails(svc, ["accounts", "it"]);
  if (!recipients.length) return fail("NOT_FOUND", "No active Accounts/IT staff found to send this to.", 404);

  // Section 3: ID card creation reuses the employee's existing photo —
  // never attached (no attachment pipeline exists in this app's mailer),
  // linked via the same signed-URL mechanism every other private file in
  // this app uses. A week is enough time for Accounts/IT to act on it.
  let photoLink: string | undefined;
  if (requestType === "id_card_creation" && emp.photo_path) {
    const { data: signed } = await svc.storage.from("employee-photos").createSignedUrl(emp.photo_path, 60 * 60 * 24 * 7);
    photoLink = signed?.signedUrl;
  }

  const results: { email: string; sent: boolean; error?: string }[] = [];
  for (const r of recipients) {
    const mail = render("onboarding_task_request", {
      subject_line: `${meta.subjectPrefix} — ${emp.full_name} | ${emp.employee_code}`,
      heading: meta.heading, employee_name: emp.full_name, employee_code: emp.employee_code,
      designation, department, joining_date: joiningDate, location,
      checklist_items: meta.checklistItem, task_link: `${appBaseUrl()}/hr/employees/${body.employeeId}`,
      // id_card_creation only — undefined for laptop_allocation, so these
      // rows simply don't render (see onboarding_task_request's details()).
      phone: requestType === "id_card_creation" ? emp.phone : undefined,
      blood_group: requestType === "id_card_creation" ? emp.blood_group : undefined,
      address: requestType === "id_card_creation" ? formatAddress(emp.address) : undefined,
      photo_link: photoLink,
    });
    const res = await sendStaffMail(svc, {
      to: r.email, subject: mail.subject, html: mail.html, text: mail.text,
      template: "onboarding_task_request", entityType: "employee", entityId: body.employeeId,
      actorEmail: me.email, idempotencyKey: body.resend ? undefined : `accounts-it-${requestType}-${body.employeeId}-${r.email}`,
    });
    results.push({ email: r.email, sent: res.sent, error: res.error });
    await svc.from("employee_onboarding_events").insert({
      employee_id: body.employeeId, task_id: task.id, kind: "notification", actor_profile_id: me.id, actor_label: me.full_name ?? me.email,
      remark: `${meta.heading} to ${r.email}: ${res.sent ? "sent" : res.skipped ? "already sent — use Resend to send again" : `failed — ${res.error}`}`,
    });
  }

  if (results.some((r) => r.sent)) {
    await markTaskInProgressOnSend(svc, task, { label: me.full_name ?? me.email });
  }

  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: `onboarding.${requestType}_notified`,
    entity_type: "employee", entity_id: body.employeeId, new_state: { requestType, results },
  });

  return ok({ results });
});
