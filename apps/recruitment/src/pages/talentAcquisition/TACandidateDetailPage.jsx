import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import ReasonModal from '../../components/workflow/ReasonModal.jsx';
import ScheduleInterviewModal from '../../components/workflow/ScheduleInterviewModal.jsx';
import InterviewFeedbackModal from '../../components/workflow/InterviewFeedbackModal.jsx';
import OfferComposerModal from '../../components/workflow/OfferComposerModal.jsx';
import { getApplication, getApplicationEvents, decideApplication, startReview as startReviewApi } from '../../api/applications.js';
import { listInterviewRounds, scheduleInterview, recordInterviewFeedback } from '../../api/interviews.js';
import { getOfferStatus, getOffer, sendOffer } from '../../api/offers.js';
import { applicationFromDb } from '../../api/mappers.js';
import { useToast } from '../../context/ToastContext.jsx';
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

function Info({ label, value }) {
  return (
    <div className="ta-info__item">
      <span className="ta-info__label">{label}</span>
      <span className="ta-info__value">{value || '—'}</span>
    </div>
  );
}

const IN_REVIEW = [APP_STATUS.SUBMITTED, APP_STATUS.TA_REVIEW];

/* Database application + timeline -> the shape this page renders. */
function adaptRemote(a, events) {
  if (!a) return null;
  return {
    id: a.id,
    candidateId: a.code,
    status: a.status,
    jobId: a.jobId,
    jobTitle: a.jobTitle,
    isGeneral: !a.jobId,
    source: a.source === 'ta_link' ? 'TA link' : 'Careers',
    submittedAt: a.submittedAt,
    assignedTo: 'Talent Acquisition',
    returnReason: a.returnReason,
    rejectReason: a.rejectReason,
    personal: a.personal || {},
    professional: a.professional || {},
    education: a.education || [],
    additional: a.additional || {},
    events: (events || []).map((e) => ({
      id: e.id, title: e.title, description: e.description, at: e.created_at, actor: e.actor_label || 'System',
    })),
  };
}

export default function TACandidateDetailPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

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
  const [modal, setModal] = useState(null); // 'return' | 'reject' | 'schedule'
  const [showAllAct, setShowAllAct] = useState(false);
  const [tab, setTab] = useState('overview'); // overview | contact | experience | skills
  const [rounds, setRounds] = useState([]);
  const [feedbackFor, setFeedbackFor] = useState(null); // round being scored
  const [busy, setBusy] = useState(false);
  const [offerStatus, setOfferStatus] = useState(null);
  const [offer, setOffer] = useState(null);

  const reloadRounds = () => {
    if (candidateId) listInterviewRounds(candidateId).then(setRounds).catch(() => setRounds([]));
  };
  useEffect(reloadRounds, [candidateId]);

  const reloadOffer = () => {
    if (!candidateId) return;
    getOfferStatus(candidateId).then(setOfferStatus).catch(() => setOfferStatus(null));
    getOffer(candidateId).then(setOffer).catch(() => setOffer(null));
  };
  useEffect(reloadOffer, [candidateId]);

  // Keep the Activity card no taller than the workflow column beside it.
  const leftColRef = useRef(null);
  const [sideMax, setSideMax] = useState(null);
  useLayoutEffect(() => {
    const el = leftColRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const sync = () => setSideMax(window.innerWidth > 1160 ? el.offsetHeight : null);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => { ro.disconnect(); window.removeEventListener('resize', sync); };
  }, []);

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

  // TA review decision — calls the real edge function and refreshes.
  const decide = async (action, reason, msg) => {
    try {
      await decideApplication(app.id, action, reason);
      await reloadRemote();
      toast.success(msg);
    } catch (e) {
      toast.error(e.message || 'Could not complete that action.');
    }
  };

  const doSchedule = async (payload) => {
    setBusy(true);
    try {
      await scheduleInterview({ applicationId: app.id, ...payload });
      setModal(null);
      toast.success('Interview scheduled.');
      reloadRounds();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not schedule the interview.');
    } finally {
      setBusy(false);
    }
  };

  const doSendOffer = async (payload) => {
    setBusy(true);
    try {
      await sendOffer({ applicationId: app.id, ...payload });
      setModal(null);
      toast.success('Offer sent to the candidate.');
      reloadOffer();
      reloadRemote();
    } catch (e) {
      toast.error(e.message || 'Could not send the offer.');
    } finally {
      setBusy(false);
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
        subtitle={`${app.candidateId} · applied for ${app.jobTitle}`}
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

      <div className="ta-detail-grid">
        <div className="ta-stack" ref={leftColRef}>
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
                    ['Notice period', pr.noticePeriod || null],
                    ['Expected CTC', pr.expectedCTC ? formatCurrencyINR(pr.expectedCTC) : null],
                    ['Location', p.currentLocation ? `${p.currentLocation}${p.preferredLocation && p.preferredLocation !== p.currentLocation ? ` → ${p.preferredLocation}` : ''}` : null],
                    ['Application', app.isGeneral ? 'General' : 'Specific vacancy'],
                    ['Source', app.source || null],
                    ['Submitted', formatDate(app.submittedAt)],
                    ['Assigned to', app.assignedTo || null],
                  ].filter(([, v]) => v).map(([k, v]) => (
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

          <Card title="Application review">
            {IN_REVIEW.includes(app.status) ? (
              <>
                <p className="ta-cell-sub" style={{ marginBottom: 12 }}>
                  Check the profile against the role, then take the candidate forward to interviews or send the application back.
                </p>
                <div className="ta-btnrow">
                  <Button icon="CheckCircle2" onClick={() => decide('advance', null, 'Candidate advanced to the interview stage.')}>Advance candidate</Button>
                  <Button variant="ghost" icon="RotateCcw" onClick={() => setModal('return')}>Request update</Button>
                  <Button variant="ghost" icon="XCircle" onClick={() => setModal('reject')}>Close application</Button>
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

          {(IN_INTERVIEW.includes(app.status) || app.status === APP_STATUS.DOC_VERIFICATION) && (
            <Card
              title="Interview process"
              action={
                [APP_STATUS.INTERVIEW_PLANNING, APP_STATUS.INTERVIEW_IN_PROGRESS, APP_STATUS.INTERVIEW_PASSED].includes(app.status) && (
                  <Button variant="ghost" icon="CalendarPlus" onClick={() => setModal('schedule')}>Schedule round</Button>
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
                          <span className="ta-cell-strong">Round {r.round_number} · {r.name}</span>
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
                  {app.status === APP_STATUS.DOC_VERIFICATION && (
                    <p className="ta-cell-sub" style={{ marginTop: 4 }}>
                      Pre-offer documents requested — the candidate is uploading, and HR verifies each one. You'll be notified once verification is complete.
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {(CAN_OFFER_STAGE.includes(app.status) || OFFER_SENT_STAGE.includes(app.status)) && (
            <Card title="Offer">
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
                </>
              ) : offerStatus?.offerReady ? (
                <>
                  <div className="ta-note ta-note--ok" style={{ marginBottom: 12 }}>
                    <Icon name="CheckCircle2" size={15} /> All required pre-offer documents have been verified by HR. You can now prepare and send the offer letter.
                  </div>
                  <Button icon="FileCheck" onClick={() => setModal('offer')}>Prepare offer</Button>
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

        <div
          className="ta-stack ta-actside"
          style={sideMax ? { maxHeight: `${sideMax}px` } : undefined}
        >
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
        roundNumber={rounds.length + 1} busy={busy} onSchedule={doSchedule}
      />
      <InterviewFeedbackModal
        open={!!feedbackFor} onClose={() => setFeedbackFor(null)}
        round={feedbackFor} busy={busy} onSubmit={doFeedback}
      />
      <OfferComposerModal
        open={modal === 'offer'} onClose={() => setModal(null)}
        applicationId={app.id} candidateName={name} jobTitle={app.jobTitle}
        busy={busy} onSend={doSendOffer}
      />
    </>
  );
}
