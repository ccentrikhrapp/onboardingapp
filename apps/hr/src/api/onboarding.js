import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

export function listOnboardingCases() {
  return supabase
    .from('onboarding_cases')
    .select('*')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Audit trail for one case — its own entries plus every document decision
    made under it. `updateOnboardingStatus` is a plain client write (no edge
    function), so it doesn't appear here; document requests/decisions and
    `createEmployee` do, since those go through edge functions that log them. */
export async function activityForCase(caseId, docIds) {
  const ids = [caseId, ...(docIds || [])];
  return supabase
    .from('audit_logs')
    .select('*')
    .in('entity_id', ids)
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Org-wide audit trail — every recorded HR action, newest first. */
export function listActivity(limit = 300) {
  return supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(unwrap);
}

/** The employee record for one onboarding case (null until HR creates it). */
export function getEmployeeForCase(caseId) {
  return supabase.from('employees').select('employee_code, designation, department, joining_date').eq('onboarding_case_id', caseId).maybeSingle().then(unwrap);
}

export function listEmployees() {
  return supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

export function getOnboardingCase(id) {
  return supabase.from('onboarding_cases').select('*').eq('id', id).single().then(unwrap);
}

/** Every status here is a real, persisted transition — no step is faked. */
export function updateOnboardingStatus(id, status) {
  return supabase.from('onboarding_cases').update({ status }).eq('id', id).select('*').single().then(unwrap);
}

/** Creates the employee record and marks the case complete — this is the
    single point where a Pre-Employee becomes an Employee, so it runs
    server-side (create-employee edge function) rather than as a plain client
    insert: the "all required onboarding documents verified" gate is
    genuinely enforced there, not just a disabled button in this UI, and it's
    also what tells the recruitment app to close out the application's active
    status (see that function's call to integration-employee-created). */
export async function createEmployee(onboardingCase, { joiningDate, department, designation } = {}) {
  const { employee } = await callFn('create-employee', {
    body: { onboardingCaseId: onboardingCase.id, joiningDate, department, designation },
  });
  return employee;
}
