// POST /functions/v1/store-google-token
// Called right after a Google sign-in that included the gmail.send scope +
// offline access. The client hands over the refresh token it just got from
// Supabase's session (Google only returns one when prompt=consent is used,
// so this fires once per fresh consent, not on every silent re-login) and
// this stores it so later, server-side workflow emails can be sent through
// that same person's Gmail account.
//
// Body: { refreshToken, googleEmail, scope? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("FORBIDDEN", "Sign in required.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.refreshToken || !body.googleEmail) return fail("VALIDATION_ERROR", "Missing refresh token or email.", 422);

  const svc = serviceClient();
  const { error } = await svc.from("google_oauth_tokens").upsert(
    {
      profile_id: profile.id,
      google_email: body.googleEmail,
      refresh_token: body.refreshToken,
      scope: body.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) return fail("DB_ERROR", "Could not store the token.", 500);

  return ok({ stored: true });
});
