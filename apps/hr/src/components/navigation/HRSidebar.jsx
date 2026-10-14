import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { listVerifications } from '../../api/verification.js';
import { listOnboardingCases } from '../../api/onboarding.js';
import { listOnboardingTasks } from '../../api/onboardingTasks.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ACTIVE_ONBOARDING = new Set(['onboarding_initiated', 'documents_pending', 'documents_submitted', 'verification_in_progress', 'formalities_pending']);

export default function HRSidebar({ open, collapsed, onToggleCollapse, onNavigate }) {
  const { role } = useAuth();
  const [counts, setCounts] = useState({ verification: 0, onboarding: 0, requests: 0 });

  const isHrStaff = role === 'admin' || role === 'hr';
  const isSuperAdmin = role === 'admin';
  const isDeveloper = role === 'developer';

  useEffect(() => {
    if (!isHrStaff) return;
    Promise.all([listVerifications(), listOnboardingCases()])
      .then(([verifications, cases]) => {
        setCounts((c) => ({
          ...c,
          verification: (verifications || []).filter((v) => ['pending', 'under_review'].includes(v.status)).length,
          onboarding: (cases || []).filter((c2) => ACTIVE_ONBOARDING.has(c2.status)).length,
        }));
      })
      .catch(() => {});
  }, [isHrStaff]);

  // A Super Admin's own in-app signal that an organisational account
  // request is waiting on them — email can fail to arrive (spam filters,
  // a sender's connected account not set up yet), so this doesn't depend
  // on it: it's a direct read of the same task row the email is about.
  useEffect(() => {
    if (!isSuperAdmin) return;
    listOnboardingTasks()
      .then((tasks) => setCounts((c) => ({ ...c, requests: (tasks || []).filter((t) => t.key === 'email_setup' && t.status === 'in_progress').length })))
      .catch(() => {});
  }, [isSuperAdmin]);

  // Accounts/IT/Office Admin only have their own assigned tasks and their
  // profile in this app — not the rest of the HR workflow.
  //
  // "Account requests" used to be its own nav entry here (an alias to the
  // same /hr/tasks page every non-staff role's "My onboarding tasks" uses),
  // which meant account-request activity lived in a second, disconnected
  // place from the Activity feed. It's now a category inside Activity
  // itself (see HRActivityPage's "Account requests" tile/filter) — the
  // Super Admin's in-app "something's waiting on you" signal moves with it
  // onto the Activity link rather than disappearing.
  // Developer gets its own, deliberately short branch — Team (their own
  // scope only, enforced server-side) and Profile, nothing from the real HR
  // workflow. Not folded into the isHrStaff/else split above so a future
  // edit to that logic can't accidentally widen what Developer sees.
  const nav = isDeveloper ? [
    { to: '/hr/team', label: 'Team', icon: 'ShieldCheck', end: true },
    { to: '/hr/profile', label: 'Profile', icon: 'UserRound' },
  ] : isHrStaff ? [
    { to: '/hr', label: 'Dashboard', icon: 'Home', end: true },
    { to: '/hr/verification', label: 'Verification queue', icon: 'FileSearch', count: counts.verification },
    { to: '/hr/candidates', label: 'Candidates', icon: 'ClipboardCheck', count: counts.onboarding },
    { to: '/hr/employees', label: 'Employees', icon: 'UserRoundCheck' },
    { to: '/hr/activity', label: 'Activity', icon: 'History', count: isSuperAdmin ? counts.requests : 0 },
    ...(isSuperAdmin ? [{ to: '/hr/team', label: 'Teams', icon: 'ShieldCheck' }] : []),
    { to: '/hr/settings', label: 'Settings', icon: 'Settings' },
  ] : [
    { to: '/hr/tasks', label: 'My onboarding tasks', icon: 'ListChecks', end: true },
    { to: '/hr/profile', label: 'Profile', icon: 'UserRound' },
  ];

  return (
    <aside className={`hr-sidebar${open ? ' hr-sidebar--open' : ''}`}>
      <button
        className="hr-collapse-btn"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={14} />
      </button>

      <div className="hr-brand">
        <img className="hr-brand__logo" src={logo} alt="Ccentrik" />
        <span className="hr-brand__badge" aria-hidden="true">C</span>
        <span className="hr-brand__text">
          <span className="hr-brand__sub">HR Portal</span>
        </span>
      </div>

      {isDeveloper && (
        <div className="hr-devmode" title="Developer Mode — test data only, no production access">
          <Icon name="ShieldCheck" size={13} />
          <span>
            <strong>Developer Mode</strong>
            <small>Test data only</small>
          </span>
        </div>
      )}

      <nav className="hr-nav">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `hr-nav__link${isActive ? ' active' : ''}`}
            onClick={onNavigate}
            title={item.label}
          >
            <Icon name={item.icon} size={19} />
            <span className="hr-nav__label">{item.label}</span>
            {!!item.count && <span className="hr-nav__count">{item.count}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="hr-sidebar__spacer" />

      <a className="hr-help" href="mailto:support@ccentrik.app" title="Visit our Help Center">
        <span className="hr-help__icon"><Icon name="LifeBuoy" size={16} /></span>
        <span className="hr-help__text">
          <span className="hr-help__title">Need help?</span>
          <span className="hr-help__sub">Visit our Help Center</span>
        </span>
      </a>
    </aside>
  );
}
