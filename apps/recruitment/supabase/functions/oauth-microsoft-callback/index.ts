// GET /functions/v1/oauth-microsoft-callback
// Microsoft redirects the browser here after consent. No Authorization
// header arrives on this hop (it's a plain browser redirect, not a fetch
// from the app) — the signed-in person is instead recovered from `state`,
// which oauth-microsoft-authorize minted for exactly this profile id.

import { corsHeaders, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { decodeState, exchangeCodeForTokens } from "../_shared/microsoftGraph.ts";

function redirectTo(path: string): Response {
  const base = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173";
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${base}${path}` } });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code || !state) {
    return redirectTo(`/ta/settings?teams_error=${encodeURIComponent(oauthError || "missing_code")}`);
  }

  const decoded = decodeState(state);
  if (!decoded) return redirectTo("/ta/settings?teams_error=invalid_state");

  const tokenData = await exchangeCodeForTokens(code);
  if (!tokenData.access_token) {
    console.error("Microsoft token exchange failed:", tokenData);
    return redirectTo(`/ta/settings?teams_error=${encodeURIComponent(tokenData.error || "token_exchange_failed")}`);
  }

  let email: string | null = null;
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meJson = await me.json();
    email = meJson.mail || meJson.userPrincipalName || null;
  } catch { /* non-fatal — stored without email means lookups by email won't match, but the row still exists */ }

  if (!email) return redirectTo("/ta/settings?teams_error=no_email");

  const svc = serviceClient();
  const expires_at = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;
  const { error } = await svc.from("microsoft_oauth_tokens").upsert(
    {
      profile_id: decoded.profileId,
      microsoft_email: email,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at,
      scope: "OnlineMeetings.ReadWrite User.Read offline_access",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) {
    console.error("Could not store Microsoft token:", error.message);
    return redirectTo("/ta/settings?teams_error=storage_failed");
  }

  return redirectTo("/ta/settings?teams_connected=1");
});
