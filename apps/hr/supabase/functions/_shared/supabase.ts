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
    .select("id, email, full_name, role")
    .eq("id", userData.user.id)
    .single();
  return profile ?? null;
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
