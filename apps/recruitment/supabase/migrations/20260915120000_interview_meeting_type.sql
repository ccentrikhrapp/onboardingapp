-- Interview rounds can now be Virtual (Teams/Google Meet, link auto-generated)
-- or In-Person (physical location) — see ScheduleInterviewModal.jsx and
-- supabase/functions/_shared/meetingProviders.ts. Existing rows default to
-- 'virtual' since every round scheduled before this migration was an online
-- meeting.
alter table interview_rounds
  add column if not exists meeting_type text not null default 'virtual'
    check (meeting_type in ('virtual', 'in_person')),
  add column if not exists meeting_platform text
    check (meeting_platform in ('teams', 'google_meet')),
  add column if not exists location_details text;
