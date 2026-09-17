// POST /functions/v1/generate-meeting-link
// Auth: ta/admin. Thin wrapper around _shared/meetingProviders.ts so the
// Schedule Interview modal can show the real (or, today, mock) link before
// the TA commits to scheduling — the exact same function schedule-interview
// falls back to if a round is ever submitted without one.
//
// Body: { platform: 'teams' | 'google_meet', roundName?, scheduledAt?, durationMinutes? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { createMeetingLink, MeetingPlatform } from "../_shared/meetingProviders.ts";

const PLATFORMS = ["teams", "google_meet"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can generate a meeting link.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  if (!PLATFORMS.includes(body.platform)) {
    return fail("VALIDATION_ERROR", "Choose Microsoft Teams or Google Meet.", 422, { platform: "Choose a meeting platform." });
  }

  const result = await createMeetingLink(
    body.platform as MeetingPlatform,
    {
      roundName: body.roundName ?? "Interview",
      scheduledAt: body.scheduledAt ?? new Date().toISOString(),
      durationMinutes: body.durationMinutes,
      actorEmail: profile.email ?? undefined,
    },
    serviceClient(),
  );

  return ok(result);
});
