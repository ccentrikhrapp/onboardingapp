import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import HRUniversalSearch from '../../components/hr/HRUniversalSearch.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Icon from '../../components/common/Icon.jsx';
import { WorkListGroup as WorkGroup, WorkListRow as WorkRow } from '../../components/kit/WorkList.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { listVerifications } from '../../api/verification.js';
import { listOnboardingCases, listEmployees } from '../../api/onboarding.js';
import { listOnboardingTasks } from '../../api/onboardingTasks.js';
import { listUpcomingHrInterviews } from '../../api/interviews.js';
import { statusMeta } from '../../constants/statuses.js';
import { timeAgo, formatDateTime } from '../../utils/format.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const ACTIVE_ONBOARDING = new Set(['onboarding_initiated', 'documents_pending', 'documents_submitted', 'verification_in_progress', 'formalities_pending']);

export default function HRDashboard() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const [remote, setRemote] = useState({ loading: true, verifications: [], cases: [], employees: [] });
  const [pendingRequests, setPendingRequests] = useState(0);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listVerifications(), listOnboardingCases(), listEmployees()])
      .then(([verifications, cases, employees]) => {
        if (!cancelled) setRemote({ loading: false, verifications: verifications || [], cases: cases || [], employees: employees || [] });
      })
      .catch(() => !cancelled && setRemote({ loading: false, verifications: [], cases: [], employees: [] }));
    return () => { cancelled = true; };
  }, []);

  // The candidate's real, currently-scheduled HR interview — handed off by
  // the TA portal the moment it's scheduled, kept live on reschedule. Past
  // meetings fall out of view on their own (time has already moved on).
  useEffect(() => {
    let cancelled = false;
    listUpcomingHrInterviews()
      .then((rows) => !cancelled && setUpcomingInterviews((rows || []).filter((r) => new Date(r.scheduled_at) > new Date())))
      .catch(() => !cancelled && setUpcomingInterviews([]));
    return () => { cancelled = true; };
  }, []);

  // A Super Admin's own in-app signal that an organisational account
  // request is waiting — doesn't depend on the request email actually
  // arriving (spam filters, a sender's account not connected yet): it's a
  // direct read of the same task row the email is about.
  useEffect(() => {
    if (role !== 'admin') return undefined;
    let cancelled = false;
    listOnboardingTasks()
      .then((tasks) => !cancelled && setPendingRequests((tasks || []).filter((t) => t.key === 'email_setup' && t.status === 'in_progress').length))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [role]);

  if (remote.loading) return <SkeletonPage />;

  const { verifications, cases, employees } = remote;
  const awaitingReview = verifications.filter((v) => ['pending', 'under_review'].includes(v.status));
  const activeOnboarding = cases.filter((c) => ACTIVE_ONBOARDING.has(c.status));
  const readyForJoining = cases.filter((c) => c.status === 'ready_for_joining' || c.status === 'joining_confirmed');
  const now = new Date();
  const joinedThisMonth = employees.filter((e) => {
    if (!e.joining_date) return false;
    const d = new Date(e.joining_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const recentCases = [...cases].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6);

  const nothingUrgent = pendingRequests === 0 && awaitingReview.length === 0 && readyForJoining.length === 0;

  return (
    <>
      <HRHeader
        title="Today"
        subtitle={`${profile?.full_name || profile?.email || ''} · ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        search={<HRUniversalSearch cases={cases} employees={employees} />}
      />

      <WorkGroup title="Needs you now" countTone={nothingUrgent ? undefined : 'attn'} count={nothingUrgent ? null : pendingRequests + awaitingReview.length + readyForJoining.length}>
        {nothingUrgent ? (
          <p className="hr-cell-mute">Nothing urgent — the queues below are clear.</p>
        ) : (
          <div className="hr-pipe">
            {role === 'admin' && pendingRequests > 0 && (
              <WorkRow
                onClick={() => navigate('/hr/activity', { state: { type: 'account_requests' } })}
                lead={`${pendingRequests} organisational account request${pendingRequests > 1 ? 's' : ''}`}
                sub="waiting on Super Admin"
                tag={<Tag tone="red">Action</Tag>}
              />
            )}
            {awaitingReview.slice(0, 5).map((v) => (
              <WorkRow
                key={v.id}
                onClick={() => navigate(`/hr/applications/${v.source_application_id}`)}
                lead={v.candidate_name || 'Candidate'}
                sub={`${v.requirement_name} · ${v.job_title}`}
                tag={<Tag tone="amber">{timeAgo(v.created_at)}</Tag>}
              />
            ))}
            {awaitingReview.length > 5 && (
              <WorkRow onClick={() => navigate('/hr/verification')} lead={`${awaitingReview.length - 5} more document${awaitingReview.length - 5 === 1 ? '' : 's'} awaiting review`} trail={<Icon name="ArrowRight" size={15} />} />
            )}
            {readyForJoining.slice(0, 5).map((c) => (
              <WorkRow
                key={c.id}
                onClick={() => navigate(`/hr/candidates/${c.id}`)}
                lead={c.candidate_name}
                sub={`${c.job_title} · ready for joining`}
                tag={<Tag tone="blue">Ready</Tag>}
              />
            ))}
          </div>
        )}
      </WorkGroup>

      {upcomingInterviews.length > 0 && (
        <WorkGroup title="Upcoming HR interviews" count={upcomingInterviews.length}>
          <div className="hr-stack">
            {upcomingInterviews.slice(0, 5).map((it) => (
              <div className="hr-docrow" key={it.id}>
                <span className="hr-docrow__icon"><Icon name="CalendarClock" size={16} /></span>
                <div className="grow">
                  <div className="hr-cell-strong">{it.candidate_name}{it.job_title ? ` — ${it.job_title}` : ''}</div>
                  <div className="hr-cell-sub">
                    {formatDateTime(it.scheduled_at)}
                    {it.meeting_type === 'virtual' && it.meeting_platform ? ` · ${it.meeting_platform === 'teams' ? 'Microsoft Teams' : 'Google Meet'}` : it.location ? ` · ${it.location}` : ''}
                    {it.recruiter_name ? ` · Recruiter: ${it.recruiter_name}` : ''}
                  </div>
                </div>
                <Tag tone={it.status === 'rescheduled' ? 'amber' : 'blue'}>{it.status === 'rescheduled' ? 'Rescheduled' : 'Scheduled'}</Tag>
                {it.meeting_url && (
                  <a className="hr-link" href={it.meeting_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', flexShrink: 0 }}>
                    Join <Icon name="ArrowRight" size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </WorkGroup>
      )}

      <WorkGroup
        title="In motion"
        count={activeOnboarding.length}
        empty="No one is currently in onboarding."
      >
        {recentCases.length > 0 && (
          <div className="hr-pipe">
            {recentCases.map((c) => {
              const meta = statusMeta(c.status);
              return (
                <WorkRow
                  key={c.id}
                  onClick={() => navigate(`/hr/candidates/${c.id}`)}
                  lead={c.candidate_name}
                  sub={`${c.job_title}${c.department ? ` · ${c.department}` : ''}`}
                  tag={<Tag tone={meta.tone}>{meta.label}</Tag>}
                />
              );
            })}
          </div>
        )}
        <button className="hr-link" style={{ marginTop: 10 }} onClick={() => navigate('/hr/candidates')}>View all candidates</button>
      </WorkGroup>

      <p className="hr-worklist-foot">
        <strong>{employees.length}</strong> employees on record · <strong>{joinedThisMonth}</strong> joined this month ·{' '}
        <button className="hr-link" onClick={() => navigate('/hr/employees')}>view roster</button>
      </p>
    </>
  );
}
