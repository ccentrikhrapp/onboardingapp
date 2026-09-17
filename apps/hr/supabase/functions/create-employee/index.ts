// POST /functions/v1/create-employee
// Auth: hr/admin. The single point where a Pre-Employee officially becomes
// an Employee — moved server-side (this used to be a plain client insert in
// src/api/onboarding.js) so the "all required onboarding documents must be
// verified" gate is actually enforced, not just a disabled button in the UI.
// Also closes the loop back to the recruitment app so the application's own
// status can leave the active pipeline (see integration-employee-created).
//
// Body: { onboardingCaseId, joiningDate?, department?, designation? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["hr", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "HR access required.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.onboardingCaseId) return fail("VALIDATION_ERROR", "Missing onboarding case.", 422);

  const svc = serviceClient();

  const { data: onboardingCase } = await svc
    .from("onboarding_cases")
    .select("id, source_application_id, candidate_name, candidate_email, department, designation, joining_date, status")
    .eq("id", body.onboardingCaseId)
    .maybeSingle();
  if (!onboardingCase) return fail("NOT_FOUND", "Onboarding case not found.", 404);
  if (onboardingCase.status === "employee_created") {
    return fail("ALREADY_DONE", "This candidate has already been converted to an employee.", 409);
  }

  const { data: docs } = await svc
    .from("onboarding_documents")
    .select("status, requirement:onboarding_document_requirements(required)")
    .eq("onboarding_case_id", onboardingCase.id);
  const stillPending = !docs?.length || docs.some((d: any) => d.requirement?.required !== false && d.status !== "verified");
  if (stillPending) {
    return fail("DOCS_NOT_VERIFIED", "All required onboarding documents must be verified before creating the employee record.", 409);
  }

  const designation = body.designation || onboardingCase.designation;

  const { data: employee, error: empErr } = await svc
    .from("employees")
    .insert({
      onboarding_case_id: onboardingCase.id,
      full_name: onboardingCase.candidate_name,
      email: onboardingCase.candidate_email,
      department: body.department || onboardingCase.department,
      designation,
      joining_date: body.joiningDate || onboardingCase.joining_date,
    })
    .select("*")
    .single();
  if (empErr || !employee) return fail("DB_ERROR", "Could not create the employee record.", 500);

  await svc.from("onboarding_cases").update({ status: "employee_created" }).eq("id", onboardingCase.id);

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? profile.email,
    action: "onboarding.create_employee",
    entity_type: "onboarding_case",
    entity_id: onboardingCase.id,
    new_state: { employeeId: employee.id, employeeCode: employee.employee_code },
  });

  // Best-effort: the employee record is already durably created above even
  // if this call fails — same pattern as every other cross-project return
  // leg in this app (e.g. verify-document's sync back to recruitment).
  let syncedToRecruitment = false;
  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  const recruitmentAnonKey = Deno.env.get("RECRUITMENT_ANON_KEY");
  if (baseUrl && secret && onboardingCase.source_application_id) {
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
          sourceApplicationId: onboardingCase.source_application_id,
          employeeCode: employee.employee_code,
          designation,
          reviewedBy: profile.full_name ?? profile.email,
        }),
      });
      syncedToRecruitment = res.ok;
    } catch {
      syncedToRecruitment = false;
    }
  }

  return ok({ employee, syncedToRecruitment });
});
