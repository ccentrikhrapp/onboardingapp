import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/** Every onboarding task the signed-in person can see — RLS scopes this to
    everything for admin/hr, or just their own role/profile's assigned
    tasks for accounts/it/office_admin. Joined with the employee it belongs
    to so the task list can show who it's for without a second query. */
export function listOnboardingTasks() {
  return supabase
    .from('onboarding_tasks')
    .select('*, employees(id, full_name, employee_code, department, designation, joining_date)')
    .order('created_at')
    .then(unwrap);
}

export function listTasksForEmployee(employeeId) {
  return supabase
    .from('onboarding_tasks')
    .select('*')
    .eq('employee_id', employeeId)
    .order('category')
    .then(unwrap);
}

/** Status/remarks/asset-id/reassignment — goes through the edge function so
    the permission check and the activity-log entry happen together,
    server-side, every time (see onboarding-task-update). */
export function updateOnboardingTask(taskId, patch) {
  return callFn('onboarding-task-update', { body: { taskId, ...patch } });
}

export function listOnboardingEvents(employeeId) {
  return supabase
    .from('employee_onboarding_events')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Every employee + its tasks, for the HR Onboarding dashboard. */
export function listEmployeesWithTasks() {
  return supabase
    .from('employees')
    .select('*, onboarding_tasks(id, category, status, required)')
    .order('created_at', { ascending: false })
    .then(unwrap);
}
