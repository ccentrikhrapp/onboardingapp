-- Explicitly requested: this email should never have staff access on any
-- Ccentrik project. Remove it from the allowlist (and any account already
-- created from it, so a prior sign-in doesn't linger with access).
delete from staff_invites where lower(email) = 'claudeworkk01@gmail.com';
delete from profiles where lower(email) = 'claudeworkk01@gmail.com';
