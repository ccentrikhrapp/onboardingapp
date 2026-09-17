-- Lets a candidate respond (accept / decline / request reschedule) straight
-- from the interview-invitation email via a one-click link, no login
-- required — response_token is the only thing authorizing that click, so it
-- must be unguessable (16 random bytes, not the round's own id).
alter table public.interview_rounds add column response_token text unique default encode(gen_random_bytes(16), 'hex');
alter table public.interview_rounds add column candidate_response text check (candidate_response in ('accepted', 'declined', 'reschedule_requested'));
alter table public.interview_rounds add column responded_at timestamptz;

update public.interview_rounds set response_token = encode(gen_random_bytes(16), 'hex') where response_token is null;
alter table public.interview_rounds alter column response_token set not null;
