import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

const COLUMNS =
  'id, job_code, title, department, location, work_mode, employment_type, experience, description, responsibilities, required_skills, qualifications, preferred_skills, benefits, deadline, application_limit, interview_plan, status, created_at';

/** Excludes deadline-passed jobs even on the day they expire, ahead of the
    nightly cron job (close_expired_jobs) that formally closes their status. */

export function getJob(id) {
  return supabase.from('jobs').select(COLUMNS).eq('id', id).single().then(unwrap);
}

/** TA/admin: every job regardless of status. */
export function listAllJobs() {
  return supabase
    .from('jobs')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Accepts the UI job payload (camelCase) and stores it published. */
export function createJob(payload) {
  const row = {
    // Omitting the key (rather than sending a value) when not explicitly
    // overridden lets the database's own sequence assign JOB-00001,
    // JOB-00002, ... — it used to be stamped client-side from Date.now(),
    // which was never a real sequence at all.
    job_code: payload.jobCode || undefined,
    title: payload.title,
    department: payload.department || null,
    location: payload.location || null,
    work_mode: payload.workMode || null,
    employment_type: payload.employmentType || null,
    experience: payload.experience || null,
    description: payload.description || null,
    responsibilities: payload.responsibilities || [],
    required_skills: payload.requiredSkills || [],
    qualifications: payload.qualifications || [],
    preferred_skills: payload.preferredSkills || [],
    benefits: payload.benefits || [],
    deadline: payload.deadline || null,
    application_limit: payload.applicationLimit ? Number(payload.applicationLimit) : null,
    interview_plan: payload.interviewPlan?.length ? payload.interviewPlan : null,
    status: payload.status || 'published',
  };
  return supabase.from('jobs').insert(row).select(COLUMNS).single().then(unwrap);
}

export function deleteJob(id) {
  return supabase.from('jobs').delete().eq('id', id).then(unwrap);
}
