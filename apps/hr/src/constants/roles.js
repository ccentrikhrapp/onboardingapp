// This app's roles. hr/admin run the whole HR workflow; accounts/it/
// office_admin are scoped to their own assigned onboarding tasks (Section
// 10 of the onboarding workflow spec — each team updates its own items
// directly rather than HR doing it on their behalf). Candidate/TA roles
// live in the separate recruitment application and never sign in here.
export const ROLES = {
  HR: 'hr',
  ADMIN: 'admin',
  ACCOUNTS: 'accounts',
  IT: 'it',
  OFFICE_ADMIN: 'office_admin',
};

export const ROLE_META = {
  [ROLES.HR]: { label: 'HR', home: '/hr' },
  [ROLES.ADMIN]: { label: 'Super Admin', home: '/hr' },
  [ROLES.ACCOUNTS]: { label: 'Accounts', home: '/hr/tasks' },
  [ROLES.IT]: { label: 'IT', home: '/hr/tasks' },
  [ROLES.OFFICE_ADMIN]: { label: 'Office Administration', home: '/hr/tasks' },
};

// Full access to the HR workflow (candidates, verification, employees, …).
export const HR_STAFF_ROLES = [ROLES.HR, ROLES.ADMIN];
// Everyone who can sign into this app at all.
export const ALL_STAFF_ROLES = [ROLES.HR, ROLES.ADMIN, ROLES.ACCOUNTS, ROLES.IT, ROLES.OFFICE_ADMIN];
