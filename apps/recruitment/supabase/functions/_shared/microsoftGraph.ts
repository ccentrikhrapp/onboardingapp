// Microsoft (Teams) OAuth + Graph API — mirrors googleCalendar.ts's shape,
// but Teams has no equivalent to "already signed in with Google" to piggyback
// on (staff sign in with Google or a password only), so this is its own
// standalone authorization-code flow, stored in microsoft_oauth_tokens.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const GRAPH_SCOPES = "offline_access https://graph.microsoft.com/OnlineMeetings.ReadWrite https://graph.microsoft.com/User.Read";

function tenant(): string {
  return Deno.env.get("MICROSOFT_TENANT_ID") || "common";
}

function redirectUri(): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base}/functions/v1/oauth-microsoft-callback`;
}

// profileId is carried through the redirect round-trip inside `state` — a
// random nonce is mixed in so the value isn't a guessable, replayable token.
export function encodeState(profileId: string): string {
  const nonce = crypto.randomUUID();
  return btoa(JSON.stringify({ profileId, nonce })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(state: string): { profileId: string } | null {
  try {
    const padded = state.replace(/-/g, "+").replace(/_/g, "/").padEnd(state.length + ((4 - (state.length % 4)) % 4), "=");
    const parsed = JSON.parse(atob(padded));
    return typeof parsed?.profileId === "string" ? { profileId: parsed.profileId } : null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(profileId: string): string | null {
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state: encodeState(profileId),
    prompt: "consent",
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: GRAPH_SCOPES,
    }),
  });
  return res.json();
}

async function refreshAccessToken(svc: SupabaseClient, row: { profile_id: string; refresh_token: string | null }): Promise<string | null> {
  if (!row.refresh_token) return null;
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
      scope: GRAPH_SCOPES,
    }),
  });
  if (!res.ok) return null;
  const data: TokenResponse = await res.json();
  if (!data.access_token) return null;
  const expires_at = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  await svc.from("microsoft_oauth_tokens").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? row.refresh_token,
    expires_at,
    updated_at: new Date().toISOString(),
  }).eq("profile_id", row.profile_id);
  return data.access_token;
}

// Valid access token for this person's stored Microsoft connection, refreshing
// it first if it's expired (or about to be) — or null if not connected / the
// refresh failed, so callers fall back to the mock link generator.
async function getValidAccessToken(svc: SupabaseClient, actorEmail: string): Promise<{ accessToken: string; profileId: string } | null> {
  const { data: row } = await svc
    .from("microsoft_oauth_tokens")
    .select("profile_id, access_token, refresh_token, expires_at")
    .eq("microsoft_email", actorEmail)
    .maybeSingle();
  if (!row) return null;

  const stillValid = row.expires_at && new Date(row.expires_at) > new Date(Date.now() + 120_000);
  if (stillValid) return { accessToken: row.access_token, profileId: row.profile_id };

  const refreshed = await refreshAccessToken(svc, row);
  if (!refreshed) return null;
  return { accessToken: refreshed, profileId: row.profile_id };
}

export type TeamsMeetingResult = { url: string; meetingId: string } | null;

// Creates a real Teams online meeting via Graph (POST /me/onlineMeetings) on
// the scheduling TA's own connected Microsoft account. Returns null when
// they haven't connected one yet, so the caller falls back to the mock link.
export async function createTeamsOnlineMeeting(
  svc: SupabaseClient,
  opts: { actorEmail: string; subject: string; startISO: string; endISO: string },
): Promise<TeamsMeetingResult> {
  const auth = await getValidAccessToken(svc, opts.actorEmail);
  if (!auth) return null;

  const res = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: opts.subject,
      startDateTime: opts.startISO,
      endDateTime: opts.endISO,
    }),
  });
  if (!res.ok) return null;
  const meeting = await res.json();
  if (!meeting.joinWebUrl) return null;
  return { url: meeting.joinWebUrl, meetingId: meeting.id };
}
