import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Button from '../../components/kit/Button.jsx';
import Tag from '../../components/kit/Tag.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import StepTitle from '../../components/kit/StepTitle.jsx';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getOnboardingCase, createEmployee, activityForCase } from '../../api/onboarding.js';
import {
  listOnboardingDocuments, requestOnboardingDocuments, verifyOnboardingDocument, getOnboardingDocumentUrl,
} from '../../api/onboardingDocuments.js';
import { statusMeta } from '../../constants/statuses.js';
import { formatDate, formatDateTime } from '../../utils/format.js';

const DOC_STATUS_META = {
  requested: { label: 'Pending upload', tone: 'grey' },
  uploaded: { label: 'Awaiting review', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  revision_required: { label: 'Correction requested', tone: 'amber' },
};
const STEP_LABELS = ['Documents', 'Joining', 'Employee'];

function Info({ label, value }) {
  return (
    <div className="hr-info__item">
      <span className="hr-info__label">{label}</span>
      <span className="hr-info__value">{value || '—'}</span>
    </div>
  );
}

/* Inline reason box for Reject / Request re-upload — both require remarks. */
function ReasonBox({ label, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div className="cx-docreason">
      <textarea className="cx-docreason__input" rows={2} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="cx-docreason__btns">
        <button className="hr-btn hr-btn--sm" onClick={() => onSubmit(text.trim())} disabled={!text.trim()}>Submit</button>
        <button className="hr-btn hr-btn--ghost hr-btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function rankOfStatus(status) {
  if (['employee_created', 'completed'].includes(status)) return 3;
  if (['ready_for_joining', 'joining_confirmed'].includes(status)) return 2;
  return 1;
}

export default function HRCandidateDetailPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState(null);
  const [requestingDocs, setRequestingDocs] = useState(false);
  const [reasonFor, setReasonFor] = useState(null); // { docId, action }
  const [docBusy, setDocBusy] = useState(null);
  const [activities, setActivities] = useState([]);
  const [showAllAct, setShowAllAct] = useState(false);
  const [step, setStep] = useState(null);
  const [preview, setPreview] = useState(null); // { url, fileName, title } for DocumentPreviewModal

  const load = () => {
    getOnboardingCase(candidateId)
      .then(setItem)
      .catch((e) => setError(e.message || 'Could not load this candidate.'));
  };
  useEffect(load, [candidateId]);

  const loadDocs = () => {
    listOnboardingDocuments(candidateId).then(setDocs).catch(() => setDocs([]));
  };
  useEffect(loadDocs, [candidateId]);

  useEffect(() => {
    if (!docs) return;
    activityForCase(candidateId, docs.map((d) => d.id)).then(setActivities).catch(() => setActivities([]));
  }, [candidateId, docs]);

  if (error) {
    return (
      <EmptyState icon="UserX" title="Candidate not found" message={error}
        action={<Button variant="ghost" onClick={() => navigate('/hr/candidates')}>Back to candidates</Button>} />
    );
  }
  if (!item) return <div className="hr-loading">Loading…</div>;

  const meta = statusMeta(item.status);
  const rank = rankOfStatus(item.status);
  const s1 = rank > 1 ? 'done' : 'current';
  const s2 = rank > 2 ? 'done' : rank === 2 ? 'current' : 'upcoming';
  const s3 = rank === 3 ? 'done' : 'upcoming';
  const stepStates = [s1, s2, s3];
  const maxStep = stepStates.reduce((acc, s, i) => (s === 'upcoming' ? acc : i + 1), 1);
  const liveStep = (() => {
    const i = stepStates.indexOf('current');
    return i >= 0 ? i + 1 : maxStep;
  })();
  const activeStep = Math.min(step ?? liveStep, maxStep);
  const goStep = (n) => setStep(Math.min(maxStep, Math.max(1, n)));

  const doRequestDocs = async () => {
    setRequestingDocs(true);
    try {
      await requestOnboardingDocuments(candidateId);
      toast.success('Onboarding documents requested — the candidate has been notified.');
      loadDocs();
      load();
    } catch (e) {
      toast.error(e.message || 'Could not request the documents.');
    } finally {
      setRequestingDocs(false);
    }
  };

  const actOnDoc = async (doc, action, remarks) => {
    setDocBusy(doc.id);
    setReasonFor(null);
    try {
      await verifyOnboardingDocument(doc.id, action, remarks);
      toast.success(action === 'approve' ? `${doc.requirement?.name} verified.` : `${doc.requirement?.name} sent back to the candidate.`);
      loadDocs();
      load();
    } catch (e) {
      toast.error(e.message || 'Could not save that decision.');
    } finally {
      setDocBusy(null);
    }
  };

  const viewDoc = async (doc) => {
    setPreview({ url: null, fileName: null, title: doc.requirement?.name });
    try {
      const { url, fileName } = await getOnboardingDocumentUrl(doc.id);
      setPreview({ url, fileName, title: doc.requirement?.name });
    } catch (e) {
      setPreview(null);
      toast.error(e.message || 'Could not open this document.');
    }
  };

  const confirmJoining = async () => {
    setBusy(true);
    try {
      // create-employee (edge function) re-checks document verification
      // itself and already sets the case to 'employee_created' on success —
      // don't also set 'joining_confirmed' after, that would just overwrite
      // the correct terminal status back to a non-terminal one.
      const employee = await createEmployee(item);
      toast.success(`Joining confirmed — employee record created (${employee.employee_code}).`);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not complete joining.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HRHeader
        title={item.candidate_name || 'Candidate'}
        subtitle={`${item.job_title || ''}${item.department ? ` · ${item.department}` : ''}`}
        backTo="/hr/candidates"
        backLabel="Candidates"
      />

      <div className="hr-progress-row">
        <div className="hr-progress"><div className="hr-progress__bar" style={{ width: `${Math.round((rank / 3) * 100)}%` }} /></div>
        <span className="hr-cell-sub"><Tag tone={meta.tone}>{meta.label}</Tag></span>
      </div>

      <div className="hr-detail-grid">
        <div className="hr-stack">
          <Card title="Candidate & offer details">
            <div className="hr-info">
              <Info label="Candidate email" value={item.candidate_email} />
              <Info label="Candidate phone" value={item.candidate_phone} />
              <Info label="Position" value={item.job_title} />
              <Info label="Department" value={item.department} />
              <Info label="Designation" value={item.designation} />
              <Info label="Location" value={item.location} />
              <Info label="Employment type" value={item.employment_type} />
              <Info label="Offer date" value={formatDate(item.offer_date)} />
              <Info label="Joining date" value={formatDate(item.joining_date)} />
            </div>
          </Card>

          <Card title="Onboarding workflow" action={<span className="hr-cell-sub">Step {activeStep} of {maxStep}</span>}>
            <div className="hr-wizard__tabs">
              {STEP_LABELS.slice(0, maxStep).map((label, i) => {
                const n = i + 1;
                const st = stepStates[i];
                return (
                  <button key={n} type="button" className={`hr-wizard__tab${n === activeStep ? ' is-active' : ''}`} onClick={() => goStep(n)}>
                    <span className={`hr-step__num hr-step__num--${n === activeStep ? 'current' : st}`}>
                      {st === 'done' && n !== activeStep ? <Icon name="Check" size={13} strokeWidth={3} /> : n}
                    </span>
                    <span className="hr-wizard__tablabel">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="hr-wizard__panel">
              <div className="hr-wizard__panelhead">
                <StepTitle n={activeStep} label={STEP_LABELS[activeStep - 1]} state={stepStates[activeStep - 1]} />
              </div>

              {activeStep === 1 && (
                docs === null ? (
                  <p className="hr-cell-sub">Loading…</p>
                ) : docs.length === 0 ? (
                  <>
                    <p className="hr-cell-sub" style={{ marginBottom: 12 }}>
                      Nothing requested yet. This sends the active onboarding checklist to the candidate through the
                      recruitment app, where they'll upload each item.
                    </p>
                    <Button icon="FileText" disabled={requestingDocs} onClick={doRequestDocs}>
                      {requestingDocs ? 'Requesting…' : 'Request onboarding documents'}
                    </Button>
                  </>
                ) : (
                  <div className="hr-stack">
                    <div style={{ marginBottom: 4 }}>
                      <Tag tone={docs.every((d) => d.status === 'verified') ? 'green' : 'amber'}>
                        {docs.filter((d) => d.status === 'verified').length}/{docs.length} verified
                      </Tag>
                    </div>
                    {docs.map((doc) => {
                      const dm = DOC_STATUS_META[doc.status] || DOC_STATUS_META.requested;
                      const canAct = doc.status === 'uploaded';
                      const canView = doc.status !== 'requested';
                      return (
                        <div className="hr-docrow" key={doc.id}>
                          <div className="hr-docrow__head">
                            <span className="hr-docrow__icon"><Icon name="FileText" size={16} /></span>
                            <div className="grow">
                              <div className="hr-cell-strong">
                                {doc.requirement?.name}{doc.requirement?.required && <span className="cx-req" title="Required"> *</span>}
                              </div>
                            </div>
                            <Tag tone={dm.tone}>{dm.label}</Tag>
                            {reasonFor?.docId !== doc.id && (
                              <span className="hr-rowactions" style={{ opacity: 1, display: 'flex', gap: 6 }}>
                                {canView && <Button variant="ghost" icon="Eye" disabled={docBusy === doc.id} onClick={() => viewDoc(doc)}>View</Button>}
                                {canAct && (
                                  <>
                                    <Button variant="ghost" icon="Check" disabled={docBusy === doc.id} onClick={() => actOnDoc(doc, 'approve')}>Approve</Button>
                                    <Button variant="ghost" icon="RotateCcw" disabled={docBusy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reupload_required' })}>
                                      Request re-upload
                                    </Button>
                                    <Button variant="danger" icon="X" disabled={docBusy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reject' })}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          {doc.hr_remarks && doc.status !== 'verified' && (
                            <div className="hr-docrow__body hr-cell-sub" style={{ color: 'var(--tag-amber-fg)' }}>Your note: {doc.hr_remarks}</div>
                          )}
                          {doc.form_data && Array.isArray(doc.requirement?.field_schema) && (
                            <div className="hr-docrow__body hr-info">
                              {doc.requirement.field_schema
                                .filter((f) => f.type !== 'file')
                                .map((f) => <Info key={f.key} label={f.label} value={doc.form_data[f.key]} />)}
                            </div>
                          )}
                          {reasonFor?.docId === doc.id && (
                            <div className="hr-docrow__body">
                              <ReasonBox
                                label={reasonFor.action === 'reject' ? 'Why is this document rejected?' : 'What needs to be corrected?'}
                                onSubmit={(text) => actOnDoc(doc, reasonFor.action, text)}
                                onCancel={() => setReasonFor(null)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {activeStep === 2 && (
                s2 === 'upcoming' ? (
                  <p className="hr-cell-mute">Opens once all onboarding documents are verified.</p>
                ) : item.status === 'ready_for_joining' ? (
                  <>
                    <p className="hr-cell-sub" style={{ marginBottom: 12 }}>All required documents are verified. Confirm joining to create the employee record.</p>
                    <Button icon="UserRoundCheck" disabled={busy} onClick={confirmJoining}>
                      {busy ? 'Confirming…' : 'Confirm joining & create employee record'}
                    </Button>
                  </>
                ) : (
                  <p className="hr-cell-sub">Joining confirmed — employee record created.</p>
                )
              )}

              {activeStep === 3 && (
                s3 !== 'done' ? (
                  <p className="hr-cell-mute">Available after joining is confirmed.</p>
                ) : (
                  <div className="hr-info">
                    <Info label="Position" value={item.job_title} />
                    <Info label="Department" value={item.department} />
                    <Info label="Designation" value={item.designation} />
                    <Info label="Joining date" value={formatDate(item.joining_date)} />
                  </div>
                )
              )}
            </div>

            <div className="hr-wizard__nav">
              <Button variant="ghost" icon="ChevronLeft" disabled={activeStep === 1} onClick={() => goStep(activeStep - 1)}>Back</Button>
              <Button variant="ghost" iconRight="ChevronRight" disabled={activeStep >= maxStep} onClick={() => goStep(activeStep + 1)}>Next</Button>
            </div>
          </Card>
        </div>

        <div className="hr-stack hr-actside">
          <Card title="Activity">
            {activities.length === 0 ? (
              <p className="hr-cell-mute">No recorded activity yet.</p>
            ) : (
              <>
                <ol className="hr-timeline hr-timeline--scroll">
                  {(showAllAct ? activities : activities.slice(0, 8)).map((a) => (
                    <li key={a.id}>
                      <span className="hr-timeline__dot" />
                      <div>
                        <div className="hr-cell-strong">{a.action}</div>
                        {a.remarks && <div className="hr-cell-sub">{a.remarks}</div>}
                        <div className="hr-cell-sub">{formatDateTime(a.created_at)} · {a.actor_label || 'System'}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                {activities.length > 8 && (
                  <button type="button" className={`hr-actmore${showAllAct ? ' is-open' : ''}`} onClick={() => setShowAllAct((v) => !v)}>
                    {showAllAct ? 'Show less' : `Show all ${activities.length}`}
                    <Icon name="ChevronDown" size={14} />
                  </button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
      <DocumentPreviewModal
        open={!!preview} onClose={() => setPreview(null)}
        url={preview?.url} fileName={preview?.fileName} title={preview?.title}
      />
    </>
  );
}
