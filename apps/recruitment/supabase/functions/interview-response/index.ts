// GET /functions/v1/interview-response?token=...&action=accept|decline
//
// One-click candidate response straight from the interview-invitation
// email — no login, so the unguessable response_token (not the round's own
// id) is what authorizes this. Renders a plain HTML confirmation page
// directly (this is opened in a browser from an email link, never called by
// the app itself), and notifies the assigned TA either way.

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

// Supabase serves function responses as text/plain, so HTML returned here would
// show as raw source. Redirect to the static confirmation page on the site instead.
function page(result: string): Response {
  const base = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ccentrik-recruitment.vercel.app").replace(/\/$/, "");
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${base}/interview-response.html?result=${result}` } });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  const meta = action ? ACTION_META[action] : null;
  if (!token || !meta) {
    return page("invalid");
  }

  const svc = serviceClient();
  const { data: round } = await svc
    .from("interview_rounds")
    .select("id, name, application_id, candidate_response, applications(assigned_ta_id, personal, jobs(title))")
    .eq("response_token", token)
    .maybeSingle();
  if (!round) {
    return page("invalid");
  }

  const app = round.applications as any;
  // One-time response: the row is only changed while no response is recorded
  // yet, so two clicks at the same moment can't both succeed. Anything after
  // the first response is refused and the stored response is left as it is.
  const { data: claimed } = await svc
    .from("interview_rounds")
    .update({ candidate_response: meta.response, responded_at: new Date().toISOString() })
    .eq("id", round.id)
    .is("candidate_response", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    const { data: current } = await svc.from("interview_rounds").select("candidate_response").eq("id", round.id).maybeSingle();
    // Same button again: show its confirmation. Any other button: locked.
    return page(current?.candidate_response === meta.response ? meta.response : "locked");
  }

  const candidateName = `${app?.personal?.firstName ?? ""} ${app?.personal?.lastName ?? ""}`.trim();
  const jobTitle = app?.jobs?.title ?? "the role";

  await addEvent(svc, {
    application_id: round.application_id,
    type: "interview",
    title: meta.eventTitle,
    description: `${round.name}: ${meta.notifyTitle.toLowerCase()}.`,
    actor_label: candidateName || "Candidate",
  });

  if (app?.assigned_ta_id) {
    await notify(svc, {
      recipient_profile_id: app.assigned_ta_id,
      title: meta.notifyTitle,
      message: `${candidateName || "The candidate"} responded to the ${round.name} interview for ${jobTitle}.`,
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
        responded_at: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
      });
      await queueEmail(svc, {
        recipient: ta.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "interview_response_ta", entity_type: "interview_round", entity_id: round.id,
      });
    }
  }

  return page(meta.response);
});
