// Virtual-meeting link generation, isolated behind one function per platform
// so a real Microsoft Graph (Teams) or Google Calendar (Meet) API call can
// replace the body of either function later without touching any caller —
// the modal, schedule-interview, and generate-meeting-link all go through
// this file only.
//
// Google Meet: real, live — creates an actual Calendar event (with a real
// Meet link) on the scheduling TA's own Google Calendar, via the same
// per-user OAuth connection used for Gmail sending (see gmailSend.ts). Only
// falls back to a mock link if that TA hasn't connected Google (e.g. they
// only ever used password sign-in).
//
// Teams: real, live — creates an actual Teams online meeting via Microsoft
// Graph on the scheduling TA's own connected Microsoft account (see
// microsoftGraph.ts, connected from Settings the same way Google is). Only
// falls back to a mock link if they haven't connected Microsoft yet, or
// MICROSOFT_CLIENT_ID/SECRET aren't configured on this project at all.

import { createGoogleMeetEvent } from "./googleCalendar.ts";
import { createTeamsOnlineMeeting } from "./microsoftGraph.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type MeetingPlatform = "teams" | "google_meet";

export type MeetingLinkResult = {
  url: string;
  platform: MeetingPlatform;
  mocked: boolean;
};

function mockToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

async function createTeamsMeeting(
  svc: SupabaseClient | undefined,
  opts: { roundName: string; scheduledAt: string; durationMinutes?: number; actorEmail?: string },
): Promise<MeetingLinkResult> {
  if (svc && opts.actorEmail && Deno.env.get("MICROSOFT_CLIENT_ID") && Deno.env.get("MICROSOFT_CLIENT_SECRET")) {
    const start = new Date(opts.scheduledAt);
    const end = new Date(start.getTime() + (opts.durationMinutes ?? 30) * 60_000);
    const meeting = await createTeamsOnlineMeeting(svc, {
      actorEmail: opts.actorEmail,
      subject: opts.roundName,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    });
    if (meeting) return { url: meeting.url, platform: "teams", mocked: false };
  }
  // Fallback — Microsoft isn't configured yet, or this TA hasn't connected
  // their account. A structurally-valid placeholder keeps the form usable,
  // but every caller treats `mocked: true` as "do not send this to anyone".
  const token = mockToken();
  return { url: `https://teams.microsoft.com/l/meetup-join/${token}`, platform: "teams", mocked: true };
}

async function createGoogleMeet(
  svc: SupabaseClient | undefined,
  opts: { roundName: string; scheduledAt: string; durationMinutes?: number; actorEmail?: string },
): Promise<MeetingLinkResult> {
  if (svc && opts.actorEmail) {
    const start = new Date(opts.scheduledAt);
    const end = new Date(start.getTime() + (opts.durationMinutes ?? 30) * 60_000);
    const event = await createGoogleMeetEvent(svc, {
      actorEmail: opts.actorEmail,
      summary: opts.roundName,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    });
    if (event) return { url: event.url, platform: "google_meet", mocked: false };
  }
  // Fallback — the TA scheduling this hasn't connected their Google account
  // (still possible with password-only sign-in), so a structurally-valid
  // placeholder link keeps the workflow moving rather than blocking it.
  const t = mockToken();
  return { url: `https://meet.google.com/${t.slice(0, 3)}-${t.slice(3, 7)}-${t.slice(7, 10)}`, platform: "google_meet", mocked: true };
}

export async function createMeetingLink(
  platform: MeetingPlatform,
  opts: { roundName: string; scheduledAt: string; durationMinutes?: number; actorEmail?: string },
  svc?: SupabaseClient,
): Promise<MeetingLinkResult> {
  return platform === "teams" ? createTeamsMeeting(svc, opts) : createGoogleMeet(svc, opts);
}
