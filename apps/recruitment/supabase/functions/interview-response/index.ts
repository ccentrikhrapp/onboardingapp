// GET /functions/v1/interview-response?token=...&action=accept|decline|reschedule
//
// One-click candidate response straight from the interview-invitation
// email — no login, so the unguessable response_token (not the round's own
// id) is what authorizes this. Renders a plain HTML confirmation page
// directly (this is opened in a browser from an email link, never called by
// the app itself), and notifies the assigned TA either way.

import { preflight, corsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify } from "../_shared/workflow.ts";

const ACTION_META: Record<string, { response: string; heading: string; message: string; eventTitle: string; notifyTitle: string }> = {
  accept: {
    response: "accepted",
    heading: "You're all set",
    message: "Thanks for confirming — we've let the recruiting team know you'll be there.",
    eventTitle: "Candidate Confirmed Interview",
    notifyTitle: "Candidate confirmed the interview",
  },
  decline: {
    response: "declined",
    heading: "Got it",
    message: "We've let the recruiting team know this time doesn't work — they'll be in touch to reschedule.",
    eventTitle: "Candidate Declined Interview",
    notifyTitle: "Candidate declined the interview",
  },
  reschedule: {
    response: "reschedule_requested",
    heading: "Reschedule request received",
    message: "We've asked the recruiting team to reach out and find a new time that works for you.",
    eventTitle: "Candidate Requested Reschedule",
    notifyTitle: "Candidate asked to reschedule the interview",
  },
};

function page(heading: string, message: string, tone: "good" | "bad" = "good"): Response {
  const color = tone === "good" ? "#16a34a" : "#dc2626";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
    <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:32px;text-align:center">
      <div style="width:48px;height:48px;border-radius:999px;background:${color}1a;color:${color};display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">✓</div>
      <h1 style="margin:0 0 8px;font-size:18px;color:#0f1729">${heading}</h1>
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5">${message}</p>
    </div>
  </body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  const meta = action ? ACTION_META[action] : null;
  if (!token || !meta) {
    return page("Link not valid", "This response link is missing or malformed. Please use the link from your interview email.", "bad");
  }

  const svc = serviceClient();
  const { data: round } = await svc
    .from("interview_rounds")
    .select("id, name, application_id, candidate_response, applications(assigned_ta_id, personal, jobs(title))")
    .eq("response_token", token)
    .maybeSingle();
  if (!round) {
    return page("Link not valid", "This response link has expired or is no longer valid.", "bad");
  }

  const app = round.applications as any;
  // Same button clicked again (or an email link opened twice): the response is
  // already recorded, so don't write a second event or notify the TA again.
  if (round.candidate_response === meta.response) {
    return page(meta.heading, meta.message);
  }

  await svc
    .from("interview_rounds")
    .update({ candidate_response: meta.response, responded_at: new Date().toISOString() })
    .eq("id", round.id);

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

  return page(meta.heading, meta.message);
});
