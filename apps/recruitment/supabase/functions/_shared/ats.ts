// ATS scoring — compares a submitted application against the job it was
// submitted for. Runs once, server-side, at submit-application time (best
// effort: a scoring failure never blocks submission). Every number here is
// derived from the candidate's own reviewed form fields + their resume text
// and the job's own posted fields — nothing here is random or hardcoded.

type Job = {
  title: string;
  experience: string | null;
  description: string | null;
  responsibilities: string[] | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  qualifications: string[] | null;
};

type Professional = {
  currentJobTitle?: string;
  totalExperience?: string | number;
  skills?: string[];
};

type EducationEntry = { qualification?: string };

export type AtsScore = {
  overall: number;
  skillsMatch: number;
  experienceMatch: number;
  jdKeywordMatch: number;
  educationMatch: number;
  matchedSkills: string[];
  missingSkills: string[];
  relevantExperienceYears: number | null;
  recommendation: "Strong Match" | "Good Match" | "Partial Match" | "Low Match";
  computedAt: string;
};

const STOPWORDS = new Set(
  ("a an the and or but if then else for of to in on at by with without within into onto " +
    "is are was were be been being have has had do does did will would shall should can could may might must " +
    "this that these those it its as from up down out about our your their his her they we you i " +
    "years year experience strong excellent good ability skills work working team role job candidate " +
    "responsibilities requirements preferred required must have nice looking who what when where " +
    "including etc using use used across not you'll we're you're per plus more than year's")
    .split(/\s+/),
);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z+.#-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w));
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** "5-6", "3+ years", "4 to 6", "6" -> { min, max } (max null = open-ended). */
function parseExperienceRange(exp: string | null | undefined): { min: number; max: number | null } | null {
  if (!exp) return null;
  const cleaned = exp.toLowerCase();
  const range = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = cleaned.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return { min: Number(plus[1]), max: null };
  const single = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (single) return { min: Number(single[1]), max: null };
  return null;
}

function scoreExperience(candidateYears: number | null, jobExp: string | null | undefined): number {
  const range = parseExperienceRange(jobExp);
  if (!range || candidateYears === null) return 100; // nothing to compare against
  if (candidateYears >= range.min && (range.max === null || candidateYears <= range.max + 2)) return 100;
  if (candidateYears < range.min) {
    return range.min === 0 ? 100 : Math.max(0, Math.round((candidateYears / range.min) * 100));
  }
  return 100; // comfortably overqualified
}

function scoreSkills(candidateSkills: string[], required: string[], preferred: string[]) {
  const have = new Set(candidateSkills.map(norm));
  const matchedRequired = required.filter((s) => have.has(norm(s)));
  const matchedPreferred = preferred.filter((s) => have.has(norm(s)));
  const missingRequired = required.filter((s) => !have.has(norm(s)));

  const weight = required.length + preferred.length * 0.5;
  const got = matchedRequired.length + matchedPreferred.length * 0.5;
  const skillsMatch = weight === 0 ? 100 : Math.round((got / weight) * 100);

  return {
    skillsMatch,
    matchedSkills: [...matchedRequired, ...matchedPreferred],
    missingSkills: missingRequired,
  };
}

function scoreEducation(education: EducationEntry[], jobQualifications: string[]): number {
  if (!jobQualifications.length) return 100;
  const candidateWords = new Set(
    education.flatMap((e) => words(e.qualification || "")),
  );
  if (candidateWords.size === 0) return 50; // no education info given — can't say either way
  const hits = jobQualifications.filter((q) => words(q).some((w) => candidateWords.has(w)));
  return Math.round((hits.length / jobQualifications.length) * 100);
}

function scoreJdKeywords(resumeText: string, job: Job): number {
  const jdText = [job.description || "", ...(job.responsibilities || [])].join(" ");
  const jdWords = [...new Set(words(jdText))].slice(0, 60);
  if (jdWords.length === 0) return 100;
  const resumeLower = resumeText.toLowerCase();
  const hits = jdWords.filter((w) => resumeLower.includes(w));
  return Math.round((hits.length / jdWords.length) * 100);
}

function recommendationFor(overall: number): AtsScore["recommendation"] {
  if (overall >= 80) return "Strong Match";
  if (overall >= 65) return "Good Match";
  if (overall >= 45) return "Partial Match";
  return "Low Match";
}

export function computeAtsScore(input: {
  job: Job;
  professional: Professional;
  education: EducationEntry[];
  resumeText: string;
}): AtsScore {
  const { job, professional, education, resumeText } = input;
  const candidateSkills = professional.skills || [];
  const required = job.required_skills || [];
  const preferred = job.preferred_skills || [];

  const { skillsMatch, matchedSkills, missingSkills } = scoreSkills(candidateSkills, required, preferred);

  const candidateYears = professional.totalExperience !== undefined && professional.totalExperience !== ""
    ? Number(professional.totalExperience)
    : null;
  const experienceMatch = scoreExperience(
    Number.isFinite(candidateYears as number) ? (candidateYears as number) : null,
    job.experience,
  );

  const educationMatch = scoreEducation(education, job.qualifications || []);
  const jdKeywordMatch = scoreJdKeywords(resumeText, job);

  const overall = Math.round(
    skillsMatch * 0.35 + experienceMatch * 0.25 + jdKeywordMatch * 0.25 + educationMatch * 0.15,
  );

  return {
    overall,
    skillsMatch,
    experienceMatch,
    jdKeywordMatch,
    educationMatch,
    matchedSkills,
    missingSkills,
    relevantExperienceYears: Number.isFinite(candidateYears as number) ? (candidateYears as number) : null,
    recommendation: recommendationFor(overall),
    computedAt: new Date().toISOString(),
  };
}
