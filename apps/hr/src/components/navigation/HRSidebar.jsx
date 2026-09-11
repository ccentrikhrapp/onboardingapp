import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';

const NAV = [
  { to: '/hr', label: 'Verification queue', icon: 'Home', end: true },
  { to: '/hr/onboarding', label: 'Onboarding', icon: 'ClipboardCheck' },
  { to: '/hr/settings', label: 'Settings', icon: 'Settings' },
];

export default function HRSidebar({ open, collapsed, onToggleCollapse, onNavigate }) {
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
        {NAV.map((item) => (
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
