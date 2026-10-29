// POST /functions/v1/microsoft-connection
// Tells the signed-in person whether their Microsoft account is connected
// for creating Teams meeting links. Mirrors google-connection. Never returns
// the token itself.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "Sign in required.", 403);

  const svc = serviceClient();
  const { data } = await svc.from("microsoft_oauth_tokens").select("microsoft_email, updated_at").eq("profile_id", me.id).maybeSingle();
  return ok({ connected: !!data, email: data?.microsoft_email ?? null });
});
