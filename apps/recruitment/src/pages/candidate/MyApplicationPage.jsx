import { useEffect, useState } from 'react';
import CountryPhoneInput from '../../components/common/CountryPhoneInput.jsx';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import { Field, FieldGrid, Input, Select } from '../../components/ta/Field.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { candidateSupabase } from '../../lib/supabase.js';
import { listMyApplications, getApplicationEvents, resubmitApplication, verifyTaCandidate, claimApplication } from '../../api/applications.js';
import { CLAIM_APPLICATION_KEY, isAuthReturn, returnErrorMessage, cleanAuthUrl } from '../../utils/authFlow.js';
import { listInterviewRounds } from '../../api/interviews.js';
import { listApplicationDocuments, uploadDocumentFile, submitDocument } from '../../api/documents.js';
import { listOnboardingDocuments, uploadOnboardingDocument, submitOnboardingForm } from '../../api/onboarding.js';
import { useUpload } from '../../context/UploadContext.jsx';
import OnboardingFormFields, { validateOnboardingForm } from '../../components/candidate/OnboardingFormFields.jsx';
import { getOffer } from '../../api/offers.js';
import { applicationFromDb } from '../../api/mappers.js';
import { initialsOf, formatDate } from '../../utils/format.js';
import { APP_STATUS, stageIndexForStatus, stageBadgeForStatus } from '../../constants/statuses.js';
import { nameError, emailError, phoneError, locationError, urlError, numberError } from '../../utils/validation.js';
import { NOTICE_OPTIONS } from '../../utils/candidateForm.js';
import { summarizeDocuments } from '../../utils/documentRules.js';
import PreOfferDocuments from '../../components/candidate/PreOfferDocuments.jsx';

// The backend logs one application_events row per internal action (per TA
// click, per document review, per reassignment) — useful for TA/HR's own
// audit trail, but the candidate only needs the handful of moments that
// actually mean something to them. This is an allowlist, not a blacklist:
// an unrecognized future event type defaults to hidden rather than risking
// a new internal-only event leaking into the candidate's view.
const MILESTONE_TITLES = new Set([
  'Application Submitted', 'Application Advanced', 'Application Closed',
  'Pre-Offer Documents Requested', 'All Required Rounds Cleared',
  'Offer Sent', 'Offer Accepted', 'Onboarding Documents Requested', 'Employee ID Created',
  'Joining Form Verified', 'Joining Formalities Completed', 'Joining Documentation Approved',
]);
// Interview round events are dynamically named ("Technical round Scheduled",
// "Technical round — Advance") so they're matched by shape, not exact text.
const MILESTONE_PATTERNS = [/Scheduled$/, / — /];
// The candidate needs to act on these — never collapse or hide them, even
// though they're per-document like the uploads below.
// Once the offer is accepted and HR has opened onboarding, the employee joining form is available.
const JOINING_STATUSES = ['OFFER_ACCEPTED', 'ONBOARDING_PENDING', 'HR_VERIFICATION', 'HR_VERIFICATION_REJECTED', 'JOINING_PENDING', 'EMPLOYEE'];
const ACTIONABLE_PATTERNS = [/Correction Requested/, /Document Rejected/, /Correction Required/, /Clarification Required/];
// The candidate's own upload actions — real, but one per file is noise once
// there are 16 of them; collapse to a single "submitted" milestone per
// batch (pre-offer vs onboarding), keeping the most recent upload's time.
const UPLOAD_TITLES = new Set(['Document Uploaded', 'Document Not Provided', 'Onboarding Document Uploaded']);

/** Turns the full internal event log into the short, candidate-facing list:
    real milestones and actionable items shown in full, repetitive per-document
    upload events collapsed to one entry each, everything else (TA-internal
    actions, ATS screening, per-document TA/HR pass-through approvals that
    aren't news the candidate needs pinged about) dropped. Newest first. */
function candidateMilestones(events, candidateName) {
  const isMilestone = (t) => MILESTONE_TITLES.has(t) || MILESTONE_PATTERNS.some((p) => p.test(t));
  const isActionable = (t) => ACTIONABLE_PATTERNS.some((p) => p.test(t));
  const isUpload = (t) => UPLOAD_TITLES.has(t);

  const seenUploadBatch = new Set();
  const out = [];
  for (const e of [...events].reverse()) {
    // ATS matching is an internal TA screening tool, never surfaced to the
    // candidate — checked first since its "Auto-Rejected — Below ATS
    // Threshold" title would otherwise also match the interview-round-result
    // pattern below (both use the same " — " separator).
    if (/ATS/i.test(e.title)) continue;
    if (isMilestone(e.title) || isActionable(e.title)) {
      out.push({ id: e.id, title: e.title, description: e.description, at: e.created_at, actor: e.actor_label || 'System' });
    } else if (isUpload(e.title)) {
      const batch = e.title.startsWith('Onboarding') ? 'onboarding' : 'pre-offer';
      if (!seenUploadBatch.has(batch)) {
        seenUploadBatch.add(batch);
        out.push({
          id: e.id,
          title: batch === 'onboarding' ? 'Onboarding documents submitted' : 'Pre-offer documents submitted',
          description: 'Documents received and sent for verification.',
          at: e.created_at,
          // Always the candidate's own action, by definition of UPLOAD_TITLES
          // — use the application's real name directly rather than whatever
          // this specific event happened to have stored as actor_label
          // (older rows, from before actor names were fixed at the source,
          // still say the bare role "Candidate" rather than a real name).
          actor: candidateName || 'Candidate',
        });
      }
    }
  }
  return out;
}

const EXP_OPTIONS = ['Fresher', '0–2 years', '2–5 years', '5–8 years', '8+ years'];
// Same bucket <-> stored-number mapping ApplyPage uses, so a resubmitted edit
// stores totalExperience in the same shape the rest of the app expects.
function expToNumber(bucket) {
  return { Fresher: '0', '0–2 years': '1', '2–5 years': '3', '5–8 years': '6', '8+ years': '9' }[bucket] || '';
}

/* Shared by the RETURNED-resubmit edit form and the TA-created-candidate
   verification form — both are "review/correct these fields" screens over
   the same application shape. */
function formFromApp(app) {
  return {
    firstName: app.personal.firstName || '', lastName: app.personal.lastName || '',
    email: app.personal.email || '', phone: app.personal.mobile || '',
    currentLocation: app.personal.currentLocation || '',
    experience: app.professional.totalExperience
      ? (EXP_OPTIONS.find((o) => expToNumber(o) === String(app.professional.totalExperience)) || '')
      : '',
    currentCompany: app.professional.currentCompany || '', currentJobTitle: app.professional.currentJobTitle || '',
    portfolio: app.additional.portfolio || '',
    highestQualification: app.education?.[0]?.qualification || '',
    noticePeriod: app.professional.noticePeriod || '',
    expectedSalary: app.professional.expectedCTC || '',
  };
}

/* The candidate's own journey — used to size the progress donut. This app's
   pipeline stops at the offer; onboarding onward lives in the HR application. */
const CANDIDATE_STEPS = ['Applied', 'In review', 'Interview', 'Offer'];
const PIPELINE_TO_CANDIDATE = [1, 1, 2, 3, 3, 3, 3];
const DOC_STAGES = [APP_STATUS.DOC_VERIFICATION, APP_STATUS.DOCS_VERIFIED];
const OFFER_STAGES = [APP_STATUS.OFFER_ISSUED, APP_STATUS.OFFER_ACCEPTED, APP_STATUS.OFFER_DECLINED];
/* application_documents.status (real DB enum) -> label/tone. */
const DOC_STATUS_META = {
  requested: { label: 'Pending upload', tone: 'grey' },
  uploaded: { label: 'Under verification', tone: 'amber' },
  under_verification: { label: 'Under verification', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  revision_required: { label: 'Correction needed', tone: 'red' },
  cannot_provide: { label: "Can't provide — reason given", tone: 'amber' },
};
const INTERVIEW_STAGES = [
  APP_STATUS.INTERVIEW_PLANNING, APP_STATUS.INTERVIEW_IN_PROGRESS,
  APP_STATUS.INTERVIEW_PASSED, APP_STATUS.INTERVIEW_FAILED,
  ...DOC_STAGES,
];

/* One friendly line telling the candidate what happens next. */
function nextStep(status) {
  switch (status) {
    case APP_STATUS.SUBMITTED:
    case APP_STATUS.TA_REVIEW:
      return { icon: 'Eye', text: 'Your application is being reviewed by our talent acquisition team.' };
    case APP_STATUS.INTERVIEW_PLANNING:
      return { icon: 'CalendarDays', text: "You've been advanced — we'll be in touch with interview details." };
    case APP_STATUS.INTERVIEW_IN_PROGRESS:
      return { icon: 'CalendarClock', text: 'You have interview rounds scheduled — see the Interviews tab.' };
    case APP_STATUS.INTERVIEW_PASSED:
      return { icon: 'CheckCircle2', text: "You've cleared the interviews. Document verification is next." };
    case APP_STATUS.DOC_VERIFICATION:
      return { icon: 'Upload', text: 'Please upload your required documents — see the Documents tab.' };
    case APP_STATUS.DOCS_VERIFIED:
      return { icon: 'FileCheck', text: 'All documents verified. Your offer is being prepared.' };
    case APP_STATUS.OFFER_ISSUED:
      return { icon: 'FileCheck', text: 'You have an offer! Review and respond on the Offer tab.' };
    case APP_STATUS.OFFER_ACCEPTED:
      return { icon: 'CheckCircle2', text: 'Offer accepted — our HR team will be in touch to begin onboarding.' };
    default:
      return null;
  }
}

/* Map a database application + timeline into the shape this page renders. */
function adaptRemote(a) {
  if (!a) return null;
  return {
    id: a.id,
    code: a.code,
    candidateCode: a.candidateCode,
    jobTitle: a.jobTitle,
    submittedAt: a.submittedAt,
    assignedTo: 'Talent Acquisition',
    status: a.status,
    returnReason: a.returnReason,
    rejectReason: a.rejectReason,
    personal: a.personal || {},
    professional: a.professional || {},
    education: a.education || [],
    additional: a.additional || {},
  };
}

export default function MyApplicationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { run: runUpload } = useUpload();
  const { configured, user, loading: authLoading } = useCandidateAuth();
  const [remote, setRemote] = useState({ loading: true, app: null, events: [] });
  const [resubmitting, setResubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null); // populated from app when Edit is opened
  const [formErrors, setFormErrors] = useState({});
  const [rounds, setRounds] = useState([]);
  const [docs, setDocs] = useState([]);
  const [offer, setOffer] = useState(null);
  const [onboardingDocs, setOnboardingDocs] = useState([]);
  const [onboardingBusy, setOnboardingBusy] = useState({}); // onboarding_document id -> true while uploading
  const [onboardingFormValues, setOnboardingFormValues] = useState({}); // onboarding_document id -> { fieldKey: value }
  const [onboardingFormErrors, setOnboardingFormErrors] = useState({}); // onboarding_document id -> { fieldKey: message }
  const [activeTab, setActiveTab] = useState('progress'); // progress | interviews | documents | onboarding | offer

  // Onboarding: the form values and errors are kept per onboarding document.
  const onboardingFormValuesFor = (d) => onboardingFormValues[d.id] || {};
  const setOnboardingFormValue = (d, key, value) => {
    setOnboardingFormValues((s) => ({ ...s, [d.id]: { ...(s[d.id] || {}), [key]: value } }));
    setOnboardingFormErrors((s) => ({ ...s, [d.id]: { ...(s[d.id] || {}), [key]: undefined } }));
  };
  const reloadOnboardingDocs = (appId) => listOnboardingDocuments(appId).then(setOnboardingDocs).catch(() => {});

  // Candidate uploads one file for an onboarding document; the loader covers it until it succeeds or fails.
  const uploadOnboardingDoc = async (d, fileList) => {
    const file = fileList?.[0];
    if (!file || !remote.app) return;
    setOnboardingBusy((s) => ({ ...s, [d.id]: true }));
    try {
      await runUpload(d.requirement_name, () => uploadOnboardingDocument(remote.app.id, d, file));
      await reloadOnboardingDocs(remote.app.id);
    } catch { /* the loader has already shown the failure notification */ }
    finally { setOnboardingBusy((s) => ({ ...s, [d.id]: false })); }
  };

  // Candidate submits the filled-in onboarding form. Required fields are checked first.
  const submitOnboardingFormFor = async (d) => {
    if (!remote.app) return;
    const values = onboardingFormValuesFor(d);
    const errs = {};
    for (const f of d.field_schema || []) {
      if (f.type !== 'file' && f.required && !String(values[f.key] ?? '').trim()) errs[f.key] = `${f.label || f.key} is required.`;
    }
    if (Object.keys(errs).length) {
      setOnboardingFormErrors((s) => ({ ...s, [d.id]: errs }));
      return;
    }
    setOnboardingBusy((s) => ({ ...s, [d.id]: true }));
    try {
      await submitOnboardingForm(remote.app.id, d, null, values);
      toast.success('Submitted. HR will review it.');
      await reloadOnboardingDocs(remote.app.id);
    } catch (err) {
      toast.error(err.message || 'Could not submit. Please try again.');
    } finally { setOnboardingBusy((s) => ({ ...s, [d.id]: false })); }
  };

  const load = () => {
    listMyApplications()
      .then(async (apps) => {
        const latest = apps?.[0] ? applicationFromDb(apps[0]) : null;
        const events = latest ? await getApplicationEvents(latest.id, candidateSupabase) : [];
        setRemote({ loading: false, app: latest, events });
        // A TA-created candidate lands straight on the verification form —
        // no "click Edit" step first, since the whole point is reviewing
        // what's already there.
        if (latest?.status === 'DRAFT') setForm(formFromApp(adaptRemote(latest)));
        if (latest && INTERVIEW_STAGES.includes(latest.status)) {
          listInterviewRounds(latest.id, candidateSupabase).then(setRounds).catch(() => setRounds([]));
        }
        if (latest && DOC_STAGES.includes(latest.status)) {
          listApplicationDocuments(latest.id, candidateSupabase).then(setDocs).catch(() => setDocs([]));
        }
        if (latest && OFFER_STAGES.includes(latest.status)) {
          getOffer(latest.id, candidateSupabase).then(setOffer).catch(() => setOffer(null));
        }
        // Onboarding documents only exist once HR has requested them (after
        // offer acceptance) — an empty list here just means none yet.
        if (latest) {
          listOnboardingDocuments(latest.id).then(setOnboardingDocs).catch(() => setOnboardingDocs([]));
        }
      })
      .catch(() => setRemote({ loading: false, app: null, events: [] }));
  };
  useEffect(() => {
    if (configured) load();
    else setRemote({ loading: false, app: null, events: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Landing here from Google (either the post-submit offer or the login
  // page) — clear any error/token debris Supabase left in the URL, surface
  // a real auth error in plain language, and finish reattaching an
  // application that was submitted anonymously before signing up/in (see
  // ApplicationSuccessPage). Best-effort: a failed/duplicate claim never
  // blocks the page from loading whatever the candidate can already see.
  useEffect(() => {
    if (!configured || authLoading) return;
    cleanAuthUrl();
    const authError = returnErrorMessage();
    if (authError) toast.error(authError);
    let pending = null;
    try { pending = localStorage.getItem(CLAIM_APPLICATION_KEY); } catch { /* ignore */ }
    if (!pending) return;
    if (!user || user.is_anonymous) {
      try { localStorage.removeItem(CLAIM_APPLICATION_KEY); } catch { /* ignore */ }
      return;
    }
    claimApplication(pending)
      .catch(() => {})
      .finally(() => {
        try { localStorage.removeItem(CLAIM_APPLICATION_KEY); } catch { /* ignore */ }
        load();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, authLoading, user?.id]);

  if (!configured) {
    return (
      <div className="cx-page">
        <div className="wsauth__alert" role="alert">
          <Icon name="AlertCircle" size={15} /> Backend not configured yet — see .env.example.
        </div>
      </div>
    );
  }

  // Still resolving the Google round-trip (and possibly reattaching an
  // anonymously-submitted application) — show the same loading state rather
  // than a flash of "No application yet" that would correct itself a moment
  // later and look like the application had gone missing.
  const claimPending = (() => { try { return !!localStorage.getItem(CLAIM_APPLICATION_KEY); } catch { return false; } })();
  if (remote.loading || (isAuthReturn() && (authLoading || claimPending))) {
    return <div className="cx-page"><div className="cx-loading">Loading your application…</div></div>;
  }

  const app = adaptRemote(remote.app);

  if (!app) {
    return (
      <div className="cx-page">
        <EmptyState
          icon="FileText"
          title="No application yet"
          message="Once you submit an application it will appear here with a live status timeline."
          action={<Button icon="Briefcase" onClick={() => navigate('/candidate/jobs')}>Browse jobs</Button>}
        />
      </div>
    );
  }

  const fullName = `${app.personal.firstName || ''} ${app.personal.lastName || ''}`.trim();
  const activities = candidateMilestones(remote.events, fullName);
  const name = fullName || 'there';

  const status = app.status;
  const badge = stageBadgeForStatus(status);
  const stageIdx = stageIndexForStatus(status);
  const rejected = status === APP_STATUS.REJECTED;
  const hint = nextStep(status);

  const candIdx = rejected ? 0 : (PIPELINE_TO_CANDIDATE[Math.max(0, stageIdx)] ?? 0);
  const progress = rejected ? 0 : Math.round(((candIdx + 1) / CANDIDATE_STEPS.length) * 100);

  // "Resubmit" used to just re-send the exact same data — nothing to fix
  // what the TA actually flagged. Now it opens an editable form pre-filled
  // from the current application, and only the changed sections are sent as
  // a patch (see api/applications.js#resubmitApplication).
  const startEdit = () => {
    setForm(formFromApp(app));
    setFormErrors({});
    setEditing(true);
  };

  const validateForm = (f) => {
    const e = {};
    const n1 = nameError(f.firstName, { required: true, label: 'first name' }); if (n1) e.firstName = n1;
    const n2 = nameError(f.lastName, { required: true, label: 'last name' }); if (n2) e.lastName = n2;
    const em = emailError(f.email, { required: true }); if (em) e.email = em;
    const ph = phoneError(f.phone, { required: true }); if (ph) e.phone = ph;
    const loc = locationError(f.currentLocation, { required: true, label: 'current location' }); if (loc) e.currentLocation = loc;
    if (!f.experience) e.experience = 'Total experience is required.';
    const url = urlError(f.portfolio, { required: false, label: 'portfolio/LinkedIn URL' }); if (url) e.portfolio = url;
    return e;
  };

  // The TA-created verification screen also shows notice period / qualification / salary,
  // with the same rules as the Job Portal form (notice period is required once experienced).
  const validateVerify = (f) => {
    const e = validateForm(f);
    if (Number(expToNumber(f.experience)) > 0 && !f.noticePeriod) e.noticePeriod = 'Notice period is required.';
    const sal = numberError(f.expectedSalary, { required: false, label: 'expected salary', min: 0 }); if (sal) e.expectedSalary = sal;
    return e;
  };

  const saveEdit = async () => {
    const e = validateForm(form);
    setFormErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setResubmitting(true);
    try {
      await resubmitApplication(app.id, {
        personal: { ...app.personal, firstName: form.firstName, lastName: form.lastName, email: form.email, mobile: form.phone, currentLocation: form.currentLocation },
        professional: { ...app.professional, totalExperience: expToNumber(form.experience), currentCompany: form.currentCompany, currentJobTitle: form.currentJobTitle },
        additional: { ...app.additional, portfolio: form.portfolio },
      });
      toast.success('Application updated and resubmitted for review.');
      setEditing(false);
      load();
    } catch (e2) {
      toast.error(e2.message || 'Could not resubmit your application.');
    } finally {
      setResubmitting(false);
    }
  };

  const saveVerify = async () => {
    const e = validateVerify(form);
    setFormErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setResubmitting(true);
    try {
      await verifyTaCandidate(app.id, {
        personal: { ...app.personal, firstName: form.firstName, lastName: form.lastName, email: form.email, mobile: form.phone, currentLocation: form.currentLocation },
        professional: { ...app.professional, totalExperience: expToNumber(form.experience), currentCompany: form.currentCompany, currentJobTitle: form.currentJobTitle, noticePeriod: form.noticePeriod, expectedCTC: form.expectedSalary },
        education: [{ ...(app.education?.[0] || {}), qualification: form.highestQualification }],
        additional: { ...app.additional, portfolio: form.portfolio },
      });
      toast.success('Application verified and submitted!');
      load();
    } catch (e2) {
      toast.error(e2.message || 'Could not submit your application.');
    } finally {
      setResubmitting(false);
    }
  };

  // A TA created this application from a resume — the candidate reviews/
  // corrects it here before it enters the normal pipeline. Nothing about the
  // rest of this page (progress donut, pipeline stages, documents) applies
  // yet, so this renders as its own screen rather than folding into the
  // dashboard below.
  if (status === 'DRAFT' && form) {
    return (
      <div className="cx-page cx-page--form">
        <div className="cx-page__head">
          <h1 className="cx-page__title">Please verify your application</h1>
          <p className="cx-page__sub">
            Our Talent Acquisition team prepared this application from your resume{app.jobTitle && app.jobTitle !== 'General Application' ? ` for ${app.jobTitle}` : ''}.
            Review the details below, correct anything that's wrong, and submit — you don't need to start from scratch.
          </p>
        </div>
        <Card>
          <FieldGrid>
            <Field label="First name" required error={formErrors.firstName}>
              <Input value={form.firstName} error={formErrors.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </Field>
            <Field label="Last name" required error={formErrors.lastName}>
              <Input value={form.lastName} error={formErrors.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </Field>
            <Field label="Email" required error={formErrors.email}>
              <Input type="email" value={form.email} error={formErrors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Phone number" required error={formErrors.phone}>
              <CountryPhoneInput value={form.phone} error={formErrors.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            </Field>
            <Field label="Current location" required error={formErrors.currentLocation}>
              <Input value={form.currentLocation} error={formErrors.currentLocation} onChange={(e) => setForm((f) => ({ ...f, currentLocation: e.target.value }))} />
            </Field>
            <Field label="Total experience" required error={formErrors.experience}>
              <Select value={form.experience} error={formErrors.experience} placeholder="Select" options={EXP_OPTIONS} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
            </Field>
            <Field label="Current company">
              <Input value={form.currentCompany} onChange={(e) => setForm((f) => ({ ...f, currentCompany: e.target.value }))} />
            </Field>
            <Field label="Current job title">
              <Input value={form.currentJobTitle} onChange={(e) => setForm((f) => ({ ...f, currentJobTitle: e.target.value }))} />
            </Field>
            <Field label="Highest qualification">
              <Input value={form.highestQualification} onChange={(e) => setForm((f) => ({ ...f, highestQualification: e.target.value }))} />
            </Field>
            <Field label="Notice period" required={Number(expToNumber(form.experience)) > 0} error={formErrors.noticePeriod}>
              <Select value={form.noticePeriod} error={formErrors.noticePeriod} placeholder="Select" options={NOTICE_OPTIONS} onChange={(e) => setForm((f) => ({ ...f, noticePeriod: e.target.value }))} />
            </Field>
            <Field label="Expected salary (₹ / year)" hint="Optional" error={formErrors.expectedSalary} full>
              <Input type="number" min="0" value={form.expectedSalary} error={formErrors.expectedSalary} onChange={(e) => setForm((f) => ({ ...f, expectedSalary: e.target.value }))} />
            </Field>
            <Field label="Portfolio / LinkedIn URL" hint="Optional" error={formErrors.portfolio} full>
              <Input value={form.portfolio} error={formErrors.portfolio} placeholder="https://" onChange={(e) => setForm((f) => ({ ...f, portfolio: e.target.value }))} />
            </Field>
          </FieldGrid>
        </Card>
        <div className="cx-formbar">
          <span className="cx-formbar__note">By submitting, you confirm that the information above is accurate.</span>
          <Button iconRight="ArrowRight" onClick={saveVerify} disabled={resubmitting}>
            {resubmitting ? 'Submitting…' : 'Verify & Submit Application'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="cx-page">
      <div className="cx-idcard">
        <div className="cx-idcard__id">
          <span className="cx-idcard__avatar">{initialsOf(name)}</span>
          <div>
            <h2>Hi {app.personal.firstName}</h2>
            <div className="cx-idcard__meta">{app.jobTitle}</div>
          </div>
        </div>
        <dl className="cx-idcard__facts">
          <div><dt>Candidate ID</dt><dd>{app.candidateCode}</dd></div>
          <div><dt>Application reference</dt><dd>{app.code}</dd></div>
          <div><dt>Submitted</dt><dd>{formatDate(app.submittedAt)}</dd></div>
          <div><dt>Assigned to</dt><dd>{app.assignedTo}</dd></div>
        </dl>
        <div className="cx-idcard__progress">
          <div className="cx-idcard__donut" role="img" aria-label={`Progress ${progress} percent`}>
            <svg viewBox="0 0 42 42">
              <circle className="cx-donut-track" cx="21" cy="21" r="15.9" pathLength="100" />
              {!rejected && (
                <circle className="cx-donut-arc" cx="21" cy="21" r="15.9" pathLength="100" strokeDasharray={`${progress} 100`} />
              )}
            </svg>
            <span className="cx-idcard__donutnum">{rejected ? '—' : `${progress}%`}</span>
          </div>
          <div className="cx-idcard__pmeta">
            <span className="cx-idcard__plabel">{rejected ? 'Application status' : 'Progress'}</span>
            <div className="cx-idcard__tag"><Tag tone={badge.tone}>{badge.label}</Tag></div>
          </div>
        </div>
      </div>

      {status === APP_STATUS.RETURNED && (
        <div className="ta-note ta-note--warn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="RotateCcw" size={15} /> <strong>Action needed:</strong> {app.returnReason}
          </div>
          {!editing && (
            <Button icon="Pencil" onClick={startEdit}>Edit &amp; resubmit application</Button>
          )}
        </div>
      )}

      {editing && (
        <Card title="Update your application">
          <FieldGrid>
            <Field label="First name" required error={formErrors.firstName}>
              <Input value={form.firstName} error={formErrors.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </Field>
            <Field label="Last name" required error={formErrors.lastName}>
              <Input value={form.lastName} error={formErrors.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </Field>
            <Field label="Email" required error={formErrors.email}>
              <Input type="email" value={form.email} error={formErrors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Phone number" required error={formErrors.phone}>
              <CountryPhoneInput value={form.phone} error={formErrors.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            </Field>
            <Field label="Current location" required error={formErrors.currentLocation}>
              <Input value={form.currentLocation} error={formErrors.currentLocation} onChange={(e) => setForm((f) => ({ ...f, currentLocation: e.target.value }))} />
            </Field>
            <Field label="Total experience" required error={formErrors.experience}>
              <Select value={form.experience} error={formErrors.experience} placeholder="Select" options={EXP_OPTIONS} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
            </Field>
            <Field label="Current company">
              <Input value={form.currentCompany} onChange={(e) => setForm((f) => ({ ...f, currentCompany: e.target.value }))} />
            </Field>
            <Field label="Current job title">
              <Input value={form.currentJobTitle} onChange={(e) => setForm((f) => ({ ...f, currentJobTitle: e.target.value }))} />
            </Field>
            <Field label="Portfolio / LinkedIn URL" hint="Optional" error={formErrors.portfolio} full>
              <Input value={form.portfolio} error={formErrors.portfolio} placeholder="https://" onChange={(e) => setForm((f) => ({ ...f, portfolio: e.target.value }))} />
            </Field>
          </FieldGrid>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button onClick={saveEdit} disabled={resubmitting}>{resubmitting ? 'Saving…' : 'Save & resubmit'}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={resubmitting}>Cancel</Button>
          </div>
        </Card>
      )}

      {(() => {
        const tabs = [
          { key: 'progress', label: 'Progress', icon: 'Activity' },
          rounds.length > 0 && { key: 'interviews', label: 'Interviews', icon: 'CalendarClock' },
          docs.length > 0 && { key: 'documents', label: 'Documents', icon: 'FileText' },
          offer && { key: 'offer', label: 'Offer', icon: 'FileCheck' },
          (onboardingDocs.length > 0 || JOINING_STATUSES.includes(app.status)) && { key: 'onboarding', label: 'Onboarding', icon: 'ClipboardCheck' },
        ].filter(Boolean);
        return tabs.length > 1 ? (
          <div className="ta-btnrow" style={{ marginBottom: 4 }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`ta-btn ta-btn--sm${activeTab === t.key ? '' : ' ta-btn--ghost'}`}
                onClick={() => setActiveTab(t.key)}
              >
                <Icon name={t.icon} size={14} /> {t.label}
              </button>
            ))}
          </div>
        ) : null;
      })()}

      <div className="ta-stack">
        {activeTab === 'progress' && (
        <Card title="Recruitment progress">
          {rejected ? (
            <div className="cx-nextline cx-nextline--stop">
              <Icon name="XCircle" size={15} />
              <span>
                <strong>Not selected:</strong>{' '}
                {app.rejectReason || 'After reviewing your application the team decided not to move forward this time.'}
                {' '}We appreciate your interest and encourage you to apply for future roles.
              </span>
            </div>
          ) : hint && status !== APP_STATUS.RETURNED && (
            <div className="cx-nextline">
              <Icon name={hint.icon} size={15} />
              <span><strong>What's next:</strong> {hint.text}</span>
            </div>
          )}

          {activities.length > 0 && (
            <ol className="ta-timeline cx-actlog">
              {activities.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <span className="ta-timeline__dot" />
                  <div className="cx-actitem">
                    <span className="cx-actitem__main">
                      <span className="ta-cell-strong">{a.title}</span>
                      <span className="ta-cell-sub">{a.description}</span>
                    </span>
                    <span className="ta-cell-sub cx-actitem__when">{formatDate(a.at)} · {a.actor}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        )}

        {activeTab === 'interviews' && rounds.length > 0 && (
          <Card title="Interviews">
            <div className="ta-stack">
              {rounds.map((r) => {
                const fb = r.interview_feedback?.[0];
                return (
                  <div className="ta-round" key={r.id}>
                    <div className="ta-round__head">
                      <span className="ta-cell-strong">Round {r.round_number} · {r.name}</span>
                      <Tag tone={r.status === 'scheduled' ? 'blue' : 'grey'}>{r.status === 'scheduled' ? 'Scheduled' : 'Completed'}</Tag>
                    </div>
                    <div className="ta-cell-sub">
                      {formatDate(r.scheduled_at)} {new Date(r.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {r.status === 'scheduled' && r.meeting_url && (
                      <a href={r.meeting_url} target="_blank" rel="noreferrer" className="ta-link" style={{ marginTop: 4 }}>Join meeting link</a>
                    )}
                    {fb?.share_with_candidate && (
                      <div className="ta-cell-sub" style={{ marginTop: 4 }}>Feedback from the panel: {fb.remarks}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {activeTab === 'documents' && docs.length > 0 && (
          <Card
            title="Pre-offer documents"
            action={<Tag tone={summarizeDocuments(docs, new Set(docs.map((d) => d.document_requirements?.key)).size).ready ? 'green' : 'amber'}>
              {summarizeDocuments(docs, new Set(docs.map((d) => d.document_requirements?.key)).size).ready ? 'All applicable items approved' : 'In progress'}
            </Tag>}
          >
            <PreOfferDocuments app={app} docs={docs} onReload={load} />
          </Card>
        )}

        {activeTab === 'offer' && offer && (
          <Card title="Your offer">
            <p className="ta-cell-mute" style={{ lineHeight: 1.7, marginBottom: 14 }}>
              We are pleased to offer you the position of <strong>{offer.designation || app.jobTitle}</strong>
              {offer.department ? ` in the ${offer.department} team` : ''} at Ccentrik.
              {offer.offer_letter_path ? ' The full offer letter is attached to the email you received.' : ' The details are in the email you received.'}
            </p>
            <div className="ta-info" style={{ marginBottom: 14 }}>
              {offer.joining_date && <div className="ta-info__item"><span className="ta-info__label">Expected joining date</span><span className="ta-info__value">{formatDate(offer.joining_date)}</span></div>}
              {offer.location && <div className="ta-info__item"><span className="ta-info__label">Location</span><span className="ta-info__value">{offer.location}</span></div>}
            </div>
            {offer.status === 'sent' || offer.status === 'viewed' ? (
              <div className="ta-note ta-note--info">
                <Icon name="Mail" size={15} /> Please reply to the offer email to accept — your Talent Acquisition
                contact will confirm it here once they receive your reply.
              </div>
            ) : offer.status === 'accepted' ? (
              <div className="ta-note ta-note--ok"><Icon name="CheckCircle2" size={15} /> Your acceptance is confirmed. HR will reach out with next steps.</div>
            ) : null}
          </Card>
        )}

        {activeTab === 'onboarding' && JOINING_STATUSES.includes(app.status) && (
          <Card title="Employee joining form" action={<Button iconRight="ArrowRight" onClick={() => navigate('/candidate/joining')}>Open joining form</Button>}>
            <p className="ta-cell-sub">One form for your personal details, PF and gratuity nominations, background verification and consents. Enter each detail once — your progress saves automatically, and details from your application are already filled in.</p>
          </Card>
        )}

        {activeTab === 'onboarding' && onboardingDocs.length > 0 && (
          <Card
            title="Onboarding documents"
            action={<Tag tone={onboardingDocs.every((d) => d.status === 'verified') ? 'green' : 'amber'}>
              {onboardingDocs.filter((d) => d.status === 'verified').length} of {onboardingDocs.length} done
            </Tag>}
          >
            <p className="ta-cell-sub" style={{ marginBottom: 10 }}>
              A few items to complete your onboarding — fill in each form or upload each document below.
            </p>
            <div className="ta-stack" style={{ gap: 8 }}>
              {onboardingDocs.map((d) => {
                const meta = DOC_STATUS_META[d.status] || { label: d.status, tone: 'grey' };
                const canAct = ['requested', 'revision_required'].includes(d.status);
                const busy = !!onboardingBusy[d.id];
                const isForm = Array.isArray(d.field_schema) && d.field_schema.length > 0;

                if (isForm) {
                  return (
                    <div className="ta-docrow ta-docrow--form" key={d.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="ta-cell-strong">{d.requirement_name}{d.required && <span className="cx-req" title="Required"> *</span>}</div>
                        </div>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </div>
                      {d.hr_remarks && (
                        <div className={`ta-note ${d.status === 'revision_required' ? 'ta-note--warn' : 'ta-note--info'}`}>
                          {d.status === 'revision_required' ? `Correction needed: ${d.hr_remarks}` : d.hr_remarks}
                        </div>
                      )}
                      {canAct ? (
                        <>
                          <OnboardingFormFields
                            schema={d.field_schema}
                            values={onboardingFormValuesFor(d)}
                            errors={onboardingFormErrors[d.id]}
                            onChange={(key, value) => setOnboardingFormValue(d, key, value)}
                          />
                          <div>
                            <Button icon="Send" onClick={() => submitOnboardingFormFor(d)} disabled={busy}>
                              {busy ? 'Submitting…' : d.status === 'revision_required' ? 'Resubmit' : 'Submit'}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="ta-cell-sub">Submitted — HR will review this shortly.</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="ta-docrow" key={d.id}>
                    <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ta-cell-strong">{d.requirement_name}{d.required && <span className="cx-req" title="Required"> *</span>}</div>
                      {d.hr_remarks && (
                        <div className="ta-cell-sub" style={d.status === 'revision_required' ? { color: 'var(--tag-red-fg)' } : undefined}>
                          {d.status === 'revision_required' ? `Correction needed: ${d.hr_remarks}` : d.hr_remarks}
                        </div>
                      )}
                    </div>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    {canAct && (
                      <span className="cx-docacts">
                        {busy ? <span className="ta-spinner" /> : (
                          <label className="ta-btn ta-btn--ghost" style={{ cursor: 'pointer' }}>
                            <Icon name="Upload" size={14} /> Upload
                            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => uploadOnboardingDoc(d, e.target.files)} />
                          </label>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
