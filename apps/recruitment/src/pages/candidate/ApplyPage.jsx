import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import { Field, FieldGrid, Input, Select, Textarea } from '../../components/ta/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { loadJSON, saveJSON } from '../../hooks/useLocalStorage.js';
import { uid } from '../../utils/ids.js';
import { resolveLink } from '../../api/applicationLinks.js';
import { uploadResume, parseResume } from '../../api/resumes.js';
import { listRequirements, uploadPendingDocument } from '../../api/documents.js';
import { submitApplication as submitApplicationApi } from '../../api/applications.js';
import { ApiError } from '../../api/client.js';
import { jobFromDb } from '../../api/mappers.js';

const DRAFT_KEY = 'talentflow.apply.draft.v2';
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[+]?[\d\s()-]{8,}$/;
const EXP_OPTIONS = ['Fresher', '0–2 years', '2–5 years', '5–8 years', '8+ years'];
const NOTICE_OPTIONS = ['Immediate', '15 Days', '30 Days', '60 Days', '90 Days'];
const SOURCE_OPTIONS = ['Job Board', 'Referral', 'Social', 'Direct'];
/* Steps shown while the resume is uploading + being parsed server-side. */
const ANALYZE_STEPS = ['Uploading resume', 'Extracting text', 'Reading details', 'Populating your application'];

function expBucket(y) {
  const n = Number(y) || 0;
  if (n <= 0) return 'Fresher';
  if (n <= 2) return '0–2 years';
  if (n <= 5) return '2–5 years';
  if (n <= 8) return '5–8 years';
  return '8+ years';
}
function expToNumber(b) {
  return { Fresher: '0', '0–2 years': '1', '2–5 years': '3', '5–8 years': '6', '8+ years': '9' }[b] || '';
}

function blankForm(jobId) {
  return {
    jobId: jobId || null,
    firstName: '', lastName: '', email: '', phone: '', currentLocation: '', experience: '',
    currentCompany: '', currentJobTitle: '', highestQualification: '', noticePeriod: '', expectedSalary: '',
    coverNote: '', portfolio: '', source: '',
    resume: null, resumePath: null, skills: [], autofilled: [],
  };
}

const REQUIRED = ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'experience'];
const LABELS = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone number',
  currentLocation: 'Current location', experience: 'Total experience',
};

export default function ApplyPage() {
  const { jobId: paramJobId } = useParams();
  const [sp] = useSearchParams();
  const jobId = paramJobId || sp.get('job') || null;
  const refToken = sp.get('ref');

  const navigate = useNavigate();
  const { getJob } = useApp();
  const { configured, user, signInWithGoogle } = useAuth();
  const toast = useToast();

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
      <div className="cx-page cx-page--form">
        <div className="wsauth__alert" role="alert">
          <Icon name="AlertCircle" size={15} /> Backend not configured yet — see .env.example.
        </div>
      </div>
    );
  }

  const job = link ? jobFromDb(link.job) : jobId ? getJob(jobId) : null;
  const needsSignIn = configured && !user;

  const [form, setForm] = useState(() => {
    const d = loadJSON(DRAFT_KEY, null);
    return d && d.jobId === (jobId || null) ? d : blankForm(jobId);
  });
  const [errors, setErrors] = useState({});
  const [analyzeIdx, setAnalyzeIdx] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const timers = useRef([]);

  // Required documents — data-driven (document_requirements, stage='application').
  const [requirements, setRequirements] = useState([]);
  const [docState, setDocState] = useState({}); // requirementId -> { uploading, path, fileName, sizeBytes, mimeType, cannotProvide, reason, reasonDraft }
  useEffect(() => {
    listRequirements('application').then(setRequirements).catch(() => setRequirements([]));
  }, []);

  const parsing = analyzeIdx > -1 && analyzeIdx < ANALYZE_STEPS.length;
  const parsed = form.autofilled.length > 0;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isAuto = (k) => parsed && form.autofilled.includes(k);

  const validateField = (k, v) => {
    let msg = '';
    if (REQUIRED.includes(k) && !String(v).trim()) msg = `${LABELS[k]} is required.`;
    else if (k === 'email' && v && !emailRe.test(v)) msg = 'Please enter a valid email address.';
    else if (k === 'phone' && v && !phoneRe.test(v)) msg = 'Please enter a valid phone number.';
    setErrors((e) => ({ ...e, [k]: msg || undefined }));
    return !msg;
  };
  const setAndValidate = (k, v) => {
    set({ [k]: v });
    if (errors[k] !== undefined) validateField(k, v);
  };

  const validateAll = () => {
    const e = {};
    REQUIRED.forEach((k) => {
      if (!String(form[k]).trim()) e[k] = `${LABELS[k]} is required.`;
    });
    if (form.email && !emailRe.test(form.email)) e.email = 'Please enter a valid email address.';
    if (form.phone && !phoneRe.test(form.phone)) e.phone = 'Please enter a valid phone number.';
    if (!form.resume) e.resume = 'Please upload your resume (PDF, DOC or DOCX under 5 MB).';
    requirements
      .filter((r) => r.requirement_class !== 'conditional')
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

  const applyParsed = (p) => {
    setForm((f) => ({
      ...f,
      firstName: p.firstName || f.firstName,
      lastName: p.lastName || f.lastName,
      email: p.email || f.email,
      phone: p.mobile || f.phone,
      currentLocation: p.currentLocation || f.currentLocation,
      experience: p.totalExperience ? expBucket(p.totalExperience) : f.experience,
      currentCompany: p.currentCompany || f.currentCompany,
      currentJobTitle: p.currentJobTitle || f.currentJobTitle,
      highestQualification: p.education?.[0]?.qualification || f.highestQualification,
      portfolio: p.portfolio || p.linkedin || f.portfolio,
      skills: p.skills?.length ? [...p.skills] : f.skills,
      autofilled: ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'experience', 'currentCompany', 'currentJobTitle', 'highestQualification']
        .filter((k) => (k === 'phone' ? p.mobile : p[k])),
    }));
    setErrors({});
  };

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setErrors((e) => ({ ...e, resume: 'Please upload a PDF, DOC or DOCX file under 5 MB.' }));
      return;
    }
    setErrors((e) => ({ ...e, resume: undefined }));

    try {
      setAnalyzeIdx(0);
      const { path, meta } = await uploadResume(file);
      set({ resume: meta, resumePath: path });
      setAnalyzeIdx(2);
      const { fields, extracted } = await parseResume(path);
      setAnalyzeIdx(ANALYZE_STEPS.length);
      if (extracted?.length) {
        applyParsed(fields);
        toast.success('Resume details extracted — review each field before submitting.');
      } else {
        toast.info('Resume uploaded. We could not auto-fill from this file — please complete the form.');
      }
      setAnalyzeIdx(-1);
    } catch (err) {
      setAnalyzeIdx(-1);
      set({ resume: null, resumePath: null });
      setErrors((e) => ({ ...e, resume: err.message || 'Upload failed. Please try again.' }));
    }
  };

  const removeResume = () => {
    timers.current.forEach(clearTimeout);
    setAnalyzeIdx(-1);
    set({ resume: null, resumePath: null, autofilled: [] });
  };

  const setDoc = (reqId, patch) => setDocState((s) => ({ ...s, [reqId]: { ...s[reqId], ...patch } }));

  const uploadDoc = async (req, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setDoc(req.id, { uploading: true });
    try {
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

  const buildPayload = () => ({
    jobId: link ? link.job.id : job ? job.id : null,
    linkToken: refToken || undefined,
    source: link ? 'ta_link' : 'careers',
    autofilled: form.autofilled,
    personal: {
      firstName: form.firstName, middleName: '', lastName: form.lastName,
      email: form.email, mobile: form.phone, dob: '', gender: '', nationality: '',
      currentLocation: form.currentLocation, preferredLocation: form.currentLocation,
      address: { line1: '', line2: '', city: form.currentLocation, state: '', country: 'India', postalCode: '' },
    },
    professional: {
      currentJobTitle: form.currentJobTitle, currentCompany: form.currentCompany,
      totalExperience: expToNumber(form.experience), relevantExperience: '',
      employmentStatus: form.currentCompany ? 'Employed' : '', currentCTC: '',
      expectedCTC: form.expectedSalary, noticePeriod: form.noticePeriod,
      preferredJobLocation: form.currentLocation,
      skills: form.skills, certifications: [], languages: [],
    },
    education: [{ id: uid('edu'), qualification: form.highestQualification, university: '', specialization: '', year: '', grade: '' }],
    additional: { coverNote: form.coverNote, referral: '', portfolio: form.portfolio, howHeard: form.source },
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
    setSubmitting(true);

    try {
      const result = await submitApplicationApi(buildPayload());
      saveJSON(DRAFT_KEY, null);
      setSubmitting(false);
      navigate('/candidate/application/success', {
        state: {
          applicationId: result.applicationId,
          applicationCode: result.applicationCode,
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

  const requiredDocs = requirements.filter((r) => r.requirement_class !== 'conditional');
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
      <div className="cx-page cx-page--form">
        <div className="wsauth__alert" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="AlertCircle" size={15} /> {linkError}
        </div>
        <Button variant="ghost" icon="ArrowLeft" onClick={() => navigate('/candidate/jobs')}>Browse open roles</Button>
      </div>
    );
  }

  const confidential = link?.inviteType === 'confidential';

  if (needsSignIn) {
    return (
      <div className="cx-page cx-page--form">
        <div className="cx-page__head">
          <h1 className="cx-page__title">
            {confidential ? "You've been invited to explore an opportunity" : job ? `Apply — ${job.title}` : 'Start your application'}
          </h1>
          <p className="cx-page__sub">
            {confidential
              ? 'Sign in with your Google account to view the details and continue.'
              : link?.recruiterName
              ? `You're applying through ${link.recruiterName}. Sign in to continue.`
              : 'Sign in with your Google account to start and track your application.'}
          </p>
        </div>
        {job && (
          <div className="cx-jobinfo" style={{ marginBottom: 16 }}>
            <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Position</span><span className="cx-jobinfo__value">{job.title}</span></div>
            <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Department</span><span className="cx-jobinfo__value">{job.department}</span></div>
            <div className="cx-jobinfo__item"><span className="cx-jobinfo__label">Location</span><span className="cx-jobinfo__value">{job.location}</span></div>
          </div>
        )}
        <Card>
          <Button icon="LogIn" onClick={() => signInWithGoogle(window.location.href)}>Sign in with Google</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="cx-page cx-page--form">
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
                <Field label="Email" required error={errors.email} extracted={isAuto('email')}>
                  <Input type="email" value={form.email} error={errors.email} onChange={(e) => setAndValidate('email', e.target.value)} onBlur={(e) => validateField('email', e.target.value)} />
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
                <Field label="Notice period">
                  <Select value={form.noticePeriod} placeholder="Select" options={NOTICE_OPTIONS} onChange={(e) => set({ noticePeriod: e.target.value })} />
                </Field>
                <Field label="Expected salary (₹ / year)" hint="Optional" full>
                  <Input type="number" value={form.expectedSalary} onChange={(e) => set({ expectedSalary: e.target.value })} />
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
                <Field label="Portfolio / LinkedIn URL" hint="Optional">
                  <Input value={form.portfolio} onChange={(e) => set({ portfolio: e.target.value })} placeholder="https://" />
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
                              {r.name}{r.requirement_class !== 'conditional' && <span className="cx-req" title="Required"> *</span>}
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
