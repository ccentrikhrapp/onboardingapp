// POST /functions/v1/mail-settings   { action: 'get' | 'save' | 'remove', password? }
// Auth: any signed-in staff member — each person manages only their OWN mail sending.
//
// Same idea as the CRM's "Meeting Email Settings": you save your Gmail App Password once
// and the emails you trigger are sent from your own address. Differences that matter:
//   - the password is verified with a real test email BEFORE it is stored, so a wrong one
//     is never kept;
//   - it is stored in Supabase Vault (encrypted), not in a normal column;
//   - it is never returned by any action — `get` only says whether one is saved.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { friendlySmtpError, smtpSend } from "../_shared/userMail.ts";

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timed out")), ms))]);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || me.role === "candidate") return fail("FORBIDDEN", "You don't have access to email settings.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const svc = serviceClient();

  if (body.action === "get") {
    const { data } = await svc.from("user_mail_credentials").select("mail_user, updated_at").eq("profile_id", me.id).maybeSingle();
    return ok({ saved: !!data, mailUser: data?.mail_user ?? me.email, updatedAt: data?.updated_at ?? null });
  }

  if (body.action === "remove") {
    await svc.rpc("clear_user_mail_password", { p_profile: me.id });
    await audit(svc, { actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "settings.mail_remove", entity_type: "profile", entity_id: me.id });
    return ok({ saved: false });
  }

  if (body.action === "save") {
    // Google shows App Passwords as "abcd efgh ijkl mnop" — spaces are just display.
    const password = String(body.password ?? "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9]{8,64}$/.test(password)) {
      return fail("VALIDATION_ERROR", "Enter the 16-character App Password from your Google account.", 422, { password: "Enter the 16-character App Password from your Google account." });
    }
    // Prove it works: a real test email to the person themself, over the same SMTP path.
    try {
      await withTimeout(smtpSend({
        user: me.email, pass: password, fromName: me.full_name ?? "", to: me.email,
        subject: "Your Ccentrik email is connected",
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2430"><p>Hi ${(me.full_name ?? "").replace(/[<>&]/g, "")},</p><p>Your email is now connected to Ccentrik. Messages you trigger from the app (interview invitations, offers, document requests, team invitations) will be sent from <strong>${me.email}</strong>.</p><p style="color:#6b7280;font-size:12px">If you didn't do this, remove the App Password from Settings → Email and revoke it in your Google account.</p></div>`,
        text: `Your email is now connected to Ccentrik. Messages you trigger from the app will be sent from ${me.email}.`,
      }), 20000);
    } catch (e) {
      console.error("mail-settings: test send failed", String(e).slice(0, 200));
      return fail("TEST_FAILED", friendlySmtpError(e), 422, { password: friendlySmtpError(e) });
    }
    const { error } = await svc.rpc("set_user_mail_password", { p_profile: me.id, p_mail_user: me.email, p_password: password });
    if (error) return fail("DB_ERROR", "Could not save your App Password. Please try again.", 500);
    await audit(svc, { actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "settings.mail_save", entity_type: "profile", entity_id: me.id, new_state: { mailUser: me.email } });
    return ok({ saved: true, mailUser: me.email });
  }

  return fail("INVALID_REQUEST", "Unknown action.", 400);
});
