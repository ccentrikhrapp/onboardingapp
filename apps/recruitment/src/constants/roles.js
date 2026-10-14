export const ROLES = {
  CANDIDATE: 'candidate',
  TA: 'ta', // Normal TA — sees/works only their own assigned applications
  ADMIN_TA: 'admin_ta', // Talent Acquisition Head — full pipeline oversight + assignment, can invite/disable Talent Acquisition users
  ADMIN: 'admin', // Super Admin — everything the TA Head has, plus full team + role management
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
    label: 'Talent Acquisition Head',
    description: 'Full pipeline oversight, job management and assignment across the Talent Acquisition team, plus inviting Talent Acquisition users.',
    home: '/ta',
  },
  [ROLES.ADMIN]: {
    label: 'Super Admin',
    description: 'Talent Acquisition workspace, plus oversight across all TAs and full team, role and access management.',
    home: '/ta',
  },
};
