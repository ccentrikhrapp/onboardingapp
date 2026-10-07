import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Creates a real Google Calendar event (with a real, working Meet link) on
// the given person's own calendar — reuses the exact same OAuth grant as
// gmailSend.ts (the Google connection captured at sign-in), just with the
// calendar.events scope instead of gmail.send. Returns null when that
// person hasn't connected Google Calendar access yet, so callers can fall
// back to the mock link generator.

export type CalendarEventResult = { url: string; eventId: string } | null;

export async function createGoogleMeetEvent(
  svc: SupabaseClient,
  opts: { actorEmail: string; summary: string; description?: string; startISO: string; endISO: string },
): Promise<CalendarEventResult> {
  const { data: tok } = await svc
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("google_email", opts.actorEmail)
    .maybeSingle();
  if (!tok) return null;

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

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
  if (!tokenRes.ok) return null;
  const { access_token } = await tokenRes.json();

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: opts.summary,
        description: opts.description ?? "",
        // startISO/endISO already carry their own offset (a "Z" UTC instant),
        // so the event time itself is correct either way — timeZone is set so
        // Calendar always labels it India time, not whatever zone the
        // invitee's own calendar defaults to showing it in.
        start: { dateTime: opts.startISO, timeZone: "Asia/Kolkata" },
        end: { dateTime: opts.endISO, timeZone: "Asia/Kolkata" },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
  );
  if (!res.ok) return null;
  const event = await res.json();
  const meetLink = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;
  if (!meetLink) return null;

  return { url: meetLink, eventId: event.id };
}
