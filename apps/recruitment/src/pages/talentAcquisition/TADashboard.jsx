import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import KpiCard from '../../components/ta/KpiCard.jsx';
import DonutChart from '../../components/ta/DonutChart.jsx';
import RecruitmentAnalytics from '../../components/ta/RecruitmentAnalytics.jsx';
import NeedsAttentionCard from '../../components/ta/NeedsAttentionCard.jsx';
import PipelineBars from '../../components/ta/PipelineBars.jsx';
import ProgressBarList from '../../components/ta/ProgressBarList.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { listApplications, listRecentEvents, subscribeApplications } from '../../api/applications.js';
import { listUpcomingInterviews } from '../../api/interviews.js';
import { applicationFromDb } from '../../api/mappers.js';
import {
  APP_STATUS,
  ROUND_STATUS,
  OFFER_STATUS,
  stageIndexForStatus,
} from '../../constants/statuses.js';
import { groupCounts, noticePeriodDays } from '../../utils/metrics.js';
import { timeAgo, formatDate, initialsOf, avatarToneOf } from '../../utils/format.js';
import PipelineReminderPopup from '../../components/ta/PipelineReminderPopup.jsx';
import { SkeletonPage } from '../../components/common/States.jsx';

const DAY = 86400000;
const DEPT_TONE = {
  Engineering: 'blue', Design: 'violet', Sales: 'amber', Analytics: 'teal', People: 'green',
};

/* Activity entries that come from the candidate's own actions — these are the
   "something changed, take a look" updates the TA shouldn't have to hunt for. */
const CANDIDATE_UPDATE_TITLES = new Set([
  'Application Submitted', 'Application Resubmitted', 'Document Uploaded',
  'Document Not Provided', 'Onboarding Forms Submitted', 'Offer Accepted',
]);
const UPDATE_ICON = {
  'Application Submitted': 'FileText',
  'Application Resubmitted': 'RotateCcw',
  'Document Uploaded': 'Upload',
  'Document Not Provided': 'MessageSquare',
  'Onboarding Forms Submitted': 'ClipboardList',
  'Offer Accepted': 'CheckCircle2',
};

/* The five pipeline stages shown in the funnel + list, with the index in
   PIPELINE_STAGES a candidate must have reached to be counted. */
const STAGES = [
  { label: 'Applied', icon: 'FileText', tone: 'blue', reach: 0, color: 'var(--ta-pastel-blue)', key: 'applied' },
  { label: 'Screening', icon: 'Eye', tone: 'violet', reach: 1, color: 'var(--ta-pastel-lavender)', key: 'screening' },
  { label: 'Interview', icon: 'CalendarDays', tone: 'amber', reach: 2, color: 'var(--ta-pastel-amber)', key: 'interview' },
  { label: 'Offer', icon: 'FileCheck', tone: 'green', reach: 4, color: 'var(--ta-pastel-green-ink)', key: 'offer' },
  { label: 'Hired', icon: 'UserRoundCheck', tone: 'green', reach: 5, color: 'var(--ta-pastel-green)', key: 'hired' },
];

// Per the chart color spec: Referral=green, Job Portal=blue, Social=pink,
// Direct=lavender — muted pastel tones, not a rainbow chart.
const SOURCE_COLOR = {
  Direct: 'var(--ta-pastel-lavender)',
  'Job Board': 'var(--ta-pastel-blue)',
  Referral: 'var(--ta-pastel-green-ink)',
  Social: 'var(--ta-pastel-pink)',
};

const PERIODS = [
  { value: 'all', label: 'All time', days: null },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '30', label: 'Last 30 days', days: 30 },
];

/* Notice-period buckets for the donut chart, shortest (can join soonest) first.
   `color` reuses the same tag colours as the rest of the app. */
const NOTICE_BUCKETS = [
  { label: 'Immediate', color: 'var(--tag-green-fg)' },
  { label: '15 days', color: 'var(--tag-teal-fg)' },
  { label: '30 days', color: 'var(--tag-blue-fg)' },
  { label: '45 days', color: 'var(--tag-violet-fg)' },
  { label: '60 days', color: 'var(--tag-amber-fg)' },
  { label: '90 days', color: 'var(--tag-red-fg)' },
];

// Candidates whose notice period is this many days or fewer count as "ending soon".
const SOON_THRESHOLD_DAYS = 15;

// Small collapse/expand control used in every card's header (never on the
// KPI tiles) to shrink a card down to just its title row.
function CardTitle({ icon, children }) {
  return (
    <span className="ta-card__title-row">
      <span className="ta-card__title-icon"><Icon name={icon} size={14} /></span>
      {children}
    </span>
  );
}

function ExpandToggle({ expanded, onToggle, label }) {
  return (
    <button
      type="button"
      className="ta-expand-toggle"
      onClick={onToggle}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
    >
      <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
    </button>
  );
}

export default function TADashboard() {
  const navigate = useNavigate();
  const { jobs, profile } = useApp();
  const [period, setPeriod] = useState('all');
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [openPosExpanded, setOpenPosExpanded] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [interviewsExpanded, setInterviewsExpanded] = useState(true);
  const [pipelineExpanded, setPipelineExpanded] = useState(true);
  const [noticeExpanded, setNoticeExpanded] = useState(true);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [remote, setRemote] = useState({ apps: null, events: [] });
  const [upcomingInterviews, setUpcomingInterviews] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([listApplications(), listRecentEvents()])
        .then(([list, events]) => {
          if (cancelled) return;
          const apps = (list || []).map(applicationFromDb).map((a) => ({
            id: a.id,
            candidateId: a.id,
            status: a.status,
            submittedAt: a.submittedAt || a.createdAt,
            source: a.source === 'ta_link' ? 'Referral' : 'Direct',
            jobId: a.jobId,
            jobTitle: a.jobTitle,
            name: a.candidateName || `${a.personal?.firstName || ''} ${a.personal?.lastName || ''}`.trim(),
            email: a.candidateEmail,
            phone: a.candidatePhone,
            code: a.code,
            candidateCode: a.candidateCode,
            assignedTo: a.assignedTo,
            personal: a.personal || {},
            professional: a.professional || {},
          }));
          setRemote({ apps, events: events || [] });
        })
        .catch(() => !cancelled && setRemote({ apps: [], events: [] }));
    load();
    // Live refresh so a new application shows up without reloading (§49).
    const unsub = subscribeApplications(load);
    return () => { cancelled = true; unsub(); };
  }, []);

  useEffect(() => {
    listUpcomingInterviews(5).then(setUpcomingInterviews).catch(() => setUpcomingInterviews([]));
  }, []);

  // ----- DATA -----
  const apps = remote.apps || [];
  const interviews = []; // not built yet
  const offers = []; // not built yet
  const activities = remote.events.map((e) => ({
    id: e.id,
    applicationId: e.application_id,
    title: e.title,
    at: e.created_at,
    candidateId: e.application_id,
    who: `${e.applications?.candidates?.first_name || ''} ${e.applications?.candidates?.last_name || ''}`.trim() || 'Candidate',
  }));

  // Candidate-driven updates, newest first, resolved to a clickable candidate.
  // A candidate uploading several documents in one sitting fires one
  // "Document Uploaded" event per file — collapsed here into a single row
  // per candidate (newest wins) instead of flooding this list with repeats.
  const GROUPED_UPDATE_TITLES = new Set(['Document Uploaded', 'Document Not Provided']);
  const groupedRows = [];
  const groupedSeen = new Map(); // `${candidateId}:${title}` -> the kept row, for its count to grow
  for (const a of activities) {
    if (!CANDIDATE_UPDATE_TITLES.has(a.title)) continue;
    if (GROUPED_UPDATE_TITLES.has(a.title)) {
      const key = `${a.candidateId}:${a.title}`;
      const existing = groupedSeen.get(key);
      if (existing) { existing.count += 1; continue; }
      const row = { ...a, count: 1 };
      groupedSeen.set(key, row);
      groupedRows.push(row);
    } else {
      groupedRows.push({ ...a, count: 1 });
    }
  }
  const candidateUpdates = groupedRows.slice(0, 6);

  // ----- FILTERING -----
  // Applications inside the selected time period (used by the pipeline + source chart).
  const periodDays = PERIODS.find((p) => p.value === period)?.days;
  const periodApps = periodDays
    ? apps.filter((a) => new Date(a.submittedAt).getTime() >= Date.now() - periodDays * 86400000)
    : apps;

  // Applications still active in the pipeline (not rejected).
  const activeApps = periodApps.filter((a) => a.status !== APP_STATUS.REJECTED);

  // Active pipeline, all-time (not rejected, not already hired) — notice period only
  // matters for candidates we're still trying to bring onboard.
  const activeForNotice = apps.filter((a) => a.status !== APP_STATUS.REJECTED && a.status !== APP_STATUS.EMPLOYEE);

  // ----- CALCULATIONS -----
  const extendedOffers = offers.filter((o) =>
    [OFFER_STATUS.ISSUED, OFFER_STATUS.ACCEPTED, OFFER_STATUS.DECLINED].includes(o.status)
  );
  const jobsWithApplicants = jobs.filter((j) => apps.some((a) => a.jobId === j.id)).length;
  const interviewsDone = interviews.filter((i) => i.status !== ROUND_STATUS.SCHEDULED).length;
  const offersAccepted = offers.filter((o) => o.status === OFFER_STATUS.ACCEPTED).length;

  const scheduledInterviews = interviews.filter((i) => i.status === ROUND_STATUS.SCHEDULED).length;
  const kpis = [
    {
      tone: 'candidates', label: 'Total Candidates', value: apps.length,
      note: `${activeForNotice.length} still active in the pipeline`,
      onClick: () => navigate('/ta/candidates'),
    },
    {
      tone: 'jobs', label: 'Open Jobs', value: jobs.length,
      note: `${jobsWithApplicants} of ${jobs.length} receiving applicants`,
      onClick: () => navigate('/ta/jobs'),
    },
    {
      tone: 'interviews', label: 'Interviews Scheduled', value: scheduledInterviews,
      note: `${interviewsDone} completed so far`,
      onClick: () => navigate('/ta/candidates?stage=interview'),
    },
    {
      tone: 'offers', label: 'Offers Extended', value: extendedOffers.length,
      note: `${offersAccepted} accepted`,
      onClick: () => navigate('/ta/candidates?stage=offer'),
    },
  ];

  const stageRows = STAGES.map((s) => ({
    ...s,
    value: activeApps.filter((a) => stageIndexForStatus(a.status) >= s.reach).length,
  }));

  // Candidates who can join within SOON_THRESHOLD_DAYS — the ones a TA should reach out to now.
  const soonCount = activeForNotice.filter((a) => {
    const days = noticePeriodDays(a.professional?.noticePeriod);
    return days !== null && days <= SOON_THRESHOLD_DAYS;
  }).length;

  // ----- CHART DATA -----
  const sourceCounts = groupCounts(periodApps, (a) => a.source || 'Direct');
  const sourceSlices = sourceCounts.map((c) => ({ label: c.key, value: c.count, color: SOURCE_COLOR[c.key] || 'var(--viz-magenta)' }));

  // How many active candidates fall into each notice-period bucket — feeds the donut chart.
  const noticeCounts = groupCounts(activeForNotice, (a) => a.professional?.noticePeriod);
  const noticeCountByLabel = new Map(noticeCounts.map((c) => [c.key, c.count]));
  const noticeSlices = NOTICE_BUCKETS.map((b) => ({ label: b.label, color: b.color, value: noticeCountByLabel.get(b.label) || 0 }));

  // "Needs Attention" — real, but otherwise-buried signals pulled together
  // into one simple, actionable list: candidates stuck in screening too
  // long, candidates whose interview hasn't been scheduled yet, and
  // candidates nobody's responsible for.
  const STALE_REVIEW_DAYS = 3;
  const staleInReview = apps.filter((a) =>
    a.status === APP_STATUS.TA_REVIEW && Date.now() - new Date(a.submittedAt).getTime() > STALE_REVIEW_DAYS * DAY
  );
  const needsInterviewScheduled = apps.filter((a) => a.status === APP_STATUS.INTERVIEW_PLANNING);
  const unassigned = apps.filter((a) =>
    !a.assignedTo && ![APP_STATUS.REJECTED, APP_STATUS.EMPLOYEE, APP_STATUS.DRAFT].includes(a.status)
  );
  const activePipelineCount = apps.filter((a) => ![APP_STATUS.REJECTED, APP_STATUS.EMPLOYEE, APP_STATUS.DRAFT].includes(a.status)).length || 1;
  const attentionRows = [
    {
      key: 'stale', count: staleInReview.length, tone: 'red', icon: 'AlertTriangle',
      shortLabel: 'Stuck in Screening', label: `Sitting ${STALE_REVIEW_DAYS}+ days without a decision`,
      onClick: () => navigate('/ta/candidates?stage=screening'),
    },
    {
      key: 'interview', count: needsInterviewScheduled.length, tone: 'amber', icon: 'CalendarClock',
      shortLabel: 'Interview Not Scheduled', label: 'Approved, nothing booked yet',
      onClick: () => navigate('/ta/candidates?stage=interview'),
    },
    {
      key: 'unassigned', count: unassigned.length, tone: 'blue', icon: 'UserRoundCog',
      shortLabel: 'Unassigned Candidates', label: 'Active, with no TA assigned',
      onClick: () => navigate('/ta/candidates'),
    },
  ].filter((r) => r.count > 0).map((r) => ({ ...r, pct: Math.round((r.count / activePipelineCount) * 100) }));

  // Real numbers genuinely not shown anywhere else on the dashboard —
  // rejected count (the pipeline funnel only covers the "live" stages),
  // how many applications came in this week, and how long the
  // longest-waiting active candidate has been sitting in the pipeline.
  const ageInDays = (a) => (Date.now() - new Date(a.submittedAt).getTime()) / DAY;
  const pctChange = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100));

  const rejectedCount = apps.filter((a) => a.status === APP_STATUS.REJECTED).length;
  const rejectedThisWeek = apps.filter((a) => a.status === APP_STATUS.REJECTED && ageInDays(a) < 7).length;
  const rejectedLastWeek = apps.filter((a) => a.status === APP_STATUS.REJECTED && ageInDays(a) >= 7 && ageInDays(a) < 14).length;

  const newThisWeek = apps.filter((a) => ageInDays(a) < 7).length;
  const newLastWeek = apps.filter((a) => ageInDays(a) >= 7 && ageInDays(a) < 14).length;

  const activeWaitApps = apps.filter((a) => ![APP_STATUS.REJECTED, APP_STATUS.EMPLOYEE, APP_STATUS.DRAFT].includes(a.status));
  const longestWaitDays = activeWaitApps.length
    ? Math.max(...activeWaitApps.map((a) => Math.floor((Date.now() - new Date(a.submittedAt).getTime()) / DAY)))
    : 0;

  const totalApps = apps.length;
  const weekChangePct = pctChange(newThisWeek, newLastWeek);
  // This week's share of the last two weeks' volume — always a clean 0-100
  // ratio, unlike weekChangePct (which is unbounded and can't drive a ring).
  const weekSharePct = newThisWeek + newLastWeek > 0 ? Math.round((newThisWeek / (newThisWeek + newLastWeek)) * 100) : 50;

  // Last 7 days, oldest → newest, applications submitted per day.
  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - (6 - i));
    const dayEnd = new Date(dayStart.getTime() + DAY);
    return {
      label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      count: apps.filter((a) => {
        const t = new Date(a.submittedAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length,
    };
  });

  const analyticsStats = [
    {
      key: 'rejected', label: 'Rejected Applications', tone: 'red', pillTone: 'red', icon: 'XCircle',
      value: rejectedCount, changePct: pctChange(rejectedThisWeek, rejectedLastWeek),
    },
    {
      key: 'newweek', label: 'New Applications This Week', tone: 'blue', pillTone: 'green', icon: 'UserPlus',
      value: newThisWeek, changePct: weekChangePct,
    },
    {
      key: 'longestwait', label: 'Longest-Waiting Active Candidate', tone: 'amber', icon: 'Clock3',
      value: `${longestWaitDays}d`, changePct: null,
    },
  ];

  // Open Positions — real jobs, each with its real applicant count, busiest first.
  const openPositions = [...jobs]
    .map((j) => ({ ...j, applicantCount: apps.filter((a) => a.jobId === j.id).length }))
    .sort((a, b) => b.applicantCount - a.applicantCount)
    .slice(0, 5);

  // ----- JSX -----
  const periodSelect = (
    <div className="ta-period-pills" role="group" aria-label="Time period">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`ta-period-pill${p.value === period ? ' is-active' : ''}`}
          onClick={() => setPeriod(p.value)}
        >
          {p.value === 'all' ? 'All' : `${p.days}d`}
        </button>
      ))}
    </div>
  );

  if (remote.apps === null) return <SkeletonPage />;


  return (
    <>
      <TAHeader />

      <PipelineReminderPopup />

      <div className="ta-kpi-row">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            {...k}
            selected={selectedKpi === k.label}
            onClick={k.onClick && (() => { setSelectedKpi(k.label); k.onClick(); })}
          />
        ))}
      </div>

      <div className="ta-analytics-split" style={{ marginBottom: 16 }}>
        <RecruitmentAnalytics totalApps={totalApps} weekChangePct={weekChangePct} gaugePct={weekSharePct} trend={weeklyTrend} stats={analyticsStats} />
        <NeedsAttentionCard rows={attentionRows} />
      </div>

      <div className="ta-dash-3col">
        <Card
          title={<CardTitle icon="Briefcase">Open Positions</CardTitle>}
          className="ta-card--tint-blue"
          action={(
            <div className="ta-card__actions">
              <button className="ta-link" onClick={() => navigate('/ta/jobs')}>View all <Icon name="ArrowRight" size={13} /></button>
              <ExpandToggle expanded={openPosExpanded} onToggle={() => setOpenPosExpanded((e) => !e)} label="Open Positions" />
            </div>
          )}
        >
          {openPositions.length === 0 ? (
            <p className="ta-cell-mute">No open positions yet.</p>
          ) : (
            <div className={`ta-stack ta-collapsible${openPosExpanded ? '' : ' is-collapsed'}`} style={{ gap: 2 }}>
              {openPositions.map((j) => (
                <button key={j.id} type="button" className="ta-openpos-row" onClick={() => navigate(`/ta/jobs/${j.id}`)}>
                  <span className={`ta-openpos-row__icon ta-openpos-row__icon--${DEPT_TONE[j.department] || 'blue'}`}>
                    <Icon name="Briefcase" size={15} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="ta-cell-strong" style={{ display: 'block' }}>{j.title}</span>
                    <span className="ta-cell-sub">{j.department || 'General'}</span>
                  </span>
                  <span className="ta-openpos-row__count">{j.applicantCount}<br /><span className="ta-cell-sub">candidates</span></span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={<CardTitle icon="Globe">Candidates by Sources</CardTitle>}
          className="ta-card--tint-teal"
          action={(
            <div className="ta-card__actions">
              {periodSelect}
              <ExpandToggle expanded={sourcesExpanded} onToggle={() => setSourcesExpanded((e) => !e)} label="Candidates by Sources" />
            </div>
          )}
        >
          <div className={`ta-collapsible${sourcesExpanded ? '' : ' is-collapsed'}`}>
            {sourceSlices.length === 0 ? (
              <p className="ta-cell-mute">No applications in this period.</p>
            ) : (
              <ProgressBarList rows={sourceSlices} />
            )}
          </div>
        </Card>

        <Card
          title={<CardTitle icon="CalendarDays">Upcoming Interviews</CardTitle>}
          className="ta-card--tint-amber"
          action={(
            <div className="ta-card__actions">
              <button className="ta-link" onClick={() => navigate('/ta/candidates?stage=interview')}>View all <Icon name="ArrowRight" size={13} /></button>
              <ExpandToggle expanded={interviewsExpanded} onToggle={() => setInterviewsExpanded((e) => !e)} label="Upcoming Interviews" />
            </div>
          )}
        >
          {upcomingInterviews === null ? (
            <p className="ta-cell-mute">Loading…</p>
          ) : upcomingInterviews.length === 0 ? (
            <p className="ta-cell-mute">Nothing scheduled.</p>
          ) : (
            <div className={`ta-stack ta-collapsible${interviewsExpanded ? '' : ' is-collapsed'}`} style={{ gap: 2 }}>
              {upcomingInterviews.map((r) => {
                const name = `${r.applications?.candidates?.first_name || ''} ${r.applications?.candidates?.last_name || ''}`.trim() || 'Candidate';
                const when = new Date(r.scheduled_at);
                return (
                  <button key={r.id} type="button" className="ta-upcoming-row" onClick={() => navigate(`/ta/candidates/${r.application_id}`)}>
                    <span className="ta-upcoming-row__time">
                      {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`ta-avatar ta-avatar--${avatarToneOf(name)}`}>{initialsOf(name)}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="ta-cell-strong" style={{ display: 'block' }}>{name}</span>
                      <span className="ta-cell-sub">{r.applications?.jobs?.title || r.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {candidateUpdates.length > 0 && (
        <section className="ta-updates">
          <button type="button" className="ta-updates__head" onClick={() => setUpdatesOpen((v) => !v)} aria-expanded={updatesOpen}>
            <span className="ta-updates__lead">
              <strong>Candidate updates</strong>
              <span className="ta-updates__count">{candidateUpdates.length}</span>
            </span>
            <span className="ta-updates__toggle">
              <Icon name={updatesOpen ? 'ChevronUp' : 'ChevronDown'} size={16} />
            </span>
          </button>
          {updatesOpen && (
            <div className="ta-updates__list">
              {candidateUpdates.map((u) => (
                <button key={u.id} type="button" className="ta-updates__row" onClick={() => navigate(`/ta/candidates/${u.candidateId}`)}>
                  <span className="ta-updates__icon"><Icon name={UPDATE_ICON[u.title] || 'Bell'} size={14} /></span>
                  <span className="ta-updates__body">
                    <span className="ta-updates__title">
                      {u.who} — {u.count > 1 ? u.title.replace('Document', 'Documents') : u.title}
                      {u.count > 1 ? ` (${u.count})` : ''}
                    </span>
                    <span className="ta-cell-sub">{u.description}</span>
                  </span>
                  <span className="ta-updates__when">{timeAgo(u.at)} <Icon name="ArrowRight" size={13} /></span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="ta-bento">
        <Card
          title={<CardTitle icon="Route">Candidates Pipeline</CardTitle>}
          className="ta-card--tint-blue"
          action={(
            <div className="ta-card__actions">
              {periodSelect}
              <ExpandToggle expanded={pipelineExpanded} onToggle={() => setPipelineExpanded((e) => !e)} label="Candidates Pipeline" />
            </div>
          )}
        >
          <div className={`ta-collapsible${pipelineExpanded ? '' : ' is-collapsed'}`}>
            <PipelineBars
              stages={stageRows}
              onSegmentClick={(i) => navigate(`/ta/candidates?stage=${stageRows[i].key}`)}
            />
          </div>
        </Card>

        {/* Notice Period Analysis — one glance tells TA how many candidates
            are close to being free to join, so they know who to chase. */}
        <Card
          title={<CardTitle icon="Clock3">Notice Period Analysis</CardTitle>}
          className="ta-card--tint-green"
          action={(
            <div className="ta-card__actions">
              <button className="ta-link" onClick={() => navigate('/ta/candidates')}>View candidates <Icon name="ArrowRight" size={13} /></button>
              <ExpandToggle expanded={noticeExpanded} onToggle={() => setNoticeExpanded((e) => !e)} label="Notice Period Analysis" />
            </div>
          )}
        >
          {activeForNotice.length === 0 ? (
            <p className="ta-cell-mute">No active candidates to analyse.</p>
          ) : (
            <div className={`ta-collapsible${noticeExpanded ? '' : ' is-collapsed'}`}>
              {/* Donut chart: candidates grouped by their notice period length.
                  Clicking a slice/legend row jumps to the candidates table, pre-filtered to it. */}
              <DonutChart
                slices={noticeSlices}
                caption="Candidates"
                onSliceClick={(label) => navigate(`/ta/candidates?notice=${encodeURIComponent(label)}`)}
              />

              {/* Callout: how many can join soon, so TA knows to follow up now */}
              <button className="ta-notice-callout" onClick={() => navigate('/ta/candidates')}>
                <Icon name="CalendarClock" size={16} />
                <span>
                  <b>{soonCount}</b> candidate{soonCount === 1 ? '' : 's'} can join within {SOON_THRESHOLD_DAYS} days — reach out now
                </span>
              </button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
