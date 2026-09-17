// POST /functions/v1/request-onboarding-documents
// Auth: hr/admin. HR picks which onboarding documents to collect from a
// Pre-Employee (defaults to every active catalog item) and this creates the
// per-case rows here, then asks the recruitment app to collect them from
// the candidate (who authenticates there, not in this project).
//
// Body: { onboardingCaseId, requirementIds? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("FORBIDDEN", "HR access required.", 403);

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
    .select("id, source_application_id, status")
    .eq("id", body.onboardingCaseId)
    .maybeSingle();
  if (!onboardingCase) return fail("NOT_FOUND", "Onboarding case not found.", 404);

  let reqQuery = svc.from("onboarding_document_requirements").select("id, key, name, required, field_schema").eq("active", true);
  if (Array.isArray(body.requirementIds) && body.requirementIds.length > 0) {
    reqQuery = reqQuery.in("id", body.requirementIds);
  }
  const { data: requirements } = await reqQuery.order("display_order");
  if (!requirements || requirements.length === 0) return fail("VALIDATION_ERROR", "No document requirements to request.", 422);

  const { data: docs, error: insErr } = await svc
    .from("onboarding_documents")
    .upsert(
      requirements.map((r) => ({
        onboarding_case_id: onboardingCase.id,
        requirement_id: r.id,
        source_application_id: onboardingCase.source_application_id,
        status: "requested",
      })),
      { onConflict: "onboarding_case_id,requirement_id", ignoreDuplicates: true },
    )
    .select("id, requirement_id");
  if (insErr) return fail("DB_ERROR", "Could not create the document requests.", 500);

  if (onboardingCase.status === "onboarding_initiated" || onboardingCase.status === "not_started") {
    await svc.from("onboarding_cases").update({ status: "documents_pending" }).eq("id", onboardingCase.id);
  }

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? profile.email,
    action: "onboarding.request_documents",
    entity_type: "onboarding_case",
    entity_id: onboardingCase.id,
    new_state: { requirementCount: requirements.length },
  });

  // Ask the recruitment app to collect these from the candidate. We need the
  // full requirement info alongside each created row's id (the correlation
  // key both sides use from here on).
  const byReqId = new Map(requirements.map((r) => [r.id, r]));
  const allDocs = docs && docs.length > 0
    ? docs
    : (await svc.from("onboarding_documents").select("id, requirement_id").eq("onboarding_case_id", onboardingCase.id)).data ?? [];

  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  // See verify-document for why the anon key is also sent: it satisfies
  // Supabase's own gateway JWT check without weakening it, independent of our
  // X-Integration-Secret check below.
  const recruitmentAnonKey = Deno.env.get("RECRUITMENT_ANON_KEY");
  let notifiedRecruitment = false;
  if (baseUrl && secret) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-onboarding-requested`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Secret": secret,
          ...(recruitmentAnonKey ? { Authorization: `Bearer ${recruitmentAnonKey}`, apikey: recruitmentAnonKey } : {}),
        },
        body: JSON.stringify({
          eventId: `onboarding-req-${onboardingCase.id}-${Date.now()}`,
          applicationId: onboardingCase.source_application_id,
          hrCaseId: onboardingCase.id,
          requestedBy: profile.full_name ?? profile.email,
          requestedByEmail: profile.email,
          requirements: allDocs
            .filter((d) => byReqId.has(d.requirement_id))
            .map((d) => ({
              hrDocumentId: d.id,
              key: byReqId.get(d.requirement_id)!.key,
              name: byReqId.get(d.requirement_id)!.name,
              required: byReqId.get(d.requirement_id)!.required,
              fieldSchema: byReqId.get(d.requirement_id)!.field_schema ?? null,
            })),
        }),
      });
      notifiedRecruitment = res.ok;
    } catch {
      notifiedRecruitment = false;
    }
  }

  return ok({ requested: allDocs.length, notifiedRecruitment });
});
