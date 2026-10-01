// POST /functions/v1/integration-document-summary
// Inbound from the recruitment app: the current picture of a candidate's pre-offer
// documentation — what applies to them and how far along it is. Service-to-service
// only; idempotent (it just overwrites the latest summary).
//
// Body: { eventId, sourceApplicationId, candidate: { name, email }, employmentType, previousEmployers, summary }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  if (!body.sourceApplicationId || typeof body.summary !== "object") return fail("VALIDATION_ERROR", "Missing fields.", 422);

  const { error } = await serviceClient().from("verification_summaries").upsert({
    source_application_id: body.sourceApplicationId,
    candidate_name: body.candidate?.name ?? null,
    candidate_email: body.candidate?.email ?? null,
    employment_type: body.employmentType ?? null,
    previous_employers: Number.isInteger(body.previousEmployers) ? body.previousEmployers : null,
    summary: body.summary,
    updated_at: new Date().toISOString(),
  }, { onConflict: "source_application_id" });
  if (error) return fail("DB_ERROR", "Could not store the summary.", 500);
  return ok({ received: true });
});
