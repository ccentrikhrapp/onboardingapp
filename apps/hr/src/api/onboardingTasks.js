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

/** Every employee + its tasks, for the Employees list page's readiness
    columns and summary cards. */
export function listEmployeesWithTasks() {
  return supabase
    .from('employees')
    .select('*, onboarding_tasks(id, key, category, status, required)')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Active Super Admins for the searchable selector — a dedicated endpoint
    (not a direct table read) since it returns phone numbers. */
export function listSuperAdmins() {
  return callFn('list-super-admins', { body: {} }).then((r) => r.admins);
}

/** Sends the organisational-account-creation request to the one Super Admin
    HR selected, with the name/mobile/designation HR reviewed and confirmed
    on the request form (not necessarily the stored record, if HR corrected
    a value). `resend: true` bypasses the duplicate-notification guard for
    an intentional resend. */
export function notifySuperAdmin(employeeId, adminId, fields, resend = false) {
  return callFn('notify-super-admin', { body: { employeeId, adminIds: [adminId], ...fields, resend } });
}

/** Sends the laptop-allocation or ID-card-creation request to the Accounts/
    IT team. `requestType`: 'laptop_allocation' | 'id_card_creation'. */
export function notifyAccountsIt(employeeId, requestType, resend = false) {
  return callFn('notify-accounts-it', { body: { employeeId, requestType, resend } });
}

/** Completes/updates joining details on an EXISTING employee record — never
    recreates it. */
export function updateEmployeeDetails(employeeId, patch) {
  return callFn('update-employee-details', { body: { employeeId, ...patch } });
}

/** Uploads an employee's photo to the private employee-photos bucket and
    returns the storage path to save via updateEmployeeDetails. */
export async function uploadEmployeePhoto(employeeId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${employeeId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('employee-photos').upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error('Could not upload the photo. Please try again.');
  return path;
}

/** Short-lived signed URL for an employee's photo. */
export async function getEmployeePhotoUrl(photoPath) {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage.from('employee-photos').createSignedUrl(photoPath, 300);
  if (error) return null;
  return data.signedUrl;
}
