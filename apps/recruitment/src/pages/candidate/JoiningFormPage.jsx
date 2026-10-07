import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import Tag from '../../components/ta/Tag.jsx';
import { Field, Input } from '../../components/ta/Field.jsx';
import SectionForm from '../../components/candidate/joining/SectionForm.jsx';
import JoiningDocumentsStep from '../../components/candidate/joining/JoiningDocumentsStep.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getJoiningProfile, saveJoiningSection, submitJoining } from '../../api/joining.js';
import { SECTIONS, STATUS_LABEL, normalizeData, sectionProgress, validateAll } from '../../utils/joiningSchema.ts';
import { contextItems, fullNameOf, summarizeSections } from '../../utils/joiningView.js';
import { formatDate } from '../../utils/format.js';

// Documents sit just before the final declaration; Review & submit is last.
const STEPS = [
  ...SECTIONS.filter((s) => s.id !== 'declaration'),
  { id: 'documents', title: 'Documents', icon: 'Files', blurb: 'What to upload, worked out from your answers.' },
  SECTIONS.find((s) => s.id === 'declaration'),
  { id: 'review', title: 'Review & submit', icon: 'ClipboardCheck', blurb: 'Check everything, then sign and submit once.' },
];
const STATUS_TONE = { approved_with_remarks: 'amber', rejected: 'red', not_started: 'grey', in_progress: 'blue', submitted: 'amber', under_review: 'amber', correction_required: 'red', resubmitted: 'amber', verified: 'green', completed: 'green' };
const SAVE_DELAY = 1200;

export default function JoiningFormPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { configured, loading: authLoading } = useCandidateAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [data, setData] = useState({});
  const [stepId, setStepId] = useState('personal');
  const [touched, setTouched] = useState({});
  const [showAll, setShowAll] = useState({});
  const [saveState, setSaveState] = useState('idle');
  const [signName, setSignName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const dataRef = useRef({});
  const versions = useRef({});
  const dirty = useRef(new Set());
  const edited = useRef(new Set());
  const timer = useRef(null);
  const saving = useRef(Promise.resolve());

  useEffect(() => {
    if (!configured || authLoading) return;
    getJoiningProfile()
      .then((p) => {
        setProfile(p);
        dataRef.current = p.data;
        setData(p.data);
      })
      .catch((e) => setError(e.message || 'Could not open your joining form.'));
  }, [configured, authLoading]);

  const editableSections = profile?.editable?.sections ?? [];
  const canEdit = (id) => editableSections.includes(id);

  const saveSection = (id) => {
    const version = versions.current[id];
    setSaveState('saving');
    saving.current = saving.current
      .then(() => saveJoiningSection(id, dataRef.current[id] ?? {}))
      .then((res) => {
        if (versions.current[id] === version) dirty.current.delete(id);
        setProfile((p) => ({ ...p, ...res, data: undefined, applicationId: p.applicationId }));
        setSaveState(dirty.current.size ? 'saving' : 'saved');
      })
      .catch((e) => {
        setSaveState('error');
        toast.error(e.message || 'Could not save your changes.');
      });
    return saving.current;
  };
  const flush = () => {
    clearTimeout(timer.current);
    return Promise.all([...dirty.current].map(saveSection));
  };

  const change = (sectionId, next) => {
    const merged = normalizeData({ ...dataRef.current, [sectionId]: next });
    dataRef.current = merged;
    setData(merged);
    versions.current[sectionId] = (versions.current[sectionId] || 0) + 1;
    dirty.current.add(sectionId);
    setSaveState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };
  const touch = (sectionId) => (path) => {
    edited.current.add(path);
    setTouched((t) => ({ ...t, [path]: true }));
  };

  // Save whatever is pending when leaving the page or hiding the tab.
  useEffect(() => {
    const onHide = () => { if (dirty.current.size) flush(); };
    const onUnload = (e) => { if (dirty.current.size) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      if (dirty.current.size) flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = useMemo(() => validateAll(data), [data]);
  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  const goTo = async (id) => {
    await flush();
    setStepId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = async () => {
    setShowAll((s) => ({ ...s, [stepId]: true }));
    await goTo(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id);
  };

  const submit = async () => {
    setSubmitErr('');
    setSubmitting(true);
    try {
      await flush();
      const res = await submitJoining(signName);
      setProfile((p) => ({ ...p, ...res, data: undefined, applicationId: p.applicationId }));
      toast.success('Joining form submitted. HR will review it.');
    } catch (e) {
      setSubmitErr(e.message || 'Could not submit.');
      if (e.fields?.signatureName) setSubmitErr(e.fields.signatureName);
    } finally {
      setSubmitting(false);
    }
  };

  if (!configured) return <div className="cx-page"><div className="wsauth__alert" role="alert"><Icon name="AlertCircle" size={15} /> Backend not configured yet.</div></div>;
  if (error) {
    return (
      <div className="cx-page cx-page--narrow">
        <Card title="Joining form"><p className="ta-cell-sub" style={{ marginBottom: 14 }}>{error}</p>
          <Button variant="ghost" icon="ArrowLeft" onClick={() => navigate('/candidate/application')}>Back to my application</Button></Card>
      </div>
    );
  }
  if (!profile) return <div className="cx-page"><div className="cx-loading">Opening your joining form…</div></div>;

  const status = profile.status;
  const step = STEPS[stepIndex];
  const section = SECTIONS.find((s) => s.id === step.id);
  const corrections = profile.corrections ?? [];
  const locked = !canEdit(step.id);
  const hr = profile.hrFields ?? {};
  const ctx = section ? contextItems(section.id, data, hr, profile.caseInfo) : [];
  const stepPercent = (s) => (SECTIONS.some((x) => x.id === s.id) ? sectionProgress(SECTIONS.find((x) => x.id === s.id), data).percent : null);
  const readyToSubmit = overall.complete && ['not_started', 'in_progress', 'correction_required'].includes(status);
  const expectedName = fullNameOf(data);

  const banner = {
    submitted: ['ok', `Submitted on ${formatDate(profile.submittedAt)}. HR is reviewing your form — you can still read everything here.`],
    resubmitted: ['ok', 'Resubmitted. HR will review your corrections.'],
    under_review: ['ok', 'HR is reviewing your form.'],
    verified: ['ok', 'HR has verified your joining form.'],
    completed: ['ok', 'Your joining formalities are complete.'],
    correction_required: ['warn', 'HR asked for corrections. Only the steps marked below can be edited — everything else stays as you submitted it.'],
  }[status];

  return (
    <div className="cx-page" style={{ maxWidth: 1180 }}>
      <button className="ta-link" onClick={() => navigate('/candidate/application')} style={{ marginBottom: 12 }}>
        <Icon name="ArrowLeft" size={14} /> Back to my application
      </button>
      <div className="cx-page__head" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="cx-page__title" style={{ margin: 0 }}>Employee Joining Form</h1>
          <Tag tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Tag>
        </div>
        <p className="cx-page__sub">Enter each detail once — PF, nominations, gratuity, background check and consents all use it. Your progress saves automatically.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
            <div className="cx-jobinfo__progress-top"><span>Joining completion</span><span>{overall.percent}%</span></div>
            <div className="cx-progress"><div style={{ width: `${overall.percent}%` }} /></div>
          </div>
          <span className="ta-cell-sub" aria-live="polite">
            {saveState === 'saving' || saveState === 'pending' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Could not save — will retry' : ''}
          </span>
        </div>
      </div>

      {banner && <div className={`ta-note ta-note--${banner[0]}`} style={{ marginBottom: 20 }}><Icon name={banner[0] === 'ok' ? 'CheckCircle2' : 'AlertTriangle'} size={15} /> <span>{banner[1]}</span></div>}

      <div className="jf-layout">
        <nav className="jf-steps" aria-label="Joining form steps">
          {STEPS.map((s, i) => {
            const pct = stepPercent(s);
            const flagged = corrections.some((c) => c.section === s.id);
            return (
              <button key={s.id} type="button" className={`jf-step${s.id === stepId ? ' is-active' : ''}`} onClick={() => goTo(s.id)}>
                <span className={`jf-step__num${pct === 100 ? ' is-done' : ''}${flagged ? ' is-flag' : ''}`}>
                  {flagged ? '!' : pct === 100 ? <Icon name="Check" size={12} /> : i + 1}
                </span>
                <span className="jf-step__label">{s.title}</span>
                {pct !== null && pct < 100 && <span className="jf-step__pct">{pct}%</span>}
              </button>
            );
          })}
        </nav>

        <div>
          <Card title={step.title}>
            {step.blurb && <p className="ta-cell-sub" style={{ marginBottom: 18 }}>{step.blurb}</p>}

            {corrections.filter((c) => c.section === step.id).map((c) => (
              <div key={c.id} className="ta-note ta-note--warn" style={{ marginBottom: 16 }}>
                <Icon name="AlertTriangle" size={14} /> <span><strong>HR asks:</strong> {c.remark}</span>
              </div>
            ))}
            {locked && section && status !== 'correction_required' && ['submitted', 'resubmitted', 'under_review', 'verified', 'completed'].includes(status) && (
              <p className="ta-cell-sub" style={{ marginBottom: 14 }}>This step is locked while HR reviews it.</p>
            )}
            {locked && section && status === 'correction_required' && !corrections.some((c) => c.section === step.id) && (
              <p className="ta-cell-sub" style={{ marginBottom: 14 }}>No correction was requested here, so this step is locked.</p>
            )}

            {ctx.length > 0 && (
              <div style={{ background: 'var(--ta-blue-wash, #f3f6ff)', borderRadius: 12, padding: 18, marginBottom: 26 }}>
                <div className="ta-cell-strong" style={{ marginBottom: 10 }}>Already on your profile — nothing to type again</div>
                <div className="ta-info" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '10px 20px' }}>
                  {ctx.map((c) => (
                    <div className="ta-info__item" key={c.label}><span className="ta-info__label">{c.label}</span><span className="ta-info__value">{c.value}</span></div>
                  ))}
                </div>
              </div>
            )}

            {section && step.id !== 'review' && (
              <SectionForm
                section={section} data={data} disabled={locked}
                onChange={(nextSeg) => change(section.id, nextSeg)}
                sources={profile.fieldSources ?? {}} edited={edited.current}
                touched={touched} onTouch={touch(section.id)} showAll={!!showAll[section.id]}
                corrections={corrections.filter((c) => c.section === section.id)}
              />
            )}

            {step.id === 'documents' && profile.documents && (
              <JoiningDocumentsStep
                documents={profile.documents} applicationId={profile.applicationId} disabled={false}
                onUpdated={(res) => setProfile((p) => ({ ...p, ...res, data: undefined, applicationId: p.applicationId }))}
              />
            )}

            {step.id === 'review' && (
              <ReviewStep
                data={data} overall={overall} hr={hr} caseInfo={profile.caseInfo} status={status} onEdit={goTo}
                signName={signName} setSignName={setSignName} expectedName={expectedName}
                readyToSubmit={readyToSubmit} submitting={submitting} submitErr={submitErr} onSubmit={submit}
                signature={profile.signature}
              />
            )}

            {step.id !== 'review' && (
              <div className="jf-actions">
                <Button variant="ghost" icon="ArrowLeft" onClick={() => goTo(STEPS[Math.max(0, stepIndex - 1)].id)} disabled={stepIndex === 0}>Back</Button>
                <Button iconRight="ArrowRight" onClick={next}>Save & continue</Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ data, overall, hr, caseInfo, status, onEdit, signName, setSignName, expectedName, readyToSubmit, submitting, submitErr, onSubmit, signature }) {
  const sections = summarizeSections(data);
  const HRL = [['Employee code', hr.employeeCode], ['Date of joining', hr.dateOfJoining], ['Designation', hr.designation || caseInfo?.designation], ['Grade', hr.grade], ['Department', hr.department], ['Branch', hr.branchName]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h4 className="ta-card__title" style={{ margin: '0 0 10px' }}>Completion tracker — {overall.percent}%</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
          {SECTIONS.map((s) => {
            const p = overall.sections[s.id];
            return (
              <button key={s.id} type="button" className="ta-link" onClick={() => onEdit(s.id)} style={{ justifyContent: 'flex-start', gap: 6 }}>
                <span style={{ color: p.percent === 100 ? 'var(--tag-green-fg, #15803d)' : 'var(--tag-red-fg, #b91c1c)' }}>{p.percent === 100 ? '✓' : '✗'}</span>
                {s.title}{p.percent < 100 ? ` — ${p.percent}%` : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ta-note ta-note--info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <strong>Set by HR (you can't change these)</strong>
        <span className="ta-cell-sub">{HRL.map(([l, v]) => `${l}: ${v || 'pending'}`).join(' · ')}</span>
      </div>

      {sections.map((s) => (
        <details key={s.id} open={false} style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 12, padding: '14px 18px' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>{s.title}</span>
            <button type="button" className="ta-link" onClick={(e) => { e.preventDefault(); onEdit(s.id); }}>Edit</button>
          </summary>
          <div style={{ marginTop: 14 }}>
            {s.groups.map((g) => (
              <div key={g.id} style={{ marginBottom: 14 }}>
                {g.title && <div className="ta-cell-strong">{g.title}</div>}
                {g.rows && <Rows rows={g.rows} />}
                {g.items?.map((it) => <div key={it.title} style={{ marginTop: 10 }}><div className="ta-cell-sub">{it.title}</div><Rows rows={it.rows} /></div>)}
                {g.items && g.items.length === 0 && <div className="ta-cell-sub">None added.</div>}
              </div>
            ))}
          </div>
        </details>
      ))}

      {['not_started', 'in_progress', 'correction_required'].includes(status) ? (
        <div style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 12, padding: 22 }}>
          <h4 className="ta-card__title" style={{ margin: '0 0 12px' }}>Sign and submit</h4>
          {!overall.complete && <p className="ta-cell-sub" style={{ marginBottom: 12 }}>Finish every required step (marked ✗ above) to submit. Nominee shares must total 100%.</p>}
          <Field label="Type your full name to sign" hint={expectedName ? `Must match: ${expectedName}` : undefined} error={submitErr || undefined}>
            <Input value={signName} onChange={(e) => setSignName(e.target.value)} disabled={!overall.complete} />
          </Field>
          <div style={{ marginTop: 14 }}>
            <Button onClick={onSubmit} disabled={!readyToSubmit || submitting || !signName.trim()}>{submitting ? 'Submitting…' : status === 'correction_required' ? 'Resubmit' : 'Submit joining form'}</Button>
          </div>
        </div>
      ) : (
        signature && <div className="ta-note ta-note--ok"><Icon name="CheckCircle2" size={14} /> <span>Signed by {signature.name} on {formatDate(signature.at)}.</span></div>
      )}
    </div>
  );
}

function Rows({ rows }) {
  return (
    <div className="ta-info" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '8px 20px' }}>
      {rows.map((r) => <div className="ta-info__item" key={r.label}><span className="ta-info__label">{r.label}</span><span className="ta-info__value">{r.value}</span></div>)}
    </div>
  );
}
