// GET  /functions/v1/interview-response?token=...&action=accept|decline
// POST /functions/v1/interview-response   { token, action: 'decline', reason }
//
// One-click candidate response straight from the interview-invitation
// email — no login, so the unguessable response_token (not the round's own
// id) is what authorizes this. Renders a plain HTML confirmation page
// directly (this is opened in a browser from an email link, never called by
// the app itself), and notifies the assigned TA either way.
//
// Decline needs a reason, so it isn't a one-click GET like accept: the GET
// link redirects to interview-decline.html, which collects the reason and
// POSTs it back here as JSON.

import { preflight, corsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

const ACTION_META: Record<string, { response: string; headline: string; responseLabel: string; heading: string; message: string; eventTitle: string; notifyTitle: string }> = {
  accept: {
    response: "accepted",
    headline: "Interview accepted",
    responseLabel: "Accepted",
    heading: "You're all set",
    message: "Thanks for confirming — we've let the recruiting team know you'll be there.",
    eventTitle: "Candidate Confirmed Interview",
    notifyTitle: "Candidate confirmed the interview",
  },
  decline: {
    response: "declined",
    headline: "Interview declined",
    responseLabel: "Declined",
    heading: "Got it",
    message: "We've let the recruiting team know this time doesn't work — they'll be in touch to reschedule.",
    eventTitle: "Candidate Declined Interview",
    notifyTitle: "Candidate declined the interview",
  },
};

const SITE_BASE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ccentrik-recruitment.vercel.app").replace(/\/$/, "");

// Supabase serves function responses as text/plain, so HTML returned here would
// show as raw source. Redirect to the static confirmation page on the site instead.
function page(result: string): Response {
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${SITE_BASE}/interview-response.html?result=${result}` } });
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const isPost = req.method === "POST";
  // A failure response is a redirect for a browser (GET) or JSON for the
  // decline-reason page's fetch call (POST) — same meaning, different shape.
  const fail = (result: string) => (isPost ? json({ ok: false, result }, 200) : page(result));

  let token: string | null = null;
  let action: string | null = null;
  let reason = "";
  if (isPost) {
    try {
      const body = await req.json();
      token = typeof body.token === "string" ? body.token : null;
      action = typeof body.action === "string" ? body.action : "decline";
      reason = typeof body.reason === "string" ? body.reason.trim() : "";
    } catch {
      return json({ ok: false, result: "invalid" }, 400);
    }
    if (action !== "decline") return json({ ok: false, result: "invalid" }, 400);
    if (reason.length < 3) return json({ ok: false, fieldError: "Please tell us why, in a few words." }, 422);
  } else {
    const url = new URL(req.url);
    token = url.searchParams.get("token");
    action = url.searchParams.get("action");
  }

  const meta = action ? ACTION_META[action] : null;
  if (!token || !meta) return fail("invalid");

  const svc = serviceClient();
  const { data: round } = await svc
    .from("interview_rounds")
    .select("id, name, application_id, candidate_response, applications(assigned_ta_id, personal, jobs(title))")
    .eq("response_token", token)
    .maybeSingle();
  if (!round) return fail("invalid");

  // Decline needs a reason first. A GET click (no reason yet) sends the
  // candidate to the reason page instead of recording anything — but only
  // while nothing has been recorded yet; an already-answered round still
  // falls through to the normal "same answer" / "locked" handling below.
  if (!isPost && action === "decline" && !round.candidate_response) {
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${SITE_BASE}/interview-decline.html?token=${token}` } });
  }

  const app = round.applications as any;
  // One-time response: the row is only changed while no response is recorded
  // yet, so two clicks at the same moment can't both succeed. Anything after
  // the first response is refused and the stored response is left as it is.
  const { data: claimed } = await svc
    .from("interview_rounds")
    .update({
      candidate_response: meta.response,
      responded_at: new Date().toISOString(),
      ...(action === "decline" ? { candidate_response_reason: reason } : {}),
    })
    .eq("id", round.id)
    .is("candidate_response", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    const { data: current } = await svc.from("interview_rounds").select("candidate_response").eq("id", round.id).maybeSingle();
    // Same button again: show its confirmation. Any other button: locked.
    const result = current?.candidate_response === meta.response ? meta.response : "locked";
    return isPost ? json({ ok: result === meta.response, result }) : page(result);
  }

  const candidateName = `${app?.personal?.firstName ?? ""} ${app?.personal?.lastName ?? ""}`.trim();
  const jobTitle = app?.jobs?.title ?? "the role";

  await addEvent(svc, {
    application_id: round.application_id,
    type: "interview",
    title: meta.eventTitle,
    description: action === "decline" && reason ? `${round.name}: ${meta.notifyTitle.toLowerCase()} — "${reason}"` : `${round.name}: ${meta.notifyTitle.toLowerCase()}.`,
    actor_label: candidateName || "Candidate",
  });

  if (app?.assigned_ta_id) {
    await notify(svc, {
      recipient_profile_id: app.assigned_ta_id,
      title: meta.notifyTitle,
      message: action === "decline" && reason
        ? `${candidateName || "The candidate"} declined the ${round.name} interview for ${jobTitle}: "${reason}"`
        : `${candidateName || "The candidate"} responded to the ${round.name} interview for ${jobTitle}.`,
      type: "interview_response",
      entity_type: "interview_round",
      entity_id: round.id,
    });
  }

  // Same email for every response, sent to the assigned TA (no duplicate on repeat clicks — returned above).
  if (app?.assigned_ta_id) {
    const { data: ta } = await svc.from("profiles").select("email, full_name").eq("id", app.assigned_ta_id).maybeSingle();
    if (ta?.email) {
      const mail = render("interview_response_ta", {
        headline: meta.headline,
        ta_name: ta.full_name || "there",
        candidate_name: candidateName || "The candidate",
        job_title: jobTitle,
        round_name: round.name,
        response_label: meta.responseLabel,
        reason_line: action === "decline" && reason ? `<div><strong>Reason:</strong> ${reason}</div>` : "",
        reason_text: action === "decline" ? reason : "",
        responded_at: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
      });
      await queueEmail(svc, {
        recipient: ta.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "interview_response_ta", entity_type: "interview_round", entity_id: round.id,
      });
    }
  }

  return isPost ? json({ ok: true, result: meta.response }) : page(meta.response);
});
