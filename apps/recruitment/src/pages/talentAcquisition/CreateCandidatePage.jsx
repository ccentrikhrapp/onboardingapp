import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import { Field, FieldGrid, Input, Select, Textarea } from '../../components/ta/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadResume, parseResume } from '../../api/resumes.js';
import { createTaCandidate } from '../../api/applications.js';
import { fileUploadError } from '../../utils/validation.js';
import {
  EXP_OPTIONS, NOTICE_OPTIONS, ANALYZE_STEPS, isFieldRequired, fieldError, validateFormFields,
  RESET_ON_NEW_RESUME, parsedToFormPatch, formToApplicationBlocks,
} from '../../utils/candidateForm.js';

const SOURCES = ['TA Sourced', 'Referral', 'Agency', 'Internal Referral', 'Other'];

function blank() {
  return {
    candidateSource: 'TA Sourced', jobId: '',
    firstName: '', lastName: '', email: '', phone: '', currentLocation: '', experience: '',
    currentCompany: '', currentJobTitle: '', highestQualification: '', noticePeriod: '', expectedSalary: '',
    coverNote: '', portfolio: '', source: '',
    resume: null, resumePath: null, skills: [], autofilled: [],
  };
}

/* TA "Add Candidate" — the same form as the Job Portal application (same
   fields, mandatory rules, validations, dropdowns, resume auto-fill; all
   shared through utils/candidateForm.js). The candidate is created in the SAME
   candidates table, then gets a secure link to sign in and verify the details
   (see create-ta-candidate + verify-ta-candidate). */
export default function CreateCandidatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { jobs } = useApp();
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [analyzeIdx, setAnalyzeIdx] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // { existingCandidate, existingApplications }
  const fileRef = useRef(null);
  const uploadToken = useRef(0);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parsing = analyzeIdx > -1 && analyzeIdx < ANALYZE_STEPS.length;
  const isAuto = (k) => form.autofilled.length > 0 && form.autofilled.includes(k);
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

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const fileErr = fileUploadError(file, { allowedExt: ['pdf', 'doc', 'docx'], maxMB: 5 });
    if (fileErr) {
      setErrors((e) => ({ ...e, resume: fileErr }));
      return;
    }
    setErrors((e) => ({ ...e, resume: undefined }));

    // A newer upload must win over a slower earlier one, and a replaced resume
    // must not leave the previous file's details behind.
    const myToken = ++uploadToken.current;
    const isStale = () => uploadToken.current !== myToken;
    set({ ...RESET_ON_NEW_RESUME });

    try {
      setAnalyzeIdx(0);
      const { path, meta } = await uploadResume(file);
      if (isStale()) return;
      set({ resume: meta, resumePath: path });
      setAnalyzeIdx(2);
      const { fields, extracted } = await parseResume(path);
      if (isStale()) return;
      setAnalyzeIdx(ANALYZE_STEPS.length);
      if (extracted?.length) {
        setForm((f) => ({ ...f, ...parsedToFormPatch(f, fields) }));
        setErrors({});
        toast.success('Resume details extracted — review each field before creating the candidate.');
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
    uploadToken.current += 1;
    setAnalyzeIdx(-1);
    set({ resume: null, resumePath: null, autofilled: [] });
  };

  const validate = () => {
    const e = validateFormFields(form);
    if (!form.resume) e.resume = "Please upload the candidate's resume (PDF, DOC or DOCX under 5 MB).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = (duplicateAction) => {
    const blocks = formToApplicationBlocks(form);
    return {
      jobId: form.jobId || undefined,
      candidateSource: form.candidateSource,
      personal: blocks.personal,
      professional: blocks.professional,
      education: blocks.education,
      additional: blocks.additional,
      resumePath: form.resumePath,
      resumeMeta: form.resume,
      duplicateAction,
    };
  };

  const submit = async (duplicateAction) => {
    if (submitting) return;
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTaCandidate(buildPayload(duplicateAction));
      if (result.duplicate) {
        setDuplicate(result);
        setSubmitting(false);
        return;
      }
      setDuplicate(null);
      toast.success(
        result.emailStatus === 'sent'
          ? `Candidate created (${result.candidateCode}). Verification link sent to ${result.candidateEmail}.`
          : `Candidate created (${result.candidateCode}), but the verification email could not be sent to ${result.candidateEmail}. Make sure your Google account is connected ("Connect Google" at the top), then use "Resend verification" on the candidate.`
      );
      navigate(`/ta/candidates/${result.applicationId}`);
    } catch (err) {
      toast.error(err.message || 'Could not create the candidate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cx-page cx-page--form">
      <button className="ta-link" onClick={() => navigate('/ta/candidates')} style={{ marginBottom: 14 }}>
        <Icon name="ArrowLeft" size={14} /> Back to candidates
      </button>

      <div className="cx-page__head">
        <h1 className="cx-page__title">Add Candidate</h1>
        <p className="cx-page__sub">
          Same form the candidate would fill on the Job Portal. Upload the resume to auto-fill it, review the details, then create the candidate — they'll get a secure link to sign in and verify everything. Fields marked * are required.
        </p>
      </div>

      {duplicate && (
        <div className="ta-note ta-note--warn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="AlertTriangle" size={15} /> <strong>An existing candidate profile already exists</strong>
          </div>
          <p className="ta-cell-sub">
            {duplicate.existingCandidate.name || duplicate.existingCandidate.email} already has {duplicate.existingApplications.length} application(s) on file with this email.
            {' '}A candidate account is tied to one email — a new application would be attached to their existing profile (no second profile or Candidate ID is created).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => navigate(`/ta/candidates/${duplicate.existingApplications[0]?.id}`)} disabled={!duplicate.existingApplications[0]}>
              Open existing candidate
            </Button>
            <Button variant="ghost" onClick={() => submit('use_existing')} disabled={submitting}>
              Create new application for this candidate
            </Button>
          </div>
        </div>
      )}

      <Card>
        <FieldGrid>
          <Field label="Candidate source" required>
            <Select value={form.candidateSource} options={SOURCES} onChange={(e) => set({ candidateSource: e.target.value })} />
          </Field>
          <Field label="Job" hint="Optional — leave blank for a general application">
            <Select
              value={form.jobId} placeholder="General application"
              options={jobs.map((j) => ({ value: j.id, label: j.title }))}
              onChange={(e) => set({ jobId: e.target.value })}
            />
          </Field>
        </FieldGrid>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Resume">
        <div className="cx-upload">
          <span className="cx-upload__icon"><Icon name="UploadCloud" size={17} /></span>
          {!form.resume ? (
            <>
              <div className="ta-cell-mute" style={{ flex: 1 }}>
                <div className="cx-upload__title">Upload the candidate's resume</div>
                <div className="cx-upload__sub">PDF, DOC or DOCX, up to 5 MB — we'll auto-fill the form from it.</div>
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
                  {form.autofilled.length > 0 ? <><Icon name="CheckCircle2" size={11} /> Details extracted · {Math.round((form.resume.size || 0) / 1024)} KB</> : <>Uploaded · {Math.round((form.resume.size || 0) / 1024)} KB</>}
                </div>
              </div>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>Replace</Button>
              <button className="ta-iconbtn" onClick={removeResume} aria-label="Remove resume"><Icon name="X" size={15} /></button>
            </>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => { handleFile(e.target.files); e.target.value = ''; }} />
        </div>
        {errors.resume && <div className="ta-field__error" style={{ marginTop: 8 }}><Icon name="AlertCircle" size={12} /> {errors.resume}</div>}
      </Card>

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
          <Field label="Note" hint="Optional">
            <Textarea rows={3} value={form.coverNote} onChange={(e) => set({ coverNote: e.target.value })} placeholder="Anything the hiring team should know about this candidate" />
          </Field>
          <FieldGrid>
            <Field label="Portfolio / LinkedIn URL" hint="Optional" error={errors.portfolio}>
              <Input
                value={form.portfolio} error={errors.portfolio} placeholder="https://"
                onChange={(e) => setAndValidate('portfolio', e.target.value)}
                onBlur={(e) => validateField('portfolio', e.target.value)}
              />
            </Field>
          </FieldGrid>
        </Card>
      </div>

      <div className="cx-formbar">
        <span className="cx-formbar__note">The candidate will review and confirm everything before it's submitted.</span>
        <Button iconRight="ArrowRight" onClick={() => submit()} disabled={submitting || parsing}>
          {submitting ? 'Creating…' : 'Create Candidate'}
        </Button>
      </div>
    </div>
  );
}
