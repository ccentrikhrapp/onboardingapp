// POST /functions/v1/set-candidate-type
// Disabled: the candidate self-correction this endpoint used to offer ("I am
// a Fresher" / "I am an Experienced Professional") has been removed from the
// UI — candidateType is now exclusively derived from the experience the
// candidate already gave at application time (application-decision's
// request_documents action), so there's one source of truth instead of two
// that could drift apart. Kept as a stub (rather than deleted) so a stale
// client or direct call gets a clear rejection instead of a 404 — matching
// the app's "don't rely only on hiding the button" pattern elsewhere.
//
// Body: { applicationId, candidateType: 'fresher' | 'experienced' }

import { fail, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  return fail(
    "NOT_ALLOWED",
    "Your candidate type is set automatically from your application and can't be changed here.",
    403,
  );
});
