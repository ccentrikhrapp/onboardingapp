import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import KpiCard from '../../components/kit/KpiCard.jsx';
import DonutChart from '../../components/kit/DonutChart.jsx';
import LifecycleFunnel from '../../components/kit/LifecycleFunnel.jsx';
import Icon from '../../components/common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { listVerifications } from '../../api/verification.js';
import { listOnboardingCases, listEmployees } from '../../api/onboarding.js';
import { statusMeta } from '../../constants/statuses.js';
import { timeAgo } from '../../utils/format.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/kit/Skeleton.jsx';

const DEPT_COLORS = ['#4b7bf7', '#8b7ff0', '#f6a04a', '#46c98a', '#e5484d', '#f2b705'];
const ACTIVE_ONBOARDING = new Set(['onboarding_initiated', 'documents_pending', 'documents_submitted', 'verification_in_progress', 'formalities_pending']);

export default function HRDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [remote, setRemote] = useState({ loading: true, verifications: [], cases: [], employees: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listVerifications(), listOnboardingCases(), listEmployees()])
      .then(([verifications, cases, employees]) => {
        if (!cancelled) setRemote({ loading: false, verifications: verifications || [], cases: cases || [], employees: employees || [] });
      })
      .catch(() => !cancelled && setRemote({ loading: false, verifications: [], cases: [], employees: [] }));
    return () => { cancelled = true; };
  }, []);

  if (remote.loading) return <SkeletonPage />;

  const { verifications, cases, employees } = remote;
  const awaitingReview = verifications.filter((v) => ['pending', 'under_review'].includes(v.status));
  const correctionsOut = verifications.filter((v) => v.status === 'reupload_required');
  const activeOnboarding = cases.filter((c) => ACTIVE_ONBOARDING.has(c.status));
  const readyForJoining = cases.filter((c) => c.status === 'ready_for_joining' || c.status === 'joining_confirmed');
  const now = new Date();
  const joinedThisMonth = employees.filter((e) => {
    if (!e.joining_date) return false;
    const d = new Date(e.joining_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const kpis = [
    {
      icon: 'FileSearch', label: 'Awaiting Document Review', accent: 'amber', value: awaitingReview.length,
      meter: { value: awaitingReview.length, max: Math.max(1, verifications.length) },
      note: correctionsOut.length ? `${correctionsOut.length} sent back for correction` : 'pre-offer documents to review',
      onClick: () => navigate('/hr/verification'),
    },
    {
      icon: 'ClipboardCheck', label: 'Onboarding In Progress', accent: 'violet', value: activeOnboarding.length,
      meter: { value: activeOnboarding.length, max: Math.max(1, cases.length) },
      note: `${cases.length} case${cases.length === 1 ? '' : 's'} total`,
      onClick: () => navigate('/hr/candidates'),
    },
    {
      icon: 'CalendarCheck', label: 'Ready for Joining', accent: 'blue', value: readyForJoining.length,
      meter: { value: readyForJoining.length, max: Math.max(1, cases.length) },
      note: 'onboarding documents cleared',
      onClick: () => navigate('/hr/candidates'),
    },
    {
      icon: 'UserRoundCheck', label: 'Employees', accent: 'green', value: employees.length,
      meter: { value: employees.length, max: Math.max(1, cases.length) },
      note: `${joinedThisMonth} joined this month`,
      onClick: () => navigate('/hr/employees'),
    },
  ];

  const deptCounts = {};
  activeOnboarding.forEach((c) => {
    const dept = c.department || 'Unassigned';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const deptSlices = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }));

  const recentCases = [...cases].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6);

  // Lifecycle funnel — cases bucketed into 5 real phases, in the order they
  // actually move through. "Attention" flags whichever non-final phase is
  // holding the most cases right now (the bottleneck HR should clear next).
  const lcBase = cases.length || 1;
  const LC_BUCKETS = [
    { label: 'Initiated', statuses: ['onboarding_initiated'], to: '/hr/candidates' },
    { label: 'Documents', statuses: ['documents_pending', 'documents_submitted', 'verification_in_progress'], to: '/hr/candidates' },
    { label: 'Formalities', statuses: ['formalities_pending'], to: '/hr/candidates' },
    { label: 'Joining', statuses: ['ready_for_joining', 'joining_confirmed'], to: '/hr/candidates' },
    { label: 'Employee', statuses: ['employee_created', 'completed'], to: '/hr/employees' },
  ].map((b) => ({ ...b, count: cases.filter((c) => b.statuses.includes(c.status)).length }));
  const bottleneckIdx = LC_BUCKETS.slice(0, -1).reduce((best, b, i, arr) => (b.count > arr[best].count ? i : best), 0);
  const lifecycle = LC_BUCKETS.map((b, i) => ({
    label: b.label,
    count: b.count,
    pct: Math.round((b.count / lcBase) * 100),
    attention: i === bottleneckIdx && b.count > 0,
    onClick: () => navigate(b.to),
  }));

  return (
    <>
      <HRHeader title="Dashboard" subtitle={`Welcome back, ${profile?.full_name || profile?.email || ''}`} />

      <div className="hr-kpi-row">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="hr-bento">
        <Card
          title="Documents awaiting review"
          action={<button className="hr-link" onClick={() => navigate('/hr/verification')}>View all</button>}
          bodyStyle={{ justifyContent: 'flex-start' }}
        >
          {awaitingReview.length === 0 ? (
            <p className="hr-cell-mute">Nothing waiting on you — you're all caught up.</p>
          ) : (
            <div className="hr-pipe">
              {awaitingReview.slice(0, 6).map((v) => (
                <button
                  key={v.id}
                  className="hr-pipe__row"
                  onClick={() => navigate(`/hr/applications/${v.source_application_id}`)}
                >
                  <span className="hr-pipe__label">
                    {v.candidate_name || 'Candidate'}
                    <br />
                    <span className="hr-cell-sub">{v.requirement_name} · {v.job_title}</span>
                  </span>
                  <Tag tone="amber">{timeAgo(v.created_at)}</Tag>
                  <Icon name="ChevronRight" size={16} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Onboarding by department"
          action={<span className="hr-cell-sub">{activeOnboarding.length} in progress</span>}
        >
          {deptSlices.length === 0 ? (
            <p className="hr-cell-mute">No one is currently in onboarding.</p>
          ) : (
            <DonutChart slices={deptSlices} caption="onboarding" onSliceClick={() => navigate('/hr/candidates')} />
          )}
        </Card>
      </div>

      <Card title="Onboarding Lifecycle" action={<span className="hr-cell-sub">{cases.length} case{cases.length === 1 ? '' : 's'} total</span>}>
        {cases.length === 0 ? (
          <p className="hr-cell-mute">No onboarding cases yet.</p>
        ) : (
          <LifecycleFunnel stages={lifecycle} />
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card
        title="Recent onboarding activity"
        action={<button className="hr-link" onClick={() => navigate('/hr/candidates')}>View all</button>}
      >
        {recentCases.length === 0 ? (
          <p className="hr-cell-mute">No onboarding cases yet — they appear once a TA marks an offer accepted.</p>
        ) : (
          <div className="hr-pipe">
            {recentCases.map((c) => {
              const meta = statusMeta(c.status);
              return (
                <button key={c.id} className="hr-pipe__row" onClick={() => navigate(`/hr/candidates/${c.id}`)}>
                  <span className="hr-pipe__label">
                    {c.candidate_name}
                    <br />
                    <span className="hr-cell-sub">{c.job_title}{c.department ? ` · ${c.department}` : ''}</span>
                  </span>
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                  <Icon name="ChevronRight" size={16} />
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
