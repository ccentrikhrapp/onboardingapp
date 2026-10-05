// Translate database rows (snake_case, uuid ids) into the shapes the existing
// UI components already expect (camelCase, the fields they read). Keeping the
// mapping in one place means the components don't need to change.

export function jobFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.job_code,
    title: row.title,
    department: row.department || '—',
    location: row.location || '—',
    workMode: row.work_mode || '—',
    employmentType: row.employment_type || '—',
    experience: row.experience || '',
    deadline: row.deadline || null,
    applicationLimit: row.application_limit ?? null,
    description: row.description || '',
    responsibilities: row.responsibilities || [],
    requiredSkills: row.required_skills || [],
    qualifications: row.qualifications || [],
    preferredSkills: row.preferred_skills || [],
    benefits: row.benefits || [],
    status: row.status,
  };
}

export function applicationFromDb(row) {
  if (!row) return null;
  const c = row.candidates || {};
  return {
    id: row.id,
    code: row.application_code,
    status: row.status,
    source: row.source,
    version: row.current_version,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    jobId: row.job_id,
    jobTitle: row.jobs?.title || 'General Application',
    interviewPlan: row.jobs?.interview_plan ?? null,
    assignedTo: row.assigned_ta_id || null,
    assignedToName: row.assigned_ta?.full_name || row.assigned_ta?.email || null,
    personal: row.personal || {},
    professional: row.professional || {},
    education: row.education || [],
    additional: row.additional || {},
    autofilled: row.autofilled || [],
    resumePath: row.resume_path || null,
    resumeMeta: row.resume_meta || null,
    atsScore: row.ats_score || null,
    returnReason: row.return_reason || null,
    rejectReason: row.reject_reason || null,
    candidateName: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    candidateEmail: c.email || row.personal?.email || '',
    candidatePhone: c.phone || row.personal?.mobile || '',
    candidateCode: c.candidate_code || null,
  };
}

export function notificationFromDb(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.message,
    at: row.created_at,
    read: row.status === 'read',
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata || {},
  };
}
