-- Per-job interview plan: the intermediate round names, in order. HR is always
-- the final round and is added automatically, so it is never stored here.
-- NULL means no plan (free-form rounds, HR-final rules still apply).
alter table jobs add column if not exists interview_plan text[];

alter table jobs drop constraint if exists jobs_interview_plan_check;
alter table jobs add constraint jobs_interview_plan_check check (
  interview_plan is null
  or (cardinality(interview_plan) <= 8 and array_position(interview_plan, '') is null)
);
