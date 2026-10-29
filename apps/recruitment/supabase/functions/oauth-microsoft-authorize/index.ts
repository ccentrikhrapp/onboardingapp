// POST /functions/v1/oauth-microsoft-authorize
// Returns the Microsoft consent URL for the signed-in TA to connect their
// Microsoft account for Teams meeting creation. The caller redirects the
// whole page to it — see oauth-microsoft-callback for the return trip.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile } from "../_shared/supabase.ts";
import { buildAuthorizeUrl } from "../_shared/microsoftGraph.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("FORBIDDEN", "Sign in required.", 403);

  const url = buildAuthorizeUrl(profile.id);
  if (!url) {
    return fail("NOT_CONFIGURED", "Microsoft sign-in isn't configured yet. Add MICROSOFT_CLIENT_ID to the project's secrets.", 500);
  }
  return ok({ url });
});
