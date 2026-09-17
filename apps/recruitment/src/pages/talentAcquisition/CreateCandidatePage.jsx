import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import { Field, FieldGrid, Input, Select } from '../../components/ta/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadResume, parseResume } from '../../api/resumes.js';
import { createTaCandidate } from '../../api/applications.js';
import { nameError, emailError, phoneError, fileUploadError } from '../../utils/validation.js';

const SOURCES = ['TA Sourced', 'Referral', 'Agency', 'Internal Referral', 'Other'];
const ANALYZE_STEPS = ['Uploading resume', 'Extracting text', 'Reading details'];

function blank() {
  return {
    candidateSource: 'TA Sourced', jobId: '',
    firstName: '', lastName: '', email: '', mobile: '', currentLocation: '',
    currentJobTitle: '', currentCompany: '', totalExperience: '', skills: [],
    resume: null, resumePath: null,
  };
}

/* TA "+ Add Candidate" flow (master prompt: senior/referred/manually-sourced
   candidates) — same resume parser as the candidate self-apply flow, and the
   created application lands in the exact same ATS pipeline once the
   candidate verifies it (see create-ta-candidate + verify-ta-candidate). */
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

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parsing = analyzeIdx > -1 && analyzeIdx < ANALYZE_STEPS.length;

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    const fileErr = fileUploadError(file, { allowedExt: ['pdf', 'doc', 'docx'], maxMB: 5 });
    if (fileErr) {
      setErrors((e) => ({ ...e, resume: fileErr }));
      return;
    }
    setErrors((e) => ({ ...e, resume: undefined }));
    try {
      setAnalyzeIdx(0);
      const { path, meta } = await uploadResume(file);
      set({ resume: meta, resumePath: path });
      setAnalyzeIdx(1);
      const { fields, extracted } = await parseResume(path);
      setAnalyzeIdx(ANALYZE_STEPS.length);
      if (extracted?.length) {
        set({
          firstName: fields.firstName || form.firstName, lastName: fields.lastName || form.lastName,
          email: fields.email || form.email, mobile: fields.mobile || form.mobile,
          currentLocation: fields.currentLocation || form.currentLocation,
          currentJobTitle: fields.currentJobTitle || form.currentJobTitle,
          currentCompany: fields.currentCompany || form.currentCompany,
          totalExperience: fields.totalExperience || form.totalExperience,
          skills: fields.skills?.length ? fields.skills : form.skills,
        });
        toast.success('Information extracted from resume — please review before creating the candidate.');
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

  const validate = () => {
    const e = {};
    const n1 = nameError(form.firstName, { required: true, label: 'first name' }); if (n1) e.firstName = n1;
    const n2 = nameError(form.lastName, { required: true, label: 'last name' }); if (n2) e.lastName = n2;
    const em = emailError(form.email, { required: true }); if (em) e.email = em;
    const ph = phoneError(form.mobile, { required: false }); if (ph) e.mobile = ph;
    if (!form.resumePath) e.resume = 'Please upload the candidate\'s resume.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = (duplicateAction) => ({
    jobId: form.jobId || undefined,
    candidateSource: form.candidateSource,
    personal: { firstName: form.firstName, lastName: form.lastName, email: form.email, mobile: form.mobile, currentLocation: form.currentLocation },
    professional: { currentJobTitle: form.currentJobTitle, currentCompany: form.currentCompany, totalExperience: form.totalExperience, skills: form.skills },
    education: [],
    resumePath: form.resumePath,
    resumeMeta: form.resume,
    duplicateAction,
  });

  const submit = async (duplicateAction) => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
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
          ? `Candidate created. Verification link sent to ${result.candidateEmail}.`
          : `Candidate created, but the verification email could not be sent to ${result.candidateEmail}.`
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
          Upload a sourced/referred candidate's resume — we'll extract their details for you to review, then send them a secure link to verify and submit.
        </p>
      </div>

      {duplicate && (
        <div className="ta-note ta-note--warn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="AlertTriangle" size={15} /> <strong>An existing candidate profile may already exist</strong>
          </div>
          <p className="ta-cell-sub">
            {duplicate.existingCandidate.name || duplicate.existingCandidate.email} already has {duplicate.existingApplications.length} application(s) on file with this email.
            {' '}A candidate account is tied to one email — this new application will be attached to their existing profile either way.
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
                <div className="cx-upload__sub">PDF, DOC or DOCX, up to 5 MB.</div>
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
                  <Icon name="CheckCircle2" size={11} /> Details extracted
                </div>
              </div>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>Replace</Button>
            </>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => handleFile(e.target.files)} />
        </div>
        {errors.resume && <div className="ta-field__error" style={{ marginTop: 8 }}><Icon name="AlertCircle" size={12} /> {errors.resume}</div>}
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Candidate information">
        <p className="ta-cell-sub" style={{ marginBottom: 12 }}>
          Only name, email and resume are required — everything else can be left for the candidate to confirm.
        </p>
        <FieldGrid>
          <Field label="First name" required error={errors.firstName}>
            <Input value={form.firstName} error={errors.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <Input value={form.lastName} error={errors.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input type="email" value={form.email} error={errors.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Phone" hint="Optional" error={errors.mobile}>
            <Input value={form.mobile} error={errors.mobile} onChange={(e) => set({ mobile: e.target.value })} />
          </Field>
          <Field label="Current location" hint="Optional">
            <Input value={form.currentLocation} onChange={(e) => set({ currentLocation: e.target.value })} />
          </Field>
          <Field label="Total experience" hint="Optional, years">
            <Input value={form.totalExperience} onChange={(e) => set({ totalExperience: e.target.value })} />
          </Field>
          <Field label="Current company" hint="Optional">
            <Input value={form.currentCompany} onChange={(e) => set({ currentCompany: e.target.value })} />
          </Field>
          <Field label="Current job title" hint="Optional">
            <Input value={form.currentJobTitle} onChange={(e) => set({ currentJobTitle: e.target.value })} />
          </Field>
        </FieldGrid>
      </Card>

      <div className="cx-formbar">
        <span className="cx-formbar__note">The candidate will review and confirm everything before it's submitted.</span>
        <Button iconRight="ArrowRight" onClick={() => submit()} disabled={submitting || parsing}>
          {submitting ? 'Creating…' : 'Create Candidate'}
        </Button>
      </div>
    </div>
  );
}
