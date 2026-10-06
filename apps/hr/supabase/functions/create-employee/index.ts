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
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { ensureEmployee } from "../_shared/employee.ts";

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

  try {
    const { employee, syncedToRecruitment } = await ensureEmployee(svc, onboardingCase.id,
      { id: profile.id, label: profile.full_name ?? profile.email },
      { joiningDate: body.joiningDate, department: body.department, designation: body.designation });
    return ok({ employee, syncedToRecruitment });
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message || "Could not create the employee record.", 500);
  }
});
