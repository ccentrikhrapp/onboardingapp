import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { listVerifications } from '../../api/verification.js';
import { listOnboardingCases } from '../../api/onboarding.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ACTIVE_ONBOARDING = new Set(['onboarding_initiated', 'documents_pending', 'documents_submitted', 'verification_in_progress', 'formalities_pending']);

export default function HRSidebar({ open, collapsed, onToggleCollapse, onNavigate }) {
  const { role } = useAuth();
  const [counts, setCounts] = useState({ verification: 0, onboarding: 0 });

  useEffect(() => {
    Promise.all([listVerifications(), listOnboardingCases()])
      .then(([verifications, cases]) => {
        setCounts({
          verification: (verifications || []).filter((v) => ['pending', 'under_review'].includes(v.status)).length,
          onboarding: (cases || []).filter((c) => ACTIVE_ONBOARDING.has(c.status)).length,
        });
      })
      .catch(() => {});
  }, []);

  const nav = [
    { to: '/hr', label: 'Dashboard', icon: 'Home', end: true },
    { to: '/hr/verification', label: 'Verification queue', icon: 'FileSearch', count: counts.verification },
    { to: '/hr/candidates', label: 'Candidates', icon: 'ClipboardCheck', count: counts.onboarding },
    { to: '/hr/employees', label: 'Employees', icon: 'UserRoundCheck' },
    { to: '/hr/activity', label: 'Activity', icon: 'History' },
    ...(role === 'admin' ? [{ to: '/hr/team', label: 'Teams', icon: 'ShieldCheck' }] : []),
    { to: '/hr/settings', label: 'Settings', icon: 'Settings' },
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
