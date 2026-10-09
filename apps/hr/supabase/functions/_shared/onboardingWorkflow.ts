import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { render } from "./emailTemplates.ts";
import { sendStaffMail } from "./notify.ts";
import { appBaseUrl } from "./teamInvite.ts";

// Everything that must happen once, right after an employee record is
// created: create the configurable checklist tasks, and notify whichever
// team each checklist belongs to. Called from joining-hr-action and from
// create-employee — the two places ensureEmployee() can succeed from —
// so neither path can create an employee without also starting onboarding.
//
// The Super Admin notification is NOT sent automatically from here — HR
// picks which Super Admin(s) to notify from a searchable selector on the
// employee's own page (notify-super-admin), so it isn't auto-blasted to
// every admin. initializeOnboarding only creates the checklist tasks and
// the systematic Accounts/IT + Joining Arrangements requests.
//
// Idempotent throughout: onboarding_tasks has a unique(employee_id, key)
// constraint, so re-running this for the same employee (a retried request,
// or calling it from both entry points by mistake) only ever inserts each
// task once; sendStaffMail() itself dedupes by template+entity+recipient.

const log = async (svc: SupabaseClient, employeeId: string, row: Record<string, unknown>) =>
  svc.from("employee_onboarding_events").insert({ employee_id: employeeId, ...row });

async function activeTeamEmails(svc: SupabaseClient, roles: string[]): Promise<{ email: string; name: string }[]> {
  const { data } = await svc.from("profiles").select("email, full_name").in("role", roles).eq("active", true);
  return (data ?? []).filter((p) => p.email).map((p) => ({ email: p.email as string, name: (p.full_name as string) || "there" }));
}

/** Everything an onboarding email needs about one employee, gathered once —
    used by initializeOnboarding and by notify-super-admin alike, so the two
    can never describe the same employee differently. */
export async function employeeMailContext(svc: SupabaseClient, employeeId: string) {
  const { data: emp } = await svc.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("Employee record not found.");
  const { data: caseRow } = await svc.from("onboarding_cases").select("*").eq("id", emp.onboarding_case_id).maybeSingle();
  const { data: jp } = await svc.from("joining_profiles").select("hr_fields").eq("onboarding_case_id", emp.onboarding_case_id).maybeSingle();
  const hrFields = (jp?.hr_fields ?? {}) as Record<string, string>;
  return {
    emp, caseRow, hrFields,
    designation: emp.designation || caseRow?.designation || "",
    department: emp.department || caseRow?.department || "",
    joiningDate: emp.joining_date ? new Date(emp.joining_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
    location: emp.office_location || caseRow?.location || "",
    mobile: emp.phone || hrFields.mobile || caseRow?.candidate_phone || "",
    officialEmail: hrFields.ccentrikEmail || emp.email || "",
    profileLink: `${appBaseUrl()}/hr/employees/${employeeId}`,
  };
}

export async function initializeOnboarding(
  svc: SupabaseClient,
  o: { employeeId: string; onboardingCaseId: string; actor: { id: string; label: string; email?: string | null } },
) {
  const ctx = await employeeMailContext(svc, o.employeeId);
  const { emp, hrFields, designation, department, joiningDate, location } = ctx;

  // ---- Create the configurable checklist tasks ----
  const { data: templates } = await svc.from("onboarding_task_templates").select("*").eq("active", true).order("display_order");
  const rows = (templates ?? []).map((t) => ({
    employee_id: o.employeeId, template_id: t.id, category: t.category, key: t.key, label: t.label,
    required: t.required, owner_role: t.default_owner_role,
  }));
  if (rows.length) {
    // ON CONFLICT DO NOTHING via the unique(employee_id, key) constraint —
    // a retried call creates nothing new for a task that already exists.
    await svc.from("onboarding_tasks").upsert(rows, { onConflict: "employee_id,key", ignoreDuplicates: true });
  }
  await log(svc, o.employeeId, {
    kind: "onboarding_initialized", actor_profile_id: o.actor.id, actor_label: o.actor.label,
    remark: `${rows.length} onboarding task(s) created from the active checklist.`,
  });

  // ---- Accounts/IT and Joining Arrangements requests ----
  const groups: { category: "accounts_it" | "joining_arrangements"; roles: string[]; heading: string; subjectPrefix: string }[] = [
    { category: "accounts_it", roles: ["accounts", "it"], heading: "Accounts & IT onboarding request", subjectPrefix: "Action Required: New Employee Joining Setup" },
    { category: "joining_arrangements", roles: ["office_admin"], heading: "Joining day arrangements request", subjectPrefix: "Action Required: Joining Day Arrangements" },
  ];
  for (const g of groups) {
    const items = (templates ?? []).filter((t) => t.category === g.category).map((t) => t.label);
    if (!items.length) continue;
    const recipients = await activeTeamEmails(svc, g.roles);
    for (const r of recipients) {
      const mail = render("onboarding_task_request", {
        subject_line: `${g.subjectPrefix} — ${emp.full_name} | ${emp.employee_code}`,
        heading: g.heading, employee_name: emp.full_name, employee_code: emp.employee_code,
        designation, department, joining_date: joiningDate, location,
        reporting_manager: hrFields.reportingManager || "", status_label: "Action required",
        checklist_items: items.join("|||"), task_link: `${appBaseUrl()}/hr/tasks`,
      });
      const res = await sendStaffMail(svc, {
        to: r.email, subject: mail.subject, html: mail.html, text: mail.text,
        template: "onboarding_task_request", entityType: "employee", entityId: o.employeeId,
        actorEmail: o.actor.email, idempotencyKey: `employee-created-${g.category}-${o.employeeId}-${r.email}`,
      });
      await log(svc, o.employeeId, {
        kind: "notification", actor_label: "System",
        remark: `${g.heading} to ${r.email}: ${res.sent ? "sent" : res.skipped ? "already sent" : `failed — ${res.error}`}`,
      });
    }
  }
}

/** Overall onboarding status — always computed from the actual task rows,
    never a stored flag, so it can't drift out of sync with what was really
    completed. A task marked Not Required counts as resolved, same as
    Completed — it was deliberately excluded, not left undone. */
export function deriveOnboardingStatus(tasks: { category: string; required: boolean; status: string }[]): string {
  if (!tasks.length) return "employee_created";
  const required = tasks.filter((t) => t.required);
  const resolved = (s: string) => s === "completed" || s === "not_required";
  if (tasks.some((t) => t.status === "blocked")) return "blocked";
  const accountsIt = required.filter((t) => t.category === "accounts_it");
  const arrangements = required.filter((t) => t.category === "joining_arrangements");
  const done = (list: typeof tasks) => list.length > 0 && list.every((t) => resolved(t.status));
  const accountsItDone = done(accountsIt);
  const arrangementsDone = done(arrangements);
  if (accountsItDone && arrangementsDone) return "completed";
  if (!accountsItDone && !arrangementsDone) return required.some((t) => t.status !== "not_started") ? "partially_completed" : "awaiting_accounts_it";
  return "partially_completed";
}
