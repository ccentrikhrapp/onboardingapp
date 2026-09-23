import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Sends an email through a specific person's own Gmail account (the one
// they signed in with), rather than a shared mailbox — the refresh token
// captured at sign-in (see store-google-token) is exchanged for a fresh
// access token here, since access tokens only last about an hour and we
// don't keep one lying around.

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type InlineImage = { cid: string; mimeType: string; base64: string; filename?: string };

// UTF-8 -> base64, wrapped at 76 columns as MIME requires.
function b64Body(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

// RFC 2822 message: plain + HTML alternative parts (base64 so any UTF-8 name
// or symbol is safe). With inline images the alternative is wrapped in
// multipart/related so <img src="cid:..."> resolves inside the email itself.
function buildMime(opts: {
  from: string; to: string; subject: string; html: string; text: string; inline?: InlineImage[];
}): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  const alt = `alt_${id}`;
  const rel = `rel_${id}`;
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const altPart = [
    `--${alt}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64Body(opts.text || " "),
    ``,
    `--${alt}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64Body(opts.html),
    ``,
    `--${alt}--`,
  ];
  const head = [`From: ${opts.from}`, `To: ${opts.to}`, `Subject: ${encodedSubject}`, `MIME-Version: 1.0`];

  if (!opts.inline?.length) {
    return [...head, `Content-Type: multipart/alternative; boundary="${alt}"`, ``, ...altPart].join("\r\n");
  }
  const images = opts.inline.flatMap((img) => [
    `--${rel}`,
    `Content-Type: ${img.mimeType}; name="${img.filename ?? img.cid}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-ID: <${img.cid}>`,
    `Content-Disposition: inline; filename="${img.filename ?? img.cid}"`,
    ``,
    (img.base64.match(/.{1,76}/g) ?? []).join("\r\n"),
    ``,
  ]);
  return [
    ...head,
    `Content-Type: multipart/related; boundary="${rel}"`,
    ``,
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    ``,
    ...altPart,
    ``,
    ...images,
    `--${rel}--`,
  ].join("\r\n");
}

export type GmailSendResult =
  | { sent: true; from: string }
  | { sent: false; reason: "no_token" | "refresh_failed" | "send_failed"; detail?: string };

// actorEmail (not actorProfileId): recruitment and HR are separate Supabase
// projects, each with their own profile UUIDs for the same physical person,
// so profile_id can't be used to match a token captured in the other
// project. Email is the one identifier that's consistent across both, and
// it's what HR's integration payloads already carry for whoever triggered
// the action. Returns { sent: false, reason: "no_token" } rather than
// throwing when that person hasn't connected Gmail send access yet (e.g.
// they only ever used password sign-in), so callers can fall back.
export async function sendGmailAsActor(
  svc: SupabaseClient,
  opts: { actorEmail: string; to: string; subject: string; html: string; text?: string; inlineImages?: InlineImage[] },
): Promise<GmailSendResult> {
  const { data: tok } = await svc
    .from("google_oauth_tokens")
    .select("google_email, refresh_token")
    .eq("google_email", opts.actorEmail)
    .maybeSingle();
  if (!tok) return { sent: false, reason: "no_token" };

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { sent: false, reason: "refresh_failed", detail: "OAuth client not configured" };

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) return { sent: false, reason: "refresh_failed", detail: await tokenRes.text() };
  const { access_token } = await tokenRes.json();

  const mime = buildMime({ from: tok.google_email, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text ?? "", inline: opts.inlineImages });
  const raw = base64url(new TextEncoder().encode(mime));

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!sendRes.ok) return { sent: false, reason: "send_failed", detail: await sendRes.text() };

  return { sent: true, from: tok.google_email };
}
