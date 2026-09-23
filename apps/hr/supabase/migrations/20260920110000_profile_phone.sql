-- Optional phone number captured when a team member is invited (the
-- recruitment app's profiles already has this column).
alter table public.profiles add column if not exists phone text;
