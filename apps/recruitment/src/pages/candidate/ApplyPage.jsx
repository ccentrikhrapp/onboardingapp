import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import { Field, FieldGrid, Input, Select, Textarea } from '../../components/ta/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { useGoogleSignIn } from '../../components/auth/useGoogleSignIn.js';
import { useToast } from '../../context/ToastContext.jsx';
import { loadJSON, saveJSON } from '../../hooks/useLocalStorage.js';
import { candidateSupabase } from '../../lib/supabase.js';
import { resolveLink } from '../../api/applicationLinks.js';
import { uploadResume, parseResume } from '../../api/resumes.js';
import { listRequirements, uploadPendingDocument } from '../../api/documents.js';
import { submitApplication as submitApplicationApi } from '../../api/applications.js';
import { ApiError } from '../../api/client.js';
import { jobFromDb } from '../../api/mappers.js';
import { fileUploadError } from '../../utils/validation.js';
import {
  EXP_OPTIONS, NOTICE_OPTIONS, REQUIRED, LABELS, expToNumber, isFieldRequired, fieldError, validateFormFields,
  RESET_ON_NEW_RESUME, parsedToFormPatch, formToApplicationBlocks,
} from '../../utils/candidateForm.js';
import { returnErrorMessage, cleanAuthUrl } from '../../utils/authFlow.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/common/States.jsx';

const DRAFT_KEY = 'talentflow.apply.draft.v2';
const SOURCE_OPTIONS = ['Job Board', 'Referral', 'Social', 'Direct'];
/* Steps shown while the resume is uploading + being parsed server-side. */
const ANALYZE_STEPS = ['Uploading resume', 'Extracting text', 'Reading details', 'Populating your application'];

function blankForm(jobId) {
  return {
    jobId: jobId || null,
    // Lets a resume be uploaded/parsed before the candidate has signed in
    // at all — an unguessable folder name for the anonymous "pending"
    // storage path, adopted into their real folder once they do sign in
    // (see api/resumes.js#uploadResume and submit-application).
    draftId: crypto.randomUUID(),
    firstName: '', lastName: '', email: '', phone: '', currentLocation: '', experience: '',
    currentCompany: '', currentJobTitle: '', highestQualification: '', noticePeriod: '', expectedSalary: '',
    coverNote: '', portfolio: '', source: '',
    resume: null, resumePath: null, skills: [], autofilled: [],
  };
}

export default function ApplyPage() {
  const { jobId: paramJobId } = useParams();
  const [sp] = useSearchParams();
  const jobId = paramJobId || sp.get('job') || null;
  const refToken = sp.get('ref');

  const navigate = useNavigate();
  const { getJob } = useApp();
  const { configured, user, loading: authLoading, ensureSession } = useCandidateAuth();
  const toast = useToast();
  const isRealUser = !!user && !user.is_anonymous;
  // Lands back on this exact apply URL (job id + ?ref= token, if any) so a
  // TA-link application isn't lost by bouncing through a generic page.
  const applyLandingPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined;
  const { error: googleError, signing: googleSigning, trigger: triggerGoogle } = useGoogleSignIn(applyLandingPath, useCandidateAuth);
  // Supabase sends the browser back with an error in the URL when the Google
  // round-trip itself failed (declined, or a real auth error) — shown in
  // plain language instead of silently doing nothing and leaving the
  // "Sign up with Google" card looking like it never responded.
  const [returnUrlError, setReturnUrlError] = useState(() => { try { return returnErrorMessage(); } catch { return ''; } });
  useEffect(() => { cleanAuthUrl(); }, []);

  // A TA link (?ref=token) is resolved server-side into the job + recruiter.
  const [link, setLink] = useState(null);
  const [linkError, setLinkError] = useState('');
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!refToken || !configured) return;
    resolveLink(refToken)
      .then(setLink)
      .catch((e) => setLinkError(e.message || 'This application link is not valid.'));
  }, [refToken, configured]);

  if (!configured) {
    return (
      <div className="cx-page cx-page--form cx-compact">
        <div className="wsauth__alert" role="alert">
          <Icon name="AlertCircle" size={15} /> Backend not configured yet — see .env.example.
        </div>
      </div>
    );
  }

  const job = link ? jobFromDb(link.job) : jobId ? getJob(jobId) : null;

  const [form, setForm] = useState(() => {
    const d = loadJSON(DRAFT_KEY, null);
    if (d && d.jobId === (jobId || null)) return d.draftId ? d : { ...d, draftId: crypto.randomUUID() };
    return blankForm(jobId);
  });
  const [errors, setErrors] = useState({});
  const [analyzeIdx, setAnalyzeIdx] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const timers = useRef([]);
  // Bumped on every new upload so an in-flight upload/parse from a resume
  // the candidate has since replaced can't land its results after the fact.
  const uploadToken = useRef(0);

  // Required documents — data-driven (document_requirements, stage='application').
  const [requirements, setRequirements] = useState([]);
  const [docState, setDocState] = useState({}); // requirementId -> { uploading, path, fileName, sizeBytes, mimeType, cannotProvide, reason, reasonDraft }
  useEffect(() => {
    listRequirements('application').then(setRequirements).catch(() => setRequirements([]));
  }, []);

  // The Google account IS the candidate's identity: its email fills the form
  // (a resume that names another address must not split the account from the
  // application), and its name pre-fills first/last name when they're empty.
  const googleEmail = isRealUser ? (user.email || '').toLowerCase() : '';
  useEffect(() => {
    if (!googleEmail) return;
    setForm((f) => {
      const full = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim().split(/s+/);
      const patch = {};
      if (f.email !== googleEmail) patch.email = googleEmail;
      if (!f.firstName && full[0]) patch.firstName = full[0];
      if (!f.lastName && full.length > 1) patch.lastName = full.slice(1).join(' ');
      return Object.keys(patch).length ? { ...f, ...patch } : f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEmail, form.email]);

  const parsing = analyzeIdx > -1 && analyzeIdx < ANALYZE_STEPS.length;
  const parsed = form.autofilled.length > 0;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isAuto = (k) => parsed && form.autofilled.includes(k);

  const isRequired = (k) => isFieldRequired(form, k);

  const validateField = (k, v) => {
    const msg = fieldError(form, k, v);
    setErrors((e) => ({ ...e, [k]: msg || undefined }));
    return !msg;
  };
  const setAndValidate = (k, v) => {
    set({ [k]: v });
    if (errors[k] !== undefined) validateField(k, v);
  };

  const validateAll = () => {
    const e = validateFormFields(form);
    if (!form.resume) e.resume = 'Please upload your resume (PDF, DOC or DOCX under 5 MB).';
    requirements
      .filter((r) => r.requirement_class !== 'conditional' && r.requirement_class !== 'optional')
      .forEach((r) => {
        const d = docState[r.id];
        if (!d || (!d.path && !(d.cannotProvide && d.reason))) {
          e[`doc_${r.key}`] = d?.cannotProvide
            ? `Please explain why you can't provide the ${r.name.toLowerCase()}.`
            : `${r.name} is required.`;
        }
      });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Resume values never overwrite something the candidate already typed: an empty field
  // is filled, a different filled value is listed for the candidate to choose.
  const formRef = useRef(form);
  formRef.current = form;
  const [resumeReview, setResumeReview] = useState(null); // { filled, conflicts: [{ key, existing, resume }] }
  const applyParsed = (p) => {
    const current = formRef.current;
    const patch = parsedToFormPatch(current, p);
    const next = {};
    const filledKeys = [];
    const conflicts = [];
    for (const k of ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'experience', 'currentCompany', 'currentJobTitle', 'highestQualification', 'portfolio']) {
      const incoming = patch[k];
      const existing = current[k];
      if (incoming === undefined || incoming === null || String(incoming).trim() === '') continue;
      if (String(existing ?? '').trim() === '') { next[k] = incoming; filledKeys.push(k); }
      else if (String(existing).trim() !== String(incoming).trim()) conflicts.push({ key: k, existing, resume: incoming });
    }
    if (!(current.skills?.length) && patch.skills?.length) { next.skills = patch.skills; filledKeys.push('skills'); }
    setForm((f) => ({ ...f, ...next, autofilled: [...new Set([...(f.autofilled || []), ...filledKeys])] }));
    setResumeReview({ filled: filledKeys.length, conflicts });
    setErrors({});
  };
  const useResumeValue = (c) => {
    setForm((f) => ({ ...f, [c.key]: c.resume, autofilled: [...new Set([...(f.autofilled || []), c.key])] }));
    setResumeReview((r) => r && { ...r, conflicts: r.conflicts.filter((x) => x.key !== c.key) });
  };
  const keepMine = (c) => setResumeReview((r) => r && { ...r, conflicts: r.conflicts.filter((x) => x.key !== c.key) });

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const fileErr = fileUploadError(file, { allowedExt: ['pdf', 'doc', 'docx'], maxMB: 5 });
    if (fileErr) {
      setErrors((e) => ({ ...e, resume: fileErr }));
      return;
    }
    setErrors((e) => ({ ...e, resume: undefined }));

    // Guards against a slower upload/parse from a resume the candidate has
    // since replaced landing its results after a newer one already did.
    const myToken = ++uploadToken.current;
    const isStale = () => uploadToken.current !== myToken;

    // A new file (including "Replace") should reflect only what this resume
    // says — clear the previously auto-filled fields first so nothing from
    // an earlier upload (or an earlier draft) can linger and look mismatched.
    set({ ...RESET_ON_NEW_RESUME });
    setResumeReview(null);

    try {
      setAnalyzeIdx(0);
      const { path, meta } = await uploadResume(file, form.draftId, candidateSupabase);
      if (isStale()) return;
      set({ resume: meta, resumePath: path });
      setAnalyzeIdx(2);
      const { fields, extracted } = await parseResume(path, candidateSupabase);
      if (isStale()) return;
      setAnalyzeIdx(ANALYZE_STEPS.length);
      if (extracted?.length) {
        applyParsed(fields);
        toast.success('Resume details extracted — review each field before submitting.');
      } else {
        toast.info('Resume uploaded. We could not auto-fill from this file — please complete the form.');
      }
      setAnalyzeIdx(-1);
    } catch (err) {
      if (isStale()) return;
      setAnalyzeIdx(-1);
      set({ resume: null, resumePath: null });
      setErrors((e) => ({ ...e, resume: err.message || 'Upload failed. Please try again.' }));
    }
  };

  const removeResume = () => {
    timers.current.forEach(clearTimeout);
    setAnalyzeIdx(-1);
    set({ resume: null, resumePath: null, autofilled: [] });
    setResumeReview(null);
  };

  const setDoc = (reqId, patch) => setDocState((s) => ({ ...s, [reqId]: { ...s[reqId], ...patch } }));

  const uploadDoc = async (req, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setDoc(req.id, { uploading: true });
    try {
      await ensureSession();
      const uploaded = await uploadPendingDocument(file, req);
      setDoc(req.id, {
        uploading: false, path: uploaded.path, fileName: uploaded.fileName,
        mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes,
        cannotProvide: false, reason: '',
      });
      setErrors((e) => ({ ...e, [`doc_${req.key}`]: undefined }));
    } catch (err) {
      setDoc(req.id, { uploading: false });
      setErrors((e) => ({ ...e, [`doc_${req.key}`]: err.message || 'Upload failed.' }));
    }
  };

  const removeDoc = (req) => setDoc(req.id, { path: null, fileName: null, cannotProvide: false });

  const toggleCannotProvide = (req) => {
    const cur = docState[req.id] || {};
    setDoc(req.id, { cannotProvide: !cur.cannotProvide, path: null, fileName: null, reasonDraft: cur.reason || '' });
  };

  const confirmCannotProvide = (req) => {
    const reason = (docState[req.id]?.reasonDraft || '').trim();
    if (!reason) return;
    setDoc(req.id, { reason });
    setErrors((e) => ({ ...e, [`doc_${req.key}`]: undefined }));
  };

  const saveDraft = () => {
    saveJSON(DRAFT_KEY, form);
    toast.success('Draft saved on this device.');
  };

  // Google is a full-page redirect (and back), which wipes normal React
  // state — save what's on the form first so it's exactly as the candidate
  // left it once they land back on this same URL (ApplyPage already reloads
  // an unfinished draft from here on mount, whoever ends up signed in).
  const signUpWithGoogle = () => {
    saveJSON(DRAFT_KEY, form);
    triggerGoogle();
  };

  const buildPayload = () => ({
    jobId: link ? link.job.id : job ? job.id : null,
    linkToken: refToken || undefined,
    source: link ? 'ta_link' : 'careers',
    autofilled: form.autofilled,
    ...formToApplicationBlocks(form),
    resumePath: form.resumePath,
    resumeMeta: form.resume,
    documents: requirements.map((r) => {
      const d = docState[r.id];
      if (!d) return null;
      if (d.cannotProvide) return { requirementId: r.id, requirementKey: r.key, cannotProvide: true, reason: d.reason };
      if (!d.path) return null;
      return { requirementId: r.id, requirementKey: r.key, path: d.path, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes };
    }).filter(Boolean),
  });

  const submit = async () => {
    setServerError('');
    if (!validateAll()) {
      toast.error('Please fix the highlighted fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Applying needs a Google account — the gate below normally makes this
    // unreachable without one; this is the belt-and-braces check.
    if (!isRealUser) {
      setServerError('Please sign up or sign in with Google to apply.');
      return;
    }
    if (submitting) return; // guards a fast double-click/double-tap
    setSubmitting(true);

    try {
      const result = await submitApplicationApi(buildPayload());
      saveJSON(DRAFT_KEY, null);
      setSubmitting(false);
      navigate('/candidate/application/success', {
        state: {
          applicationId: result.applicationId,
          applicationCode: result.applicationCode,
          candidateCode: result.candidateCode,
          jobTitle: job ? job.title : 'General Application',
        },
      });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) {
        const mapped = {};
        for (const [k, v] of Object.entries(err.fields)) {
          mapped[k === 'mobile' ? 'phone' : k] = v;
        }
        setErrors((e) => ({ ...e, ...mapped }));
      }
      setServerError(err.message || 'Something went wrong submitting your application.');
      toast.error(err.message || 'Could not submit your application.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const requiredDocs = requirements.filter((r) => r.requirement_class !== 'conditional' && r.requirement_class !== 'optional');
  const filledDocs = requiredDocs.filter((r) => {
    const d = docState[r.id];
    return d && (d.path || (d.cannotProvide && d.reason));
  }).length;
  const filledRequired = useMemo(
    () => REQUIRED.filter((k) => String(form[k]).trim()).length + (form.resume ? 1 : 0) + filledDocs,
    [form, filledDocs]
  );
  const totalRequired = REQUIRED.length + 1 + requiredDocs.length;
  const pct = Math.round((filledRequired / totalRequired) * 100);

  const completion = (
    <div className="cx-jobinfo__progress">
      <div className="cx-jobinfo__progress-top"><span>Completion</span><span>{filledRequired} / {totalRequired}</span></div>
      <div className="cx-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );

  if (linkError) {
    return (
      <div className="cx-page cx-page--form cx-compact">
        <div className="wsauth__alert" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="AlertCircle" size={15} /> {linkError}
        </div>
        <Button variant="ghost" icon="ArrowLeft" onClick={() => navigate('/candidate/jobs')}>Browse open roles</Button>
      </div>
    );
  }

  const confidential = link?.inviteType === 'confidential';

  // Applying requires a Google account: new candidates sign up, returning ones
  // sign in (same Google button — Google/Supabase decide which). Whatever was
  // typed before is saved first and restored when they land back on this page.
  if (authLoading) {
    return <div className="cx-page"><SkeletonPage /></div>;
  }
  if (!isRealUser) {
    return (
      <div className="cx-page cx-page--narrow">
        <button className="ta-link" onClick={() => navigate(job ? `/candidate/jobs/${job.id}` : '/candidate/jobs')} style={{ marginBottom: 14 }}>
          <Icon name="ArrowLeft" size={14} /> {job ? 'Back to job' : 'Back to jobs'}
        </button>
        <div className="cx-page__head">
          <h1 className="cx-page__title">{job ? `Apply for ${job.title}` : 'Submit your application'}</h1>
          <p className="cx-page__sub">Sign up with your Google account to start your application. It takes one click, and you can track every step afterwards.</p>
        </div>
        <Card>
          {job && (
            <div className="ta-cell-sub" style={{ marginBottom: 14 }}>
              {job.department} · {job.location} · {job.employmentType}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button icon="CircleUserRound" onClick={signUpWithGoogle} disabled={googleSigning}>
              {googleSigning ? 'Opening Google…' : 'Sign up with Google'}
            </Button>
            <Button variant="ghost" icon="CircleUserRound" onClick={signUpWithGoogle} disabled={googleSigning}>
              Sign in with Google
            </Button>
          </div>
          <p className="ta-cell-sub" style={{ marginTop: 10 }}>New here? Sign up. Already have an account? Sign in — both use your Google account.</p>
          {(googleError || returnUrlError) && (
            <div className="ta-field__error" style={{ marginTop: 12 }}>
              <Icon name="AlertCircle" size={12} /> {googleError || returnUrlError}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="cx-page cx-page--form cx-compact">
      <button className="ta-link" onClick={() => navigate(job ? `/candidate/jobs/${job.id}` : '/candidate/jobs')} style={{ marginBottom: 14 }}>
        <Icon name="ArrowLeft" size={14} /> {job ? 'Back to job' : 'Back to jobs'}
      </button>

      <div className="cx-page__head">
        <h1 className="cx-page__title">{confidential ? 'Your professional profile' : job ? 'Apply for this opportunity' : 'Submit your application'}</h1>
        <p className="cx-page__sub">
          {confidential
            ? "We'd like to invite you to explore an opportunity that may align with your experience. Please review the role and share your professional background below. Fields marked * are required."
            : link?.recruiterName
            ? `Applying through ${link.recruiterName}. Fields marked * are required.`
            : job
            ? 'Complete the details below. Fields marked * are required.'
            : "Submit your profile and we'll consider you for current and future roles. Fields marked * are required."}
        </p>
      </div>

      {serverError && (
        <div className="wsauth__alert" role="alert" style={{ marginBottom: 14 }}>
          <Icon name="AlertCircle" size={15} /> {serverError}
        </div>
      )}

      {job ? (
        <div className="cx-jobinfo">
          <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Position</span><span className="cx-jobinfo__value">{job.title}</span></div>
          <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Department</span><span className="cx-jobinfo__value">{job.department}</span></div>
          <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Location</span><span className="cx-jobinfo__value">{job.location}</span></div>
          <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Employment</span><span className="cx-jobinfo__value">{job.employmentType} · {job.workMode}</span></div>
          <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Experience</span><span className="cx-jobinfo__value">{job.experience}</span></div>
          {completion}
        </div>
      ) : (
        <div className="cx-jobinfo">
          <span className="cx-jobinfo__note">General application — not tied to a specific role.</span>
          {completion}
        </div>
      )}

      <div>
          {/* Resume upload */}
          <div className="cx-upload" style={{ marginBottom: 14 }}>
            <span className="cx-upload__icon"><Icon name="UploadCloud" size={17} /></span>
            {!form.resume ? (
              <>
                <div className="ta-cell-mute" style={{ flex: 1 }}>
                  <div className="cx-upload__title">Upload your resume</div>
                  <div className="cx-upload__sub">We'll use it to pre-fill your application.</div>
                </div>
                <Button variant="ghost" icon="Upload" onClick={() => fileRef.current?.click()}>Upload resume</Button>
              </>
            ) : parsing ? (
              <>
                <div style={{ flex: 1 }}>
                  <div className="cx-upload__title">Analyzing resume…</div>
                  <div className="cx-upload__sub">{ANALYZE_STEPS[Math.min(analyzeIdx, ANALYZE_STEPS.length - 1)]}</div>
                </div>
                <span className="ta-spinner" />
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cx-upload__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.resume.name}</div>
                  <div className="cx-upload__sub" style={{ color: 'var(--tag-green-fg)', fontWeight: 600 }}>
                    <Icon name="CheckCircle2" size={11} /> Details extracted · {Math.round((form.resume.size || 0) / 1024)} KB
                  </div>
                </div>
                <Button variant="ghost" onClick={() => fileRef.current?.click()}>Replace</Button>
                <button className="ta-iconbtn" onClick={removeResume} aria-label="Remove resume"><Icon name="X" size={15} /></button>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => handleFile(e.target.files)} />
          </div>
          {errors.resume && (
            <div className="ta-field__error" style={{ marginBottom: 14 }}>
              <Icon name="AlertCircle" size={12} /> {errors.resume}
            </div>
          )}
          {resumeReview && (
            <div className="ta-note ta-note--info" style={{ marginBottom: 14, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div>
                <Icon name="CheckCircle2" size={14} /> <strong>Resume processed.</strong> {resumeReview.filled} field{resumeReview.filled === 1 ? '' : 's'} filled from your resume
                {resumeReview.conflicts.length ? <>, <strong>{resumeReview.conflicts.length} need{resumeReview.conflicts.length === 1 ? 's' : ''} your review</strong> — we kept what you typed.</> : '.'}
                {' '}Nothing is submitted until you press Submit.
              </div>
              {resumeReview.conflicts.map((c) => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="ta-cell-sub" style={{ minWidth: 150 }}>{LABELS[c.key] || c.key}</span>
                  <span style={{ flex: 1, minWidth: 180 }}>You: <strong>{String(c.existing)}</strong> · Resume: <strong>{String(c.resume)}</strong></span>
                  <Button variant="ghost" onClick={() => useResumeValue(c)}>Use resume value</Button>
                  <Button variant="ghost" onClick={() => keepMine(c)}>Keep mine</Button>
                </div>
              ))}
            </div>
          )}

          <div className="cx-section">
            <div className="cx-section__head">
              <span className="cx-section__num">1</span>
              <h3 className="cx-section__title">Candidate information</h3>
            </div>
            <Card>
              <FieldGrid>
                <Field label="First name" required error={errors.firstName} extracted={isAuto('firstName')}>
                  <Input value={form.firstName} error={errors.firstName} onChange={(e) => setAndValidate('firstName', e.target.value)} onBlur={(e) => validateField('firstName', e.target.value)} />
                </Field>
                <Field label="Last name" required error={errors.lastName} extracted={isAuto('lastName')}>
                  <Input value={form.lastName} error={errors.lastName} onChange={(e) => setAndValidate('lastName', e.target.value)} onBlur={(e) => validateField('lastName', e.target.value)} />
                </Field>
                <Field label="Email" required error={errors.email} extracted={isAuto('email')} hint={googleEmail ? 'This is your Google account email.' : undefined}>
                  <Input type="email" value={form.email} error={errors.email} readOnly={!!googleEmail} onChange={(e) => setAndValidate('email', e.target.value)} onBlur={(e) => validateField('email', e.target.value)} />
                </Field>
                <Field label="Phone number" required error={errors.phone} extracted={isAuto('phone')}>
                  <Input value={form.phone} error={errors.phone} onChange={(e) => setAndValidate('phone', e.target.value)} onBlur={(e) => validateField('phone', e.target.value)} />
                </Field>
                <Field label="Current location" required error={errors.currentLocation} extracted={isAuto('currentLocation')}>
                  <Input value={form.currentLocation} error={errors.currentLocation} onChange={(e) => setAndValidate('currentLocation', e.target.value)} onBlur={(e) => validateField('currentLocation', e.target.value)} />
                </Field>
                <Field label="Total experience" required error={errors.experience} extracted={isAuto('experience')}>
                  <Select value={form.experience} error={errors.experience} placeholder="Select" options={EXP_OPTIONS} onChange={(e) => setAndValidate('experience', e.target.value)} />
                </Field>
              </FieldGrid>
            </Card>
          </div>

          <div className="cx-section">
            <div className="cx-section__head">
              <span className="cx-section__num">2</span>
              <h3 className="cx-section__title">Professional information</h3>
            </div>
            <Card>
              <FieldGrid>
                <Field label="Current company" extracted={isAuto('currentCompany')}>
                  <Input value={form.currentCompany} onChange={(e) => set({ currentCompany: e.target.value })} />
                </Field>
                <Field label="Current job title" extracted={isAuto('currentJobTitle')}>
                  <Input value={form.currentJobTitle} onChange={(e) => set({ currentJobTitle: e.target.value })} />
                </Field>
                <Field label="Highest qualification" extracted={isAuto('highestQualification')}>
                  <Input value={form.highestQualification} onChange={(e) => set({ highestQualification: e.target.value })} />
                </Field>
                <Field label="Notice period" required={isRequired('noticePeriod')} error={errors.noticePeriod}>
                  <Select value={form.noticePeriod} error={errors.noticePeriod} placeholder="Select" options={NOTICE_OPTIONS} onChange={(e) => setAndValidate('noticePeriod', e.target.value)} />
                </Field>
                <Field label="Expected salary (₹ / year)" hint="Optional" full error={errors.expectedSalary}>
                  <Input
                    type="number" min="0" value={form.expectedSalary} error={errors.expectedSalary}
                    onChange={(e) => setAndValidate('expectedSalary', e.target.value)}
                    onBlur={(e) => validateField('expectedSalary', e.target.value)}
                  />
                </Field>
              </FieldGrid>
            </Card>
          </div>

          <div className="cx-section">
            <div className="cx-section__head">
              <span className="cx-section__num">3</span>
              <h3 className="cx-section__title">Application details</h3>
            </div>
            <Card>
              <Field label="Cover note" hint="Optional">
                <Textarea rows={3} value={form.coverNote} onChange={(e) => set({ coverNote: e.target.value })} placeholder="Anything you'd like the hiring team to know" />
              </Field>
              <FieldGrid>
                <Field label="Portfolio / LinkedIn URL" hint="Optional" error={errors.portfolio}>
                  <Input
                    value={form.portfolio} error={errors.portfolio} placeholder="https://"
                    onChange={(e) => setAndValidate('portfolio', e.target.value)}
                    onBlur={(e) => validateField('portfolio', e.target.value)}
                  />
                </Field>
                <Field label="How did you hear about us?" hint="Optional">
                  <Select value={form.source} placeholder="Select" options={SOURCE_OPTIONS} onChange={(e) => set({ source: e.target.value })} />
                </Field>
              </FieldGrid>
            </Card>
          </div>

          {requirements.length > 0 && (
            <div className="cx-section">
              <div className="cx-section__head">
                <span className="cx-section__num">4</span>
                <h3 className="cx-section__title">Required documents</h3>
              </div>
              <Card>
                <div className="ta-stack">
                  {requirements.map((r) => {
                    const d = docState[r.id] || {};
                    const err = errors[`doc_${r.key}`];
                    return (
                      <div key={r.id} className="cx-upload" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="cx-upload__icon"><Icon name="FileText" size={17} /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="cx-upload__title">
                              {r.name}{r.requirement_class !== 'conditional' && r.requirement_class !== 'optional' && <span className="cx-req" title="Required"> *</span>}
                            </div>
                            {d.fileName && !d.cannotProvide && (
                              <div className="cx-upload__sub" style={{ color: 'var(--tag-green-fg)', fontWeight: 600 }}>
                                <Icon name="CheckCircle2" size={11} /> {d.fileName}
                              </div>
                            )}
                            {d.cannotProvide && d.reason && (
                              <div className="cx-upload__sub" style={{ color: 'var(--tag-amber-fg)' }}>Reason recorded</div>
                            )}
                            {!d.fileName && !d.cannotProvide && r.description && (
                              <div className="cx-upload__sub">{r.description}</div>
                            )}
                          </div>
                          {d.uploading ? (
                            <span className="ta-spinner" />
                          ) : d.fileName && !d.cannotProvide ? (
                            <>
                              <Button variant="ghost" onClick={() => document.getElementById(`doc-input-${r.id}`)?.click()}>Replace</Button>
                              <button className="ta-iconbtn" onClick={() => removeDoc(r)} aria-label={`Remove ${r.name}`}><Icon name="X" size={15} /></button>
                            </>
                          ) : !d.cannotProvide ? (
                            <Button variant="ghost" icon="Upload" onClick={() => document.getElementById(`doc-input-${r.id}`)?.click()}>Upload</Button>
                          ) : null}
                          {r.can_mark_cannot_provide && !d.fileName && (
                            <button className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => toggleCannotProvide(r)}>
                              {d.cannotProvide ? 'Cancel' : "Can't provide"}
                            </button>
                          )}
                          <input
                            id={`doc-input-${r.id}`}
                            type="file"
                            accept={(r.allowed_file_types || []).map((t) => `.${t}`).join(',')}
                            hidden
                            onChange={(e) => uploadDoc(r, e.target.files)}
                          />
                        </div>

                        {d.cannotProvide && !d.reason && (
                          <div className="cx-docreason">
                            <textarea
                              className="cx-docreason__input"
                              rows={2}
                              placeholder={`Why can't you provide the ${r.name.toLowerCase()}?`}
                              value={d.reasonDraft || ''}
                              onChange={(e) => setDoc(r.id, { reasonDraft: e.target.value })}
                            />
                            <div className="cx-docreason__btns">
                              <button className="ta-btn ta-btn--sm" onClick={() => confirmCannotProvide(r)} disabled={!(d.reasonDraft || '').trim()}>
                                Save reason
                              </button>
                            </div>
                            {r.warning_message && (
                              <div className="ta-note ta-note--warn" style={{ marginTop: 8 }}>
                                <Icon name="AlertTriangle" size={14} /> <span>{r.warning_message}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {err && (
                          <div className="ta-field__error"><Icon name="AlertCircle" size={12} /> {err}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          <div className="cx-formbar">
            <span className="cx-formbar__note">By submitting, you confirm that the information provided is accurate.</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" icon="Save" onClick={saveDraft}>Save draft</Button>
              <Button iconRight="ArrowRight" onClick={submit} disabled={submitting || parsing}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </Button>
            </div>
          </div>
      </div>
    </div>
  );
}
