// POST /functions/v1/list-super-admins
// Auth: hr/admin only. Returns every active Super Admin (role=admin) with
// the fields the searchable selector needs — name, official email, mobile,
// designation, role. A dedicated endpoint rather than a direct client
// query against profiles, so this (phone numbers included) is only ever
// returned to staff who are actually choosing a recipient, not exposed via
// a broader profiles read policy.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !["admin", "hr"].includes(me.role)) return fail("FORBIDDEN", "HR access required.", 403);

  const svc = serviceClient();
  const { data } = await svc
    .from("profiles")
    .select("id, full_name, email, phone, designation, role")
    .eq("role", "admin")
    .eq("active", true)
    .order("full_name");

  return ok({
    admins: (data ?? []).map((p) => ({
      id: p.id, name: p.full_name || p.email, email: p.email, mobile: p.phone || null,
      designation: p.designation || null, accountType: "Super Admin", role: p.role,
    })),
  });
});
