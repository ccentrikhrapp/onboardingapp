// POST /functions/v1/team-list
// Auth: Super Admin (admin) only. Returns every HR-app account with its
// invitation + login status, computed server-side (last sign-in lives in
// auth.users, which the browser can't read).

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

const TEAM_ROLES = ["admin", "hr", "accounts", "it", "office_admin"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || me.role !== "admin") return fail("FORBIDDEN", "You don't have access to Teams.", 403);

  const svc = serviceClient();
  const [{ data: profiles }, { data: invites }, { data: tokens }, usersRes] = await Promise.all([
    svc.from("profiles").select("id, email, full_name, role, active, phone, created_at, must_change_password").in("role", TEAM_ROLES).order("created_at", { ascending: false }),
    svc.from("staff_invites").select("email, role, full_name, invited_at, expires_at, last_sent_at, send_count, accepted_at"),
    svc.from("staff_invitation_tokens").select("email, expires_at").is("used_at", null),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const lastLogin = new Map<string, string | null>();
  for (const u of usersRes.data?.users ?? []) lastLogin.set((u.email ?? "").toLowerCase(), u.last_sign_in_at ?? null);
  const inviteByEmail = new Map((invites ?? []).map((i) => [i.email.toLowerCase(), i]));
  // The single-use token is the real credential, so its expiry (not the
  // invite row's copy) decides Pending vs Expired.
  const tokenExpiry = new Map<string, string>();
  for (const t of tokens ?? []) {
    const k = t.email.toLowerCase();
    const cur = tokenExpiry.get(k);
    if (!cur || new Date(t.expires_at) > new Date(cur)) tokenExpiry.set(k, t.expires_at);
  }
  const now = Date.now();

  const members = (profiles ?? []).map((p) => {
    const email = p.email.toLowerCase();
    const inv = inviteByEmail.get(email);
    const login = lastLogin.get(email) ?? null;
    let invitationStatus: "pending" | "accepted" | "active" | "expired" | "disabled";
    if (!p.active) invitationStatus = "disabled";
    else if (login && (inv?.accepted_at || !p.must_change_password)) invitationStatus = "active";
    else if (inv?.accepted_at) invitationStatus = "accepted";
    else if (inv && !(tokenExpiry.get(email) && new Date(tokenExpiry.get(email)!).getTime() >= now)) invitationStatus = "expired";
    else if (inv) invitationStatus = "pending";
    else invitationStatus = "active";
    const accountStatus = !p.active ? "DISABLED" : (invitationStatus === "pending" || invitationStatus === "expired") ? "INVITED" : "ACTIVE";
    return {
      id: p.id, email: p.email, fullName: p.full_name, role: p.role, phone: p.phone, department: null, createdAt: p.created_at,
      accountStatus, invitationStatus,
      invitedAt: inv?.invited_at ?? null, expiresAt: tokenExpiry.get(email) ?? inv?.expires_at ?? null, lastSentAt: inv?.last_sent_at ?? null, lastLoginAt: login,
    };
  });

  return ok({ actorRole: me.role, actorId: me.id, members });
});
