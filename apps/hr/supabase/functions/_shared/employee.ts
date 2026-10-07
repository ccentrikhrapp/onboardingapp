// Creates the employee record for an onboarding case — once. Used by
// create-employee (the onboarding-documents route) and by joining-hr-action
// (approving joining documentation creates the employee ID in the same step).

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { audit } from "./supabase.ts";

type Actor = { id: string; label: string };
type Overrides = { joiningDate?: string; department?: string; designation?: string };

export async function ensureEmployee(svc: SupabaseClient, caseId: string, actor: Actor, overrides: Overrides = {}) {
  const findExisting = async () =>
    (await svc.from("employees").select("*").eq("onboarding_case_id", caseId).order("created_at").limit(1).maybeSingle()).data;

  const existing = await findExisting();
  if (existing) return { employee: existing, created: false, syncedToRecruitment: false };

  const { data: c } = await svc
    .from("onboarding_cases")
    .select("id, status, source_application_id, candidate_name, candidate_email, department, designation, joining_date")
    .eq("id", caseId)
    .maybeSingle();
  if (!c) throw new Error("Onboarding case not found.");

  // Claim the case first, so two clicks at the same moment can't create two employees.
  const { data: claimed } = await svc
    .from("onboarding_cases")
    .update({ status: "employee_created" })
    .eq("id", caseId)
    .neq("status", "employee_created")
    .select("id");
  if (!claimed?.length) {
    const other = await findExisting();
    if (other) return { employee: other, created: false, syncedToRecruitment: false };
    throw new Error("The employee record is being created — please refresh in a moment.");
  }

  const designation = overrides.designation || c.designation;
  const { data: employee, error } = await svc
    .from("employees")
    .insert({
      onboarding_case_id: c.id,
      full_name: c.candidate_name,
      email: c.candidate_email,
      department: overrides.department || c.department,
      designation,
      joining_date: overrides.joiningDate || c.joining_date,
    })
    .select("*")
    .single();
  if (error || !employee) {
    await svc.from("onboarding_cases").update({ status: c.status }).eq("id", c.id); // release the claim
    throw new Error("Could not create the employee record.");
  }

  await audit(svc, {
    actor_profile_id: actor.id,
    actor_label: actor.label,
    action: "onboarding.create_employee",
    entity_type: "onboarding_case",
    entity_id: c.id,
    new_state: { employeeId: employee.id, employeeCode: employee.employee_code },
  });

  // Fill the joining form's HR details from what the system already knows, so
  // nobody re-types them: the generated employee code always, and the offer's
  // designation / department / joining date where empty.
  const { data: jp } = await svc.from("joining_profiles").select("id, hr_fields").eq("onboarding_case_id", c.id).maybeSingle();
  if (jp) {
    const hr = { ...(jp.hr_fields ?? {}) } as Record<string, string>;
    hr.employeeCode = employee.employee_code;
    if (!hr.designation && employee.designation) hr.designation = employee.designation;
    if (!hr.department && employee.department) hr.department = employee.department;
    if (!hr.dateOfJoining && employee.joining_date) hr.dateOfJoining = String(employee.joining_date).slice(0, 10);
    await svc.from("joining_profiles").update({ hr_fields: hr }).eq("id", jp.id);
  }

  // Best-effort: tell the recruitment app, so the application leaves the active pipeline.
  let syncedToRecruitment = false;
  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  const recruitmentAnonKey = Deno.env.get("RECRUITMENT_ANON_KEY");
  if (baseUrl && secret && c.source_application_id) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-employee-created`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Secret": secret,
          ...(recruitmentAnonKey ? { Authorization: `Bearer ${recruitmentAnonKey}`, apikey: recruitmentAnonKey } : {}),
        },
        body: JSON.stringify({
          eventId: `employee-created-${employee.id}`,
          sourceApplicationId: c.source_application_id,
          employeeCode: employee.employee_code,
          designation,
          department: employee.department ?? null,
          joiningDate: employee.joining_date ?? null,
          reviewedBy: actor.label,
        }),
      });
      syncedToRecruitment = res.ok;
    } catch {
      syncedToRecruitment = false;
    }
  }

  return { employee, created: true, syncedToRecruitment };
}
