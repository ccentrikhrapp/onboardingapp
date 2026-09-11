// Matches the onboarding_status enum in supabase/migrations/*_core_schema.sql.
// Order matters — it's also the allowed forward-progression sequence HR moves
// a case through (see OnboardingCaseDetailPage).
export const ONBOARDING_STATUSES = [
  'onboarding_initiated',
  'documents_pending',
  'documents_submitted',
  'verification_in_progress',
  'formalities_pending',
  'ready_for_joining',
  'joining_confirmed',
  'employee_created',
  'completed',
];

export const ONBOARDING_STATUS_META = {
  not_started: { label: 'Not started', tone: 'grey' },
  onboarding_initiated: { label: 'Onboarding initiated', tone: 'blue' },
  documents_pending: { label: 'Documents pending', tone: 'amber' },
  documents_submitted: { label: 'Documents submitted', tone: 'amber' },
  verification_in_progress: { label: 'Verification in progress', tone: 'amber' },
  formalities_pending: { label: 'Formalities pending', tone: 'amber' },
  ready_for_joining: { label: 'Ready for joining', tone: 'blue' },
  joining_confirmed: { label: 'Joining confirmed', tone: 'green' },
  employee_created: { label: 'Employee created', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
};

export function statusMeta(status) {
  return ONBOARDING_STATUS_META[status] || { label: status, tone: 'grey' };
}
