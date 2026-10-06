import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Full-access client — bypasses RLS. Use only after checking authorization
// yourself in the function.
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client scoped to the caller's JWT — every query still runs under RLS.
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The "sub" (user id) written in a JWT, without verifying it — see currentProfile.
function tokenSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const sub = JSON.parse(atob(payload)).sub;
    return typeof sub === "string" && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

// Resolve the signed-in profile (id + role) or null.
export async function currentProfile(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const svc = serviceClient();
  const token = authHeader.replace("Bearer ", "");
  // The token's user id is read first so the profile can be fetched while
  // Supabase verifies the token — one round trip of waiting instead of two.
  // Nothing is trusted from the unverified read: the profile is only used
  // once getUser() has confirmed the token and that it is the same user.
  const claimedId = tokenSubject(token);
  if (!claimedId) return null;
  const [{ data: userData, error }, { data: profile }] = await Promise.all([
    svc.auth.getUser(token),
    svc.from("profiles").select("id, email, full_name, role, active, must_change_password").eq("id", claimedId).maybeSingle(),
  ]);
  if (error || !userData.user || userData.user.id !== claimedId) return null;
  // A disabled account is treated as signed out by every function — the JWT
  // it already holds stays cryptographically valid until it expires, so this
  // is where "disabled users are rejected" is actually enforced server-side.
  if (!profile || profile.active === false) return null;
  // A session made with an emailed temporary password may only set the
  // permanent password (set-initial-password does its own auth) — for every
  // other function it is signed out.
  if (profile.must_change_password && sessionMethod(token) === "password") return null;
  return profile;
}

// How this session was established, from the JWT's newest "amr" entry
// ("password", "oauth", ...). getUser() already proved the token is valid.
export function sessionMethod(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.amr?.[0]?.method ?? "";
  } catch {
    return "";
  }
}

// Append an immutable audit row.
export async function audit(
  svc: SupabaseClient,
  entry: {
    actor_profile_id?: string | null;
    actor_label?: string | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    previous_state?: unknown;
    new_state?: unknown;
    remarks?: string | null;
  },
) {
  await svc.from("audit_logs").insert(entry);
}
