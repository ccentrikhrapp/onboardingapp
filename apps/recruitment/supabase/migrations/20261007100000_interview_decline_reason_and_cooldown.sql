-- Candidate's reason for declining an interview (collected before the
-- decline is recorded — see interview-response).
alter table public.interview_rounds add column candidate_response_reason text;

-- TA can "freeze" a candidate's application for a cooldown period (default
-- 90 days) after a decline, instead of rescheduling straight away.
alter table public.applications add column cooldown_until timestamptz;
alter table public.applications add column cooldown_reason text;
