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

// Resolve the signed-in profile (id + role) or null.
export async function currentProfile(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const svc = serviceClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData.user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("id, email, full_name, role, active, must_change_password")
    .eq("id", userData.user.id)
    .single();
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

// Staff-only roles in this app (never a candidate's own role — see
// handle_new_user, which only ever assigns these from the staff_invites
// allow-list; every other signed-in person, including an anonymous session, is
// 'candidate'). Used as a defense-in-depth check in candidate-only endpoints:
// the frontend now runs Talent Acquisition and the Jobs Portal on two
// completely separate Supabase sessions (see src/lib/supabase.js) so a staff
// JWT should never even reach these functions, but a caller isn't limited to
// this app's own frontend — refuse explicitly rather than trust that alone.
const STAFF_ROLES = new Set(["ta", "admin_ta", "admin"]);
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role);
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
