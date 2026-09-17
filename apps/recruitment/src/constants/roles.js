export const ROLES = {
  CANDIDATE: 'candidate',
  TA: 'ta', // Normal TA — sees/works only their own assigned applications
  ADMIN_TA: 'admin_ta', // Admin TA / TA Head — full pipeline oversight + assignment, no TA-account management
  ADMIN: 'admin', // Super Admin — everything Admin TA has, plus TA user management (invite/role/activate)
  HR: 'hr', // HR accounts live in the separate HR application; never granted here
};

export const ROLE_META = {
  [ROLES.CANDIDATE]: {
    label: 'Candidate',
    description: 'Browse jobs, apply, track your application and manage your offer.',
    home: '/candidate',
  },
  [ROLES.TA]: {
    label: 'Talent Acquisition',
    description: 'Review applications and manage the recruitment pipeline.',
    home: '/ta',
  },
  [ROLES.ADMIN_TA]: {
    label: 'Admin TA',
    description: 'Full pipeline oversight, job management and assignment across the TA team.',
    home: '/ta',
  },
  [ROLES.ADMIN]: {
    label: 'Super Admin',
    description: 'Talent Acquisition workspace, plus oversight across all TAs and TA account management.',
    home: '/ta',
  },
};
