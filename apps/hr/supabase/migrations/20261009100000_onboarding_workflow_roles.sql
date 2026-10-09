-- Candidate-to-Employee Conversion & Onboarding Workflow (Section 10):
-- real logins for Accounts, IT, and Office Administration/Facilities, so
-- each team updates their own assigned tasks directly rather than HR doing
-- it on their behalf. "Super Admin" already exists as the `admin` role
-- (see team-invite/index.ts's own comments: "Auth: Super Admin (admin)
-- only") — no separate super_admin role is added.
--
-- ALTER TYPE ... ADD VALUE must not be used in the same transaction as any
-- statement that references the new value, so this migration does nothing
-- but add the values — the tables/policies that use them are a later file.
alter type hr_role add value if not exists 'accounts';
alter type hr_role add value if not exists 'it';
alter type hr_role add value if not exists 'office_admin';
