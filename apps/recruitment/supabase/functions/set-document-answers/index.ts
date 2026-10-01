// POST /functions/v1/set-document-answers
// Auth: the candidate who owns the application.
//
// The few facts that decide WHICH pre-offer documents apply to them, which
// their application doesn't already hold:
//   previousEmployers       how many (and which) previous employers they have  -> one set of employer documents each
//   holdingOtherOffer       "Yes" -> the other/current offer letter applies
//   permanentSameAsCurrent  "Yes" -> only one address proof is needed
//   nameChanged             "Yes" -> a name-change proof is needed
// (Fresher vs experienced comes from the experience already given on the application.)
//
// After saving, the requirement rows are re-derived: newly applicable documents
// appear, ones that stop applying become "not applicable", and anything already
// uploaded or reviewed is never removed.
//
// Body: { previousEmployers?: [{ name }], holdingOtherOffer?, permanentSameAsCurrent?, nameChanged? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { MAX_EMPLOYERS, pushSummary, syncPreOfferRows } from "../_shared/preOffer.ts";

const YESNO = ["Yes", "No"];
const PRE_OFFER = ["DOC_VERIFICATION", "DOCS_VERIFIED"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("UNAUTHENTICATED", "Please sign in.", 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }

  const svc = serviceClient();
  const { data: cand } = await svc.from("candidates").select("id").eq("profile_id", profile.id).maybeSingle();
  if (!cand) return fail("NOT_FOUND", "No application found.", 404);
  const { data: app } = await svc
    .from("applications").select("id, status, additional")
    .eq("candidate_id", cand.id).in("status", PRE_OFFER).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!app) return fail("NOT_FOUND", "Your document checklist isn't open yet.", 404);

  const fields: Record<string, string> = {};
  const answers: Record<string, unknown> = { ...((app.additional as any)?.docAnswers ?? {}) };
  for (const k of ["holdingOtherOffer", "permanentSameAsCurrent", "nameChanged"]) {
    if (body[k] === undefined) continue;
    if (!YESNO.includes(body[k])) fields[k] = "Choose Yes or No.";
    else answers[k] = body[k];
  }
  if (body.previousEmployers !== undefined) {
    const list = Array.isArray(body.previousEmployers) ? body.previousEmployers : null;
    if (!list) fields.previousEmployers = "Enter your previous employers.";
    else if (list.length > MAX_EMPLOYERS) fields.previousEmployers = `Up to ${MAX_EMPLOYERS} employers.`;
    else answers.previousEmployers = list.map((e: any) => ({ name: String(e?.name ?? "").trim().slice(0, 100) }));
  }
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please check your answers.", 422, fields);

  await svc.from("applications").update({ additional: { ...(app.additional ?? {}), docAnswers: answers } }).eq("id", app.id);
  const rows = await syncPreOfferRows(svc, app.id);
  await audit(svc, { actor_profile_id: profile.id, action: "documents.answers", entity_type: "application", entity_id: app.id, new_state: answers });
  try { await pushSummary(svc, app.id); } catch { /* best effort */ }
  return ok({ answers, documents: rows.length });
});
