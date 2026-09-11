// This app has two roles: hr staff and admin. Candidate/TA roles live in the
// separate recruitment application and never sign in here.
export const ROLES = {
  HR: 'hr',
  ADMIN: 'admin',
};

export const ROLE_META = {
  [ROLES.HR]: { label: 'HR', home: '/hr' },
  [ROLES.ADMIN]: { label: 'Admin', home: '/hr' },
};
