// POST /functions/v1/claim-application
// Auth: the candidate's OWN (real, signed-in) session.
//
// Reattaches an application that was submitted anonymously — before the
// candidate signed up/in with Google — to their now-real candidate account,
// so "sign up with Google after applying" never leaves the application
// orphaned under a throwaway anonymous auth.users row. Gated by an email
// match: the application's own candidate email must match the signed-in
// profile's email (case-insensitive), so this can only ever claim an
// application that genuinely belongs to the caller.
//
// Body: { applicationId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !profile.email) return fail("UNAUTHENTICATED", "Please sign in.", 401);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.applicationId) return fail("VALIDATION_ERROR", "Missing application.", 422);

  const svc = serviceClient();
  const { data: application } = await svc
    .from("applications")
    .select("id, candidate_id, personal, candidates(id, profile_id, email)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!application) return fail("NOT_FOUND", "Application not found.", 404);

  const appCandidate = application.candidates as any;
  const personal = (application.personal as any) ?? {};
  const applicationEmail = (appCandidate?.email || personal.email || "").toLowerCase();
  if (!applicationEmail || applicationEmail !== profile.email.toLowerCase()) {
    return fail("FORBIDDEN", "This application does not belong to your account.", 403);
  }
  if (appCandidate?.profile_id === profile.id) {
    return ok({ claimed: false, alreadyOwned: true }); // nothing to do — already theirs
  }

  // The caller's own candidate row — same upsert-by-profile_id pattern
  // submit-application uses, so a candidate who never had one yet (signed up
  // fresh via Google, hasn't submitted anything under this identity before)
  // gets one created from the application's own submitted details.
  const { data: ownCandidate, error: candErr } = await svc
    .from("candidates")
    .upsert(
      {
        profile_id: profile.id,
        first_name: personal.firstName ?? null,
        last_name: personal.lastName ?? null,
        email: profile.email,
        phone: personal.mobile ?? null,
        current_location: personal.currentLocation ?? null,
      },
      { onConflict: "profile_id" },
    )
    .select("id, candidate_code")
    .single();
  if (candErr || !ownCandidate) return fail("DB_ERROR", "Could not link this application to your account.", 500);

  const { error: upErr } = await svc
    .from("applications")
    .update({ candidate_id: ownCandidate.id })
    .eq("id", application.id);
  if (upErr) return fail("DB_ERROR", "Could not link this application to your account.", 500);

  return ok({ claimed: true, candidateId: ownCandidate.id, candidateCode: ownCandidate.candidate_code });
});
