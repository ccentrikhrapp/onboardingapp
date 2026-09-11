import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listMyApplications, getApplicationEvents, resubmitApplication } from '../../api/applications.js';
import { listInterviewRounds } from '../../api/interviews.js';
import { listApplicationDocuments, uploadDocumentFile, submitDocument } from '../../api/documents.js';
import { applicationFromDb } from '../../api/mappers.js';
import { initialsOf, formatDate } from '../../utils/format.js';
import { APP_STATUS, stageIndexForStatus, stageBadgeForStatus } from '../../constants/statuses.js';

/* The candidate's own journey — used to size the progress donut. This app's
   pipeline stops at the offer; onboarding onward lives in the HR application. */
const CANDIDATE_STEPS = ['Applied', 'In review', 'Interview', 'Offer'];
const PIPELINE_TO_CANDIDATE = [1, 1, 2, 3, 3, 3, 3];
const DOC_STAGES = [APP_STATUS.DOC_VERIFICATION, APP_STATUS.DOCS_VERIFIED];
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
      return { icon: 'CalendarClock', text: 'You have interview rounds scheduled — see below.' };
    case APP_STATUS.INTERVIEW_PASSED:
      return { icon: 'CheckCircle2', text: "You've cleared the interviews. Document verification is next." };
    case APP_STATUS.DOC_VERIFICATION:
      return { icon: 'Upload', text: 'Please upload your required documents below.' };
    case APP_STATUS.DOCS_VERIFIED:
      return { icon: 'FileCheck', text: 'All documents verified. Your offer is being prepared.' };
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
    jobTitle: a.jobTitle,
    submittedAt: a.submittedAt,
    assignedTo: 'Talent Acquisition',
    status: a.status,
    returnReason: a.returnReason,
    rejectReason: a.rejectReason,
    personal: a.personal || {},
  };
}

export default function MyApplicationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { configured } = useAuth();
  const [remote, setRemote] = useState({ loading: true, app: null, events: [] });
  const [resubmitting, setResubmitting] = useState(false);
  const [rounds, setRounds] = useState([]);
  const [docs, setDocs] = useState([]);
  const [docBusy, setDocBusy] = useState({}); // application_document id -> true while acting
  const [reasonFor, setReasonFor] = useState(null);
  const [reasonText, setReasonText] = useState('');

  const load = () => {
    listMyApplications()
      .then(async (apps) => {
        const latest = apps?.[0] ? applicationFromDb(apps[0]) : null;
        const events = latest ? await getApplicationEvents(latest.id) : [];
        setRemote({ loading: false, app: latest, events });
        if (latest && INTERVIEW_STAGES.includes(latest.status)) {
          listInterviewRounds(latest.id).then(setRounds).catch(() => setRounds([]));
        }
        if (latest && DOC_STAGES.includes(latest.status)) {
          listApplicationDocuments(latest.id).then(setDocs).catch(() => setDocs([]));
        }
      })
      .catch(() => setRemote({ loading: false, app: null, events: [] }));
  };
  useEffect(() => {
    if (configured) load();
    else setRemote({ loading: false, app: null, events: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  if (!configured) {
    return (
      <div className="cx-page">
        <div className="wsauth__alert" role="alert">
          <Icon name="AlertCircle" size={15} /> Backend not configured yet — see .env.example.
        </div>
      </div>
    );
  }

  if (remote.loading) {
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

  const activities = remote.events.map((e) => ({
    id: e.id, title: e.title, description: e.description, at: e.created_at, actor: e.actor_label || 'System',
  }));
  const name = `${app.personal.firstName || ''} ${app.personal.lastName || ''}`.trim() || 'there';

  const status = app.status;
  const badge = stageBadgeForStatus(status);
  const stageIdx = stageIndexForStatus(status);
  const rejected = status === APP_STATUS.REJECTED;
  const hint = nextStep(status);

  const candIdx = rejected ? 0 : (PIPELINE_TO_CANDIDATE[Math.max(0, stageIdx)] ?? 0);
  const progress = rejected ? 0 : Math.round(((candIdx + 1) / CANDIDATE_STEPS.length) * 100);

  const setBusy = (id, v) => setDocBusy((s) => ({ ...s, [id]: v }));

  const uploadDoc = async (doc, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(doc.id, true);
    try {
      const uploaded = await uploadDocumentFile(app.id, doc.document_requirements, file);
      await submitDocument({ applicationDocumentId: doc.id, ...uploaded });
      toast.success(`${doc.document_requirements.name} uploaded — now under verification.`);
      load();
    } catch (e) {
      toast.error(e.message || 'Upload failed.');
    } finally {
      setBusy(doc.id, false);
    }
  };

  const confirmCannotProvide = async () => {
    if (!reasonText.trim()) return;
    setBusy(reasonFor.id, true);
    try {
      await submitDocument({ applicationDocumentId: reasonFor.id, cannotProvide: true, reason: reasonText.trim() });
      toast.success('Reason submitted — our team will review it.');
      setReasonFor(null);
      setReasonText('');
      load();
    } catch (e) {
      toast.error(e.message || 'Could not submit the reason.');
    } finally {
      setBusy(reasonFor.id, false);
    }
  };

  const doResubmit = async () => {
    setResubmitting(true);
    try {
      await resubmitApplication(app.id);
      toast.success('Application resubmitted for review.');
      load();
    } catch (e) {
      toast.error(e.message || 'Could not resubmit your application.');
    } finally {
      setResubmitting(false);
    }
  };

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
          <Button icon="RotateCcw" onClick={doResubmit} disabled={resubmitting}>
            {resubmitting ? 'Resubmitting…' : 'Resubmit application'}
          </Button>
        </div>
      )}

      <div className="ta-stack">
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

        {rounds.length > 0 && (
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

        {docs.length > 0 && (
          <Card
            title="Required documents"
            action={<Tag tone={docs.every((d) => ['verified', 'cannot_provide'].includes(d.status)) ? 'green' : 'amber'}>
              {docs.filter((d) => ['verified', 'cannot_provide'].includes(d.status)).length} of {docs.length} done
            </Tag>}
          >
            <p className="ta-cell-sub" style={{ marginBottom: 14 }}>
              Upload each document below — HR verifies them manually. Where you genuinely can't provide one, mark it
              and give a reason.
            </p>
            <div className="ta-stack" style={{ gap: 8 }}>
              {docs.map((d) => {
                const req = d.document_requirements;
                const meta = DOC_STATUS_META[d.status] || { label: d.status, tone: 'grey' };
                const canAct = ['requested', 'revision_required', 'cannot_provide'].includes(d.status);
                const busy = !!docBusy[d.id];
                return (
                  <div className="ta-docrow" key={d.id}>
                    <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ta-cell-strong">{req.name}{req.requirement_class !== 'conditional' && <span className="cx-req" title="Required"> *</span>}</div>
                      {d.status === 'revision_required' && d.hr_remarks && (
                        <div className="ta-cell-sub" style={{ color: 'var(--tag-red-fg)' }}>Correction needed: {d.hr_remarks}</div>
                      )}
                      {d.status === 'cannot_provide' && d.cannot_provide_reason && (
                        <div className="ta-cell-sub" style={{ color: 'var(--tag-amber-fg)' }}>Reason: {d.cannot_provide_reason}</div>
                      )}
                      {reasonFor?.id === d.id && (
                        <div className="cx-docreason">
                          <textarea
                            className="cx-docreason__input" rows={2}
                            placeholder={`Why can't you provide the ${req.name.toLowerCase()}?`}
                            value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                          />
                          <div className="cx-docreason__btns">
                            <button className="ta-btn ta-btn--sm" onClick={confirmCannotProvide} disabled={!reasonText.trim() || busy}>Submit reason</button>
                            <button className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => { setReasonFor(null); setReasonText(''); }}>Cancel</button>
                          </div>
                          {req.warning_message && (
                            <div className="ta-note ta-note--warn" style={{ marginTop: 8 }}>
                              <Icon name="AlertTriangle" size={14} /> <span>{req.warning_message}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    {canAct && reasonFor?.id !== d.id && (
                      <span className="cx-docacts">
                        {busy ? <span className="ta-spinner" /> : (
                          <>
                            <label className="ta-btn ta-btn--ghost" style={{ cursor: 'pointer' }}>
                              <Icon name="Upload" size={14} /> Upload
                              <input type="file" hidden accept={(req.allowed_file_types || []).map((t) => `.${t}`).join(',')} onChange={(e) => uploadDoc(d, e.target.files)} />
                            </label>
                            {req.can_mark_cannot_provide && (
                              <button className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => { setReasonFor(d); setReasonText(''); }}>Can't provide</button>
                            )}
                          </>
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
