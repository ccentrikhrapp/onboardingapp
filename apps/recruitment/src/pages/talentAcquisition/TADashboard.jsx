import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import KpiCard from '../../components/ta/KpiCard.jsx';
import DonutChart from '../../components/ta/DonutChart.jsx';
import FunnelChart from '../../components/ta/FunnelChart.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { listApplications, listRecentEvents, subscribeApplications } from '../../api/applications.js';
import { applicationFromDb } from '../../api/mappers.js';
import {
  APP_STATUS,
  ROUND_STATUS,
  OFFER_STATUS,
  stageIndexForStatus,
} from '../../constants/statuses.js';
import { countInWindow, trendPercent, groupCounts, noticePeriodDays } from '../../utils/metrics.js';
import { timeAgo } from '../../utils/format.js';
import PipelineReminderPopup from '../../components/ta/PipelineReminderPopup.jsx';
import UniversalSearch from '../../components/ta/UniversalSearch.jsx';
import { SkeletonPage } from '../../components/common/States.jsx';

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
  { label: 'Applied', icon: 'FileText', tone: 'blue', reach: 0, color: '#4b7bf7', key: 'applied' },
  { label: 'Screening', icon: 'Eye', tone: 'violet', reach: 1, color: '#8b7ff0', key: 'screening' },
  { label: 'Interview', icon: 'CalendarDays', tone: 'amber', reach: 2, color: '#f6a04a', key: 'interview' },
  { label: 'Offer', icon: 'FileCheck', tone: 'green', reach: 4, color: '#46c98a', key: 'offer' },
  { label: 'Hired', icon: 'UserRoundCheck', tone: 'green', reach: 5, color: '#a5ddc2', key: 'hired' },
];

const SOURCE_COLOR = {
  Direct: 'var(--viz-blue)',
  'Job Board': 'var(--viz-orange)',
  Referral: 'var(--viz-aqua)',
  Social: 'var(--viz-magenta)',
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

export default function TADashboard() {
  const navigate = useNavigate();
  const { jobs, profile } = useApp();
  const [period, setPeriod] = useState('all');
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [remote, setRemote] = useState({ apps: null, events: [] });

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
      icon: 'Users', label: 'Total Candidates', accent: 'blue', value: apps.length,
      meter: { value: activeForNotice.length, max: Math.max(1, apps.length) },
      trend: trendPercent(countInWindow(apps, 'submittedAt', 0), countInWindow(apps, 'submittedAt', 1)),
      note: `${activeForNotice.length} still active in the pipeline`,
      onClick: () => navigate('/ta/candidates'),
    },
    {
      icon: 'Briefcase', label: 'Open Jobs', accent: 'violet', value: jobs.length,
      meter: { value: jobsWithApplicants, max: Math.max(1, jobs.length) },
      note: `${jobsWithApplicants} of ${jobs.length} receiving applicants`,
      onClick: () => navigate('/ta/jobs'),
    },
    {
      icon: 'CalendarDays', label: 'Interviews Scheduled', accent: 'amber', value: scheduledInterviews,
      meter: { value: interviewsDone, max: Math.max(1, interviewsDone + scheduledInterviews) },
      trend: trendPercent(countInWindow(interviews, 'date', 0), countInWindow(interviews, 'date', 1)),
      note: `${interviewsDone} completed so far`,
      onClick: () => navigate('/ta/candidates?stage=interview'),
    },
    {
      icon: 'FileCheck', label: 'Offers Extended', accent: 'green', value: extendedOffers.length,
      meter: { value: offersAccepted, max: Math.max(1, extendedOffers.length) },
      trend: trendPercent(countInWindow(extendedOffers, 'createdAt', 0), countInWindow(extendedOffers, 'createdAt', 1)),
      note: `${offersAccepted} accepted`,
      onClick: () => navigate('/ta/candidates?stage=offer'),
    },
  ];

  const stageRows = STAGES.map((s) => ({
    ...s,
    value: activeApps.filter((a) => stageIndexForStatus(a.status) >= s.reach).length,
  }));
  const busiest = stageRows.reduce((top, s) => (s.value > top.value ? s : top), stageRows[0]);

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

  // ----- JSX -----
  const periodSelect = (
    <select className="ta-period" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Time period">
      {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  );

  if (remote.apps === null) return <SkeletonPage />;

  return (
    <>
      <TAHeader title="Dashboard" subtitle={`Welcome back, ${profile?.full_name || profile?.email || ''}`} />

      <UniversalSearch jobs={jobs} apps={apps} />
      <PipelineReminderPopup />

      <div className="ta-kpi-row">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
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
        <Card title="Candidates Pipeline" action={periodSelect}>
          <div className="ta-pipe-wrap">
            <div className="ta-pipe">
              {stageRows.map((s) => (
                <button
                  key={s.label}
                  className={`ta-pipe__row${s.label === busiest.label ? ' ta-pipe__row--active' : ''}`}
                  onClick={() => navigate(`/ta/candidates?stage=${s.key}`)}
                >
                  <span
                    className="ta-pipe__icon"
                    style={{ '--p-bg': `var(--tag-${s.tone}-bg)`, '--p-fg': `var(--tag-${s.tone}-fg)` }}
                  >
                    <Icon name={s.icon} size={15} />
                  </span>
                  <span className="ta-pipe__label">{s.label}</span>
                  <span className="ta-pipe__count">{s.value}</span>
                </button>
              ))}
            </div>
            <FunnelChart
              stages={stageRows}
              onSegmentClick={(i) => navigate(`/ta/candidates?stage=${stageRows[i].key}`)}
            />
          </div>
        </Card>

        <Card title="Applications Overview" action={periodSelect}>
          {sourceSlices.length === 0 ? (
            <p className="ta-cell-mute">No applications in this period.</p>
          ) : (
            <>
              <DonutChart
                slices={sourceSlices}
                caption="Total"
                onSliceClick={(label) => navigate(`/ta/candidates?source=${encodeURIComponent(label)}`)}
              />
              {(() => {
                const total = sourceSlices.reduce((s, x) => s + x.value, 0) || 1;
                const top = [...sourceSlices].sort((a, b) => b.value - a.value)[0];
                return (
                  <div className="ta-donut-note">
                    <span className="ta-legend__dot" style={{ background: top.color }} />
                    <span><strong>{top.label}</strong> is the leading channel — {Math.round((top.value / total) * 100)}% of applications in this period.</span>
                  </div>
                );
              })()}
            </>
          )}
        </Card>
      </div>

      {/* Notice Period Analysis — one glance tells TA how many candidates
          are close to being free to join, so they know who to chase. */}
      <Card
        title="Notice Period Analysis"
        action={<button className="ta-link" onClick={() => navigate('/ta/candidates')}>View candidates <Icon name="ArrowRight" size={13} /></button>}
      >
        {activeForNotice.length === 0 ? (
          <p className="ta-cell-mute">No active candidates to analyse.</p>
        ) : (
          <>
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
          </>
        )}
      </Card>
    </>
  );
}
