// POST /functions/v1/google-connection
// Tells the signed-in person whether their Google account is connected for
// sending email / creating Meet links, so the portal can offer "Connect Google"
// once instead of asking for those permissions at every sign-in. Never returns
// the token itself.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { companyMailConfigured } from "../_shared/companyMail.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "Sign in required.", 403);

  const svc = serviceClient();
  const { data } = await svc.from("google_oauth_tokens").select("scope, updated_at").eq("profile_id", me.id).maybeSingle();
  const { data: mail } = await svc.from("user_mail_credentials").select("profile_id").eq("profile_id", me.id).maybeSingle();
  return ok({
    connected: !!data,
    calendar: !!data?.scope && data.scope.includes("calendar"),
    // When a company mailbox is configured, email needs no personal Gmail connection.
    mailConfigured: companyMailConfigured(),
    // The person saved their own App Password (Settings -> Email).
    mailSaved: !!mail,
  });
});
