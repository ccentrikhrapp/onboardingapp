import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import DangerButton from '../../components/common/Button.jsx';
import ReasonModal from '../../components/workflow/ReasonModal.jsx';
import ScheduleInterviewModal from '../../components/workflow/ScheduleInterviewModal.jsx';
import InterviewFeedbackModal from '../../components/workflow/InterviewFeedbackModal.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal.jsx';
import { Field, Input } from '../../components/ta/Field.jsx';
import { getApplication, getApplicationEvents, decideApplication, startReview as startReviewApi, resendTaCandidateVerification, assignApplications, deleteApplication } from '../../api/applications.js';
import { listInterviewRounds, scheduleInterview, recordInterviewFeedback, resendInterviewInvitation } from '../../api/interviews.js';
import { getOfferStatus, getOffer, sendOffer, acceptOffer } from '../../api/offers.js';
import { listApplicationDocuments, documentFileUrl } from '../../api/documents.js';
import { summarizeDocuments } from '../../utils/documentRules.js';
import TADocumentReview from '../../components/ta/TADocumentReview.jsx';
import { applicationFromDb } from '../../api/mappers.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { listTAs } from '../../api/staff.js';
import {
  APP_STATUS,
  PIPELINE_STAGES,
  stageIndexForStatus,
  stageBadgeForStatus,
} from '../../constants/statuses.js';
import { formatDate, formatCurrencyINR } from '../../utils/format.js';

const IN_INTERVIEW = [
  APP_STATUS.INTERVIEW_PLANNING, APP_STATUS.INTERVIEW_IN_PROGRESS,
  APP_STATUS.INTERVIEW_PASSED, APP_STATUS.INTERVIEW_FAILED,
];
const CAN_OFFER_STAGE = [APP_STATUS.DOC_VERIFICATION, APP_STATUS.DOCS_VERIFIED];
const OFFER_SENT_STAGE = [APP_STATUS.OFFER_ISSUED, APP_STATUS.OFFER_ACCEPTED, APP_STATUS.OFFER_DECLINED];
const OFFER_STATUS_LABEL = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
const OFFER_STATUS_TONE = { draft: 'grey', sent: 'blue', viewed: 'blue', accepted: 'green', declined: 'red', expired: 'grey' };
const ROUND_DECISION_LABEL = { advance: 'Advance', further_review: 'Further Review', not_progressing: 'Not Moving Forward' };
const ROUND_DECISION_TONE = { advance: 'green', further_review: 'amber', not_progressing: 'red' };
// The candidate's one-time answer to the interview email (interview_rounds.candidate_response).
const CANDIDATE_RESPONSE = {
  accepted: { label: 'Candidate: Accepted', tone: 'green' },
  declined: { label: 'Candidate: Declined', tone: 'red' },
};
const ATS_RECOMMENDATION_TONE = { 'Strong Match': 'green', 'Good Match': 'blue', 'Partial Match': 'amber', 'Low Match': 'red' };
const PLATFORM_LABEL = { teams: 'Microsoft Teams', google_meet: 'Google Meet' };
/* Server-computed match between this application and its job (see
   supabase/functions/_shared/ats.ts) — informational for TA, never gates
   the review actions below it. */
function AtsCard({ ats }) {
  const [expanded, setExpanded] = useState(false);
  if (!ats) return null;
  const metrics = [
    ['Skills', ats.skillsMatch],
    ['Experience', ats.experienceMatch],
    ['JD Keywords', ats.jdKeywordMatch],
    ['Education', ats.educationMatch],
  ];
  return (
    <div style={{ width: 'fit-content', marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
          background: 'var(--ta-surface)', border: '1px solid var(--ta-line)',
          borderRadius: expanded ? '16px 16px 0 0' : 999, boxShadow: 'var(--ta-shadow)', padding: '7px 14px',
          font: 'inherit', width: '100%',
        }}
      >
        <Icon name="Target" size={14} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>ATS match</span>
        <span className="ta-cell-strong" style={{ fontSize: 14 }}>{ats.overall}%</span>
        <Tag tone={ATS_RECOMMENDATION_TONE[ats.recommendation] || 'grey'}>{ats.recommendation}</Tag>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
      </button>

      {expanded && (
        <div
          style={{
            width: 320, background: 'var(--ta-surface)', border: '1px solid var(--ta-line)',
            borderTop: 'none', borderRadius: '0 0 var(--ta-radius) var(--ta-radius)',
            boxShadow: 'var(--ta-shadow)', padding: 16,
          }}
        >
          <div className="ta-info" style={{ marginBottom: 16 }}>
            {metrics.map(([label, value]) => (
              <div key={label} className="ta-info__item">
                <span className="ta-info__label">{label} match</span>
                <span className="ta-info__value">{value}%</span>
              </div>
            ))}
          </div>
          {ats.matchedSkills?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span className="ta-info__label">Matched skills</span>
              <div className="ta-skills" style={{ marginTop: 6 }}>
                {ats.matchedSkills.map((s) => <span key={s} className="ta-skill">✓ {s}</span>)}
              </div>
            </div>
          )}
          {ats.missingSkills?.length > 0 && (
            <div>
              <span className="ta-info__label">Missing / lower match</span>
              <div className="ta-skills" style={{ marginTop: 6 }}>
                {ats.missingSkills.map((s) => <span key={s} className="ta-skill">{s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="ta-info__item">
      <span className="ta-info__label">{label}</span>
      <span className="ta-info__value">{value || '—'}</span>
    </div>
  );
}

const IN_REVIEW = [APP_STATUS.SUBMITTED, APP_STATUS.TA_REVIEW];

/* Which numbered pipeline page a status belongs to — Application Review (1)
   -> Interview (2) -> Documents (3) -> Offer (4). Monotonic: a candidate's
   page only ever moves forward as their status advances, never back. */
function pipelineStepForStatus(status) {
  if (IN_INTERVIEW.includes(status)) return 2;
  if (status === APP_STATUS.DOC_VERIFICATION) return 3;
  // DOCS_VERIFIED means every pre-offer document has cleared — the Offer
  // step needs to be reachable right away here, not just once an offer has
  // already been sent (OFFER_SENT_STAGE), otherwise there's no way to ever
  // click through to send the first offer.
  if (status === APP_STATUS.DOCS_VERIFIED || OFFER_SENT_STAGE.includes(status)) return 4;
  return 1;
}

/* Database application + timeline -> the shape this page renders. */
function adaptRemote(a, events) {
  if (!a) return null;
  return {
    id: a.id,
    candidateId: a.code, // misnamed historically — this is actually the Application code (APP-...); see candidateCode below for the real Candidate ID
    candidateCode: a.candidateCode,
    status: a.status,
    jobId: a.jobId,
    jobTitle: a.jobTitle,
    interviewPlan: a.interviewPlan,
    isGeneral: !a.jobId,
    source: a.source === 'ta_link' ? 'TA link' : a.source === 'ta_sourced' ? 'TA Sourced' : 'Careers',
    rawSource: a.source,
    candidateEmail: a.candidateEmail,
    submittedAt: a.submittedAt,
    assignedTaId: a.assignedTo,
    assignedTo: a.assignedToName || (a.assignedTo ? 'Assigned' : null),
    returnReason: a.returnReason,
    rejectReason: a.rejectReason,
    personal: a.personal || {},
    professional: a.professional || {},
    education: a.education || [],
    additional: a.additional || {},
    atsScore: a.atsScore || null,
    events: (events || []).map((e) => ({
      id: e.id, title: e.title, description: e.description, at: e.created_at, actor: e.actor_label || 'System',
    })),
  };
}

export default function TACandidateDetailPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { role } = useApp();
  const isAdminTier = role === 'admin' || role === 'admin_ta';

  const [tas, setTas] = useState([]);
  useEffect(() => {
    if (isAdminTier) listTAs().then(setTas).catch(() => setTas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminTier]);
  const [assignTo, setAssignTo] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [remote, setRemote] = useState({ loading: true, app: null });
  const reloadRemote = () => {
    Promise.all([getApplication(candidateId), getApplicationEvents(candidateId)])
      .then(([a, ev]) => setRemote({ loading: false, app: adaptRemote(applicationFromDb(a), ev) }))
      .catch(() => setRemote({ loading: false, app: null }));
  };
  useEffect(() => {
    reloadRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const app = remote.app;

  // Pipeline is shown one page at a time (Step 1/2/3), not stacked. Opening
  // the candidate lands on whichever page they're currently at; completing
  // a step's action (advance, request documents, send offer...) moves the
  // status forward, which carries the page forward with it automatically.
  // Earlier pages stay reachable via the step tabs, for reference only.
  const [activeStep, setActiveStep] = useState(1);
  const maxStep = app?.status ? pipelineStepForStatus(app.status) : 1;
  const seenMaxStepRef = useRef(null);
  useEffect(() => {
    if (!app?.status) return;
    if (seenMaxStepRef.current === null || maxStep > seenMaxStepRef.current) {
      setActiveStep(maxStep);
    }
    seenMaxStepRef.current = maxStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.status]);

  const [modal, setModal] = useState(null); // 'return' | 'reject' | 'schedule'
  const [showAllAct, setShowAllAct] = useState(false);
  const [tab, setTab] = useState('overview'); // overview | contact | experience | skills
  const [rounds, setRounds] = useState([]);
  // HR is always the final round: once it exists nothing else can be scheduled,
  // and no round can be added while the previous one is still open.
  const hrFinalRound = rounds.find((r) => r.is_hr_final);
  const openRound = rounds.find((r) => r.status === 'scheduled');
  // With a job plan, the next round is fixed: its planned name, or HR as the last slot.
  const plan = app?.interviewPlan ?? null;
  const nextSlot = rounds.length + 1;
  const plannedRound = plan
    ? nextSlot <= plan.length
      ? { name: plan[nextSlot - 1], isHr: false }
      : { name: 'HR Final Interview', isHr: true }
    : null;
  const [feedbackFor, setFeedbackFor] = useState(null); // round being scored
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(null); // round id currently resending its invitation
  const [resendingVerification, setResendingVerification] = useState(false);
  const [offerStatus, setOfferStatus] = useState(null);
  const [offer, setOffer] = useState(null);
  const [docs, setDocs] = useState([]);
  const [acceptingOffer, setAcceptingOffer] = useState(false);
  const [preview, setPreview] = useState(null); // { url, fileName, title } for DocumentPreviewModal
  const [assignedRole, setAssignedRole] = useState('');
  const [assignedRoleError, setAssignedRoleError] = useState('');

  const reloadRounds = () => {
    if (candidateId) listInterviewRounds(candidateId).then(setRounds).catch(() => setRounds([]));
  };
  useEffect(reloadRounds, [candidateId]);

  const reloadDocs = () => {
    if (candidateId) listApplicationDocuments(candidateId).then(setDocs).catch(() => setDocs([]));
  };
  useEffect(reloadDocs, [candidateId]);

  // `file` picks one part of a multi-file document (e.g. Aadhaar back side).
  const viewDoc = async (d, file = null, part = '') => {
    const files = d.document_files || [];
    const current = file || files.find((f) => f.is_current) || files[files.length - 1];
    if (!current) return;
    const title = part ? `${d.document_requirements?.name} — ${part}` : d.document_requirements?.name;
    setPreview({ url: null, fileName: current.file_name, title });
    try {
      const url = await documentFileUrl(current.storage_path);
      setPreview({ url, fileName: current.file_name, title });
    } catch (e) {
      setPreview(null);
      toast.error(e.message || 'Could not open this document.');
    }
  };

  const reloadOffer = () => {
    if (!candidateId) return;
    getOfferStatus(candidateId).then(setOfferStatus).catch(() => setOfferStatus(null));
    getOffer(candidateId).then(setOffer).catch(() => setOffer(null));
  };
  useEffect(reloadOffer, [candidateId]);


  useEffect(() => {
    if (!app || app.status !== APP_STATUS.SUBMITTED) return;
    startReviewApi(app.id).then(reloadRemote).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.status]);

  if (remote.loading) {
    return <div className="cx-loading" style={{ padding: 48 }}>Loading candidate…</div>;
  }

  if (!app) {
    return (
      <EmptyState icon="UserX" title="Candidate not found" message="This candidate may have been removed."
        action={<Button variant="ghost" onClick={() => navigate('/ta/candidates')}>Back to candidates</Button>} />
    );
  }

  const name = `${app.personal.firstName} ${app.personal.lastName}`;
  const p = app.personal;
  const pr = app.professional;
  const badge = stageBadgeForStatus(app.status);

  const stageIdx = Math.max(0, stageIndexForStatus(app.status));
  const rejected = app.status === APP_STATUS.REJECTED;
  const progress = rejected ? 0 : Math.round(((stageIdx + 1) / PIPELINE_STAGES.length) * 100);

  const doAssign = async () => {
    if (!assignTo) return;
    setAssigning(true);
    try {
      await assignApplications([app.id], assignTo);
      toast.success('Application assigned.');
      setAssignTo('');
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not assign this application.');
    } finally {
      setAssigning(false);
    }
  };

  // TA review decision — calls the real edge function and refreshes. Guarded
  // against a fast double-click firing the same decision twice (the second
  // request would otherwise reach the server and come back as a confusing
  // "cannot advance from X" error instead of being silently prevented here).
  const decide = async (action, reason, msg) => {
    if (busy) return;
    setBusy(true);
    try {
      await decideApplication(app.id, action, reason);
      await reloadRemote();
      toast.success(msg);
    } catch (e) {
      toast.error(e.message || 'Could not complete that action.');
    } finally {
      setBusy(false);
    }
  };

  // Scheduling the round and notifying the candidate are two separate
  // outcomes — a failed email never gets reported as if it were a success.
  const doSchedule = async (payload) => {
    setBusy(true);
    try {
      const result = await scheduleInterview({ applicationId: app.id, ...payload });
      setModal(null);
      if (result.emailStatus === 'sent') {
        toast.success(`Interview scheduled successfully. Invitation sent to ${result.candidateEmail}.`);
      } else if (result.emailStatus === 'no_email') {
        toast.success('Interview scheduled. This candidate has no email on file, so no invitation was sent.');
      } else {
        toast.error('Interview scheduled, but the candidate email could not be sent. You can retry from the round below.');
      }
      reloadRounds();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not schedule the interview.');
    } finally {
      setBusy(false);
    }
  };

  const resendFor = async (round) => {
    setResending(round.id);
    try {
      const result = await resendInterviewInvitation(round.id);
      if (result.emailStatus === 'sent') {
        toast.success(`Invitation sent successfully to ${result.candidateEmail}.`);
      } else {
        toast.error('Unable to send invitation. Please try again.');
      }
      reloadRounds();
    } catch (e) {
      toast.error(e.message || 'Unable to send invitation. Please try again.');
    } finally {
      setResending(null);
    }
  };

  const resendVerification = async () => {
    setResendingVerification(true);
    try {
      const result = await resendTaCandidateVerification(app.id);
      if (result.emailStatus === 'sent') {
        toast.success(`Verification link sent to ${result.candidateEmail}.`);
      } else {
        toast.error('Unable to send the verification link. Please try again.');
      }
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Unable to send the verification link. Please try again.');
    } finally {
      setResendingVerification(false);
    }
  };

  const doSendOffer = async () => {
    if (!assignedRole.trim()) {
      setAssignedRoleError('Assigned Role is required.');
      return;
    }
    setBusy(true);
    try {
      // designation is the only term this app records for the TA — HR fills
      // in everything else (department, location, joining date) during its
      // own onboarding process, not here.
      await sendOffer({ applicationId: app.id, designation: assignedRole.trim() });
      setModal(null);
      toast.success(`Offer marked as sent — role assigned: ${assignedRole.trim()}.`);
      reloadOffer();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not record the offer.');
    } finally {
      setBusy(false);
    }
  };

  const doAcceptOffer = async () => {
    if (!offer?.id) return;
    setAcceptingOffer(true);
    try {
      await acceptOffer(offer.id);
      toast.success('Offer marked as accepted — HR onboarding has been notified.');
      reloadOffer();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not record the acceptance.');
    } finally {
      setAcceptingOffer(false);
    }
  };

  const doFeedback = async (payload) => {
    setBusy(true);
    try {
      await recordInterviewFeedback({ roundId: feedbackFor.id, ...payload });
      setFeedbackFor(null);
      toast.success('Feedback saved.');
      reloadRounds();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not save the feedback.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TAHeader
        title={name}
        subtitle={`${app.candidateId}${app.candidateCode ? ` · ${app.candidateCode}` : ''} · applied for ${app.jobTitle}`}
        backTo="/ta/candidates"
        backLabel="Candidates"
      />

      {!rejected && (
        <div className="ta-progress-row">
          <div className="ta-progress"><div className="ta-progress__bar" style={{ width: `${progress}%` }} /></div>
          <span className="ta-cell-sub">{PIPELINE_STAGES[stageIdx]?.label} · {progress}%</span>
        </div>
      )}

      {app.status === APP_STATUS.RETURNED && (
        <div className="ta-note ta-note--warn"><Icon name="RotateCcw" size={15} /> Returned to candidate: {app.returnReason}</div>
      )}
      {rejected && (
        <div className="ta-note ta-note--err"><Icon name="XCircle" size={15} /> Application closed{app.rejectReason ? `: ${app.rejectReason}` : ''}</div>
      )}

      <AtsCard ats={app.atsScore} />

      <div className="ta-detail-grid">
        <div className="ta-stack">
          <Card>
            <div className="ta-ptabs">
              {[
                ['overview', 'Overview', 'LayoutDashboard'],
                ['contact', 'Contact', 'Mail'],
                ['experience', 'Experience', 'Briefcase'],
                ['skills', 'Skills & education', 'GraduationCap'],
              ].map(([k, label, icon]) => (
                <button
                  key={k}
                  type="button"
                  className={`ta-ptab${tab === k ? ' is-active' : ''}`}
                  onClick={() => setTab(k)}
                >
                  <Icon name={icon} size={15} /> {label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="ta-snapshot">
                <div className="ta-snapshot__stage">
                  <span className="ta-info__label">Current stage</span>
                  <Tag tone={badge.tone}>{badge.label}</Tag>
                </div>
                <dl className="ta-snapshot__list">
                  {[
                    ['Current role', pr.currentJobTitle ? `${pr.currentJobTitle}${pr.currentCompany ? ` @ ${pr.currentCompany}` : ''}` : null],
                    ['Experience', pr.totalExperience ? `${pr.totalExperience} yrs` : null],
                    // Notice period only makes sense for someone currently employed —
                    // never shown here for a fresher (0 years experience).
                    Number(pr.totalExperience) > 0 ? ['Notice period', pr.noticePeriod || 'Not specified'] : null,
                    ['Expected CTC', pr.expectedCTC ? formatCurrencyINR(pr.expectedCTC) : null],
                    ['Location', p.currentLocation ? `${p.currentLocation}${p.preferredLocation && p.preferredLocation !== p.currentLocation ? ` → ${p.preferredLocation}` : ''}` : null],
                    ['Application', app.isGeneral ? 'General' : 'Specific vacancy'],
                    ['Source', app.source || null],
                    ['Submitted', formatDate(app.submittedAt)],
                    ['Assigned to', app.assignedTo || null],
                  ].filter(Boolean).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              </div>
            )}

            {tab === 'contact' && (
              <>
                <div className="ta-info">
                  <Info label="Email" value={p.email} />
                  <Info label="Mobile" value={p.mobile} />
                  <Info label="Current location" value={p.currentLocation} />
                  <Info label="Preferred location" value={p.preferredLocation} />
                </div>
                <a className="ta-btn ta-btn--ghost" href={`mailto:${p.email}`} style={{ marginTop: 16 }}>
                  <Icon name="Mail" size={15} /> Mail to
                </a>
              </>
            )}

            {tab === 'experience' && (
              <div className="ta-info">
                <Info label="Current title" value={pr.currentJobTitle} />
                <Info label="Current company" value={pr.currentCompany} />
                <Info label="Total experience" value={pr.totalExperience ? `${pr.totalExperience} years` : '—'} />
                <Info label="Relevant experience" value={pr.relevantExperience ? `${pr.relevantExperience} years` : '—'} />
                <Info label="Notice period" value={pr.noticePeriod} />
                <Info label="Expected CTC" value={formatCurrencyINR(pr.expectedCTC)} />
              </div>
            )}

            {tab === 'skills' && (
              <>
                <div className="ta-skills" style={{ marginBottom: 16 }}>
                  {(pr.skills || []).length ? pr.skills.map((s) => <span key={s} className="ta-skill">{s}</span>) : <span className="ta-cell-mute">No skills listed</span>}
                </div>
                {(app.education || []).map((e, i) => (
                  <div key={e.id || i} className="ta-info__item" style={{ marginBottom: 8 }}>
                    <span className="ta-info__label">{e.qualification || `Education ${i + 1}`}</span>
                    <span className="ta-info__value">{[e.university, e.specialization, e.year].filter(Boolean).join(' · ') || '—'}</span>
                  </div>
                ))}
              </>
            )}
          </Card>

          {isAdminTier && (
            <Card title="Assignment">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div className="ta-info__item">
                  <span className="ta-info__label">Assigned to</span>
                  <span className="ta-info__value">{app.assignedTo || 'Unassigned'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="ta-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Assign to">
                    <option value="">{app.assignedTaId ? 'Reassign to…' : 'Assign to…'}</option>
                    {tas.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                  </select>
                  <Button onClick={doAssign} disabled={!assignTo || assigning}>{assigning ? 'Assigning…' : 'Assign'}</Button>
                </div>
              </div>
            </Card>
          )}

          {!(app.status === 'DRAFT' && app.rawSource === 'ta_sourced') && (
            <Card bodyStyle={{ padding: '12px 16px' }}>
              <div className="ta-stepper">
                {[[1, 'Application review'], [2, 'Interview'], [3, 'Documents'], [4, 'Offer']]
                  .filter(([n]) => n <= maxStep)
                  .map(([n, label], i, arr) => (
                    <Fragment key={n}>
                      <button
                        type="button"
                        className={`ta-step${activeStep === n ? ' is-active' : ''}`}
                        onClick={() => setActiveStep(n)}
                      >
                        <span className="ta-step__num">{n < activeStep ? <Icon name="Check" size={12} /> : n}</span>
                        <span className="ta-step__label">{label}</span>
                      </button>
                      {i < arr.length - 1 && <span className="ta-step__sep" />}
                    </Fragment>
                  ))}
              </div>
            </Card>
          )}

          {app.status === 'DRAFT' && app.rawSource === 'ta_sourced' ? (
            <Card title="Candidate verification">
              <div className="ta-note ta-note--warn" style={{ marginBottom: 12 }}>
                <Icon name="Clock3" size={15} /> Awaiting candidate verification — {app.candidateEmail} has not confirmed this application yet.
              </div>
              <p className="ta-cell-sub" style={{ marginBottom: 12 }}>
                This candidate was created from an uploaded resume. Once they open the verification link, review and confirm their details, it will enter the normal recruitment pipeline.
              </p>
              <Button icon="Send" disabled={resendingVerification} onClick={resendVerification}>
                {resendingVerification ? 'Sending…' : 'Resend Verification Link'}
              </Button>
            </Card>
          ) : activeStep === 1 ? (
            <>
              <Card title="Step 1 · Application review">
                {IN_REVIEW.includes(app.status) ? (
              <>
                <p className="ta-cell-sub" style={{ marginBottom: 12 }}>
                  Check the profile against the role, then take the candidate forward to interviews or send the application back.
                </p>
                <div className="ta-btnrow">
                  <Button icon="CheckCircle2" disabled={busy} onClick={() => decide('advance', null, 'Candidate advanced to the interview stage.')}>Advance candidate</Button>
                  <Button variant="ghost" icon="RotateCcw" disabled={busy} onClick={() => setModal('return')}>Request update</Button>
                  <Button variant="ghost" icon="XCircle" disabled={busy} onClick={() => setModal('reject')}>Close application</Button>
                </div>
              </>
            ) : app.status === APP_STATUS.RETURNED ? (
              <p className="ta-cell-sub">Returned to the candidate: {app.returnReason || 'awaiting an updated application.'}</p>
            ) : rejected ? (
              <p className="ta-cell-sub">Application was not taken forward{app.rejectReason ? `: ${app.rejectReason}` : '.'}</p>
            ) : (
                  <p className="ta-cell-sub">Approved — the candidate has moved forward to interviews.</p>
                )}
              </Card>
            </>
          ) : null}

          {activeStep === 2 && (
            <Card
              title="Step 2 · Interview"
              action={
                [APP_STATUS.INTERVIEW_PLANNING, APP_STATUS.INTERVIEW_IN_PROGRESS, APP_STATUS.INTERVIEW_PASSED].includes(app.status) && (
                  hrFinalRound ? (
                    <span className="ta-cell-sub">HR final round scheduled. No further rounds.</span>
                  ) : (
                    <Button
                      variant="ghost" icon="CalendarPlus" disabled={!!openRound}
                      title={openRound ? `Record Round ${openRound.round_number}'s outcome first.` : undefined}
                      onClick={() => setModal('schedule')}
                    >Schedule round</Button>
                  )
                )
              }
            >
              {rounds.length === 0 ? (
                <p className="ta-cell-sub">No round scheduled yet — use <b>Schedule round</b> to set up the first interview.</p>
              ) : (
                <div className="ta-stack">
                  {rounds.map((r) => {
                    const feedback = r.interview_feedback?.[0];
                    const panel = (r.interview_assignments || []).map((a) => a.interview_panelists?.name).filter(Boolean);
                    return (
                      <div className="ta-round" key={r.id}>
                        <div className="ta-round__head">
                          <span className="ta-cell-strong">Round {r.round_number} · {r.name}{r.is_hr_final ? ' (HR final)' : ''}</span>
                          {/* Candidate's one-time answer from the interview email (Accept / Decline / Reschedule). */}
                          <Tag tone={CANDIDATE_RESPONSE[r.candidate_response]?.tone || 'grey'}>
                            {CANDIDATE_RESPONSE[r.candidate_response]?.label || 'Not responded yet'}
                          </Tag>
                          {feedback ? (
                            <Tag tone={ROUND_DECISION_TONE[feedback.decision]}>{ROUND_DECISION_LABEL[feedback.decision]}</Tag>
                          ) : (
                            <Tag tone="blue">Scheduled</Tag>
                          )}
                        </div>
                        <div className="ta-cell-sub">
                          {formatDate(r.scheduled_at)} {new Date(r.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {panel.length > 0 ? ` · Panel: ${panel.join(', ')}` : ''}
                        </div>
                        <div className="ta-cell-sub" style={{ marginTop: 2 }}>
                          {r.meeting_type === 'in_person' ? (
                            <>In-Person{r.location ? ` · ${r.location}` : ''}{r.location_details ? ` — ${r.location_details}` : ''}</>
                          ) : (
                            <>Virtual{r.meeting_platform ? ` · ${PLATFORM_LABEL[r.meeting_platform] || r.meeting_platform}` : ''}</>
                          )}
                        </div>
                        {r.meeting_type !== 'in_person' && r.meeting_url && (
                          <div style={{ marginTop: 6 }}>
                            <a className="ta-btn ta-btn--ghost ta-btn--sm" href={r.meeting_url} target="_blank" rel="noreferrer">
                              <Icon name="Video" size={13} /> Join Meeting
                            </a>
                          </div>
                        )}
                        <div className="ta-cell-sub" style={{ marginTop: 6 }}>
                          {r.invitation?.status === 'sent' && <>Invitation sent to: {r.invitation.sentTo}</>}
                          {r.invitation?.status === 'failed' && (
                            <span style={{ color: 'var(--tag-red-fg)' }}>Invitation could not be sent to {r.invitation.sentTo}.</span>
                          )}
                          {!r.invitation && <>No invitation sent yet.</>}
                          {r.invitation?.status !== 'sent' && (
                            <button
                              type="button" className="ta-link" style={{ marginLeft: 8 }}
                              disabled={resending === r.id} onClick={() => resendFor(r)}
                            >
                              {resending === r.id ? 'Sending invitation…' : 'Resend invitation'}
                            </button>
                          )}
                        </div>
                        {feedback && (
                          <div className="ta-cell-sub" style={{ marginTop: 4 }}>Remarks: {feedback.remarks}</div>
                        )}
                        {!feedback && r.status === 'scheduled' && (
                          <div style={{ marginTop: 8 }}>
                            <Button variant="ghost" icon="ClipboardCheck" onClick={() => setFeedbackFor(r)}>Record feedback</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {app.status === APP_STATUS.INTERVIEW_PASSED && (
                    <div style={{ marginTop: 4 }}>
                      <Button icon="ArrowRight" onClick={() => decide('request_documents', null, 'Pre-offer document checklist unlocked for the candidate.')}>
                        Proceed to document verification
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {activeStep === 3 && (
            <Card
              title="Step 3 · Documents"
              action={docs.length > 0 && (() => {
                const sm = summarizeDocuments(docs, new Set(docs.map((d) => d.document_requirements?.key)).size);
                return <Tag tone={sm.ready ? 'green' : 'amber'}>{sm.ready ? 'All applicable requirements resolved' : `${sm.unresolved.length} to resolve`}</Tag>;
              })()}
            >
              {app.status === APP_STATUS.DOC_VERIFICATION && (
                <p className="ta-note ta-note--info" style={{ marginBottom: 12 }}>
                  Pre-offer documents requested. Two-step verification: review each requirement below and approve it (or the candidate's reason for not providing it)
                  to send it to HR for final sign-off. Only what applies to this candidate is listed.
                </p>
              )}
              {docs.length === 0 ? (
                <p className="ta-cell-sub">No documents requested yet.</p>
              ) : (
                <TADocumentReview docs={docs} onReload={reloadDocs} onView={viewDoc} onOpen={(d) => navigate(`/ta/candidates/${candidateId}/documents/${d.id}/verify`)} />
              )}
            </Card>
          )}

          {activeStep === 4 && (
            <Card title="Step 4 · Offer">
              {OFFER_SENT_STAGE.includes(app.status) && offer ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Tag tone={OFFER_STATUS_TONE[offer.status]}>{OFFER_STATUS_LABEL[offer.status]}</Tag>
                    {offer.sent_at && <span className="ta-cell-sub">Sent {formatDate(offer.sent_at)}</span>}
                  </div>
                  <div className="ta-info">
                    <Info label="Designation" value={offer.designation} />
                    <Info label="Department" value={offer.department} />
                    <Info label="Location" value={offer.location} />
                    <Info label="Joining date" value={formatDate(offer.joining_date)} />
                  </div>
                  {offer.status === 'accepted' && (
                    <div className="ta-note ta-note--ok" style={{ marginTop: 12 }}>
                      <Icon name="CheckCircle2" size={15} /> Candidate accepted the offer.
                    </div>
                  )}
                  {['sent', 'viewed'].includes(offer.status) && (
                    <>
                      <p className="ta-cell-sub" style={{ margin: '12px 0' }}>
                        Once the candidate replies to your email accepting the offer, record it here.
                      </p>
                      <Button icon="CheckCircle2" onClick={doAcceptOffer} disabled={acceptingOffer}>
                        {acceptingOffer ? 'Recording…' : 'Mark offer accepted'}
                      </Button>
                    </>
                  )}
                </>
              ) : offerStatus?.offerReady ? (
                <>
                  <div className="ta-note ta-note--ok" style={{ marginBottom: 12 }}>
                    <Icon name="CheckCircle2" size={15} /> All required pre-offer documents have been verified by HR. Send the offer letter from your own email, then record it here.
                  </div>
                  <Button icon="FileCheck" onClick={() => setModal('offer')}>Record offer</Button>
                </>
              ) : (
                <>
                  <div className="ta-note ta-note--warn" style={{ marginBottom: 10, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="Lock" size={15} /> <strong>Offer locked</strong> — complete document verification first.
                    </div>
                  </div>
                  {offerStatus?.blockingReasons?.length > 0 && (
                    <ul className="ta-bullets">
                      {offerStatus.blockingReasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                </>
              )}
            </Card>
          )}
        </div>

        <div className="ta-stack ta-actside">
          <Card title="Activity">
            {app.events.length === 0 ? (
              <p className="ta-cell-mute">No activity yet.</p>
            ) : (
              <>
                <ol className="ta-timeline ta-timeline--scroll">
                  {(showAllAct ? app.events : app.events.slice(0, 4)).map((a) => (
                    <li key={a.id}>
                      <span className="ta-timeline__dot" />
                      <div>
                        <div className="ta-cell-strong">{a.title}</div>
                        <div className="ta-cell-sub">{a.description}</div>
                        <div className="ta-cell-sub">{formatDate(a.at)} · {a.actor}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                {app.events.length > 4 && (
                  <button
                    type="button"
                    className={`ta-actmore${showAllAct ? ' is-open' : ''}`}
                    onClick={() => setShowAllAct((v) => !v)}
                  >
                    {showAllAct ? 'Show less' : `Show all ${app.events.length}`}
                    <Icon name="ChevronDown" size={14} />
                  </button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <ReasonModal
        open={modal === 'return'} onClose={() => setModal(null)}
        title="Request an update" label="What does the candidate need to add or fix?" confirmLabel="Send request" tone="secondary"
        onSubmit={(reason) => { setModal(null); decide('request_update', reason, 'Update request sent to the candidate.'); }}
      />
      <ReasonModal
        open={modal === 'reject'} onClose={() => setModal(null)}
        title="Close application" label="Reason (internal)" confirmLabel="Close application" tone="danger"
        onSubmit={(reason) => { setModal(null); decide('close', reason, 'Application closed.'); }}
      />
      <ScheduleInterviewModal
        open={modal === 'schedule'} onClose={() => setModal(null)}
        roundNumber={rounds.length + 1} plannedRound={plannedRound} busy={busy} onSchedule={doSchedule}
        candidateEmail={p.email}
      />
      <InterviewFeedbackModal
        open={!!feedbackFor} onClose={() => setFeedbackFor(null)}
        round={feedbackFor} busy={busy} onSubmit={doFeedback}
      />
      <Modal
        open={modal === 'offer'}
        onClose={() => { setModal(null); setAssignedRole(''); setAssignedRoleError(''); }}
        title="Mark offer as sent"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModal(null); setAssignedRole(''); setAssignedRoleError(''); }}>Cancel</Button>
            <Button onClick={doSendOffer} disabled={busy}>{busy ? 'Saving…' : 'Mark offer as sent'}</Button>
          </>
        }
      >
        <p className="ta-cell-sub" style={{ marginBottom: 14 }}>
          Send the offer letter to {name} from your own email first, then confirm here — this just records that it went
          out. HR handles department, location, and joining date during onboarding.
        </p>
        <Field label="Assigned Role" required error={assignedRoleError}>
          <Input
            value={assignedRole}
            placeholder="e.g. Software Engineer"
            error={assignedRoleError}
            onChange={(e) => { setAssignedRole(e.target.value); if (assignedRoleError) setAssignedRoleError(''); }}
          />
        </Field>
      </Modal>
      <DocumentPreviewModal
        open={!!preview} onClose={() => setPreview(null)}
        url={preview?.url} fileName={preview?.fileName} title={preview?.title}
      />
    </>
  );
}
