-- Simplify the Employee Joining & Onboarding workflow down to exactly five
-- activities: organisational account creation (Super Admin), laptop
-- allocation (Accounts/IT), ID card creation (Accounts/IT), Welcome Kit
-- (HR, manual), Lunch (HR, manual).
--
-- Deactivating rather than deleting: existing employees already have
-- onboarding_tasks rows (and employee_onboarding_events history) created
-- from these templates. Deleting the templates/tasks would destroy that
-- history for no requirement asked for; `active = false` just stops
-- initializeOnboarding() creating these tasks for any employee hired from
-- now on, while the frontend separately stops rendering the task keys that
-- aren't one of the five kept activities (so nothing extra is visible),
-- same approach as everywhere else in this app that needs an item retired
-- without rewriting history.
update public.onboarding_task_templates
  set active = false, updated_at = now()
  where category = 'accounts_it' and key in ('peripherals', 'software_access', 'network_access', 'asset_register', 'payroll_setup');

update public.onboarding_task_templates
  set active = false, updated_at = now()
  where category = 'joining_arrangements' and key in ('id_access_card', 'seating', 'reception');
