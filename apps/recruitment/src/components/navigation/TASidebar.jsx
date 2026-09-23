import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { useApp } from '../../context/AppContext.jsx';

const NAV = [
  { to: '/ta', label: 'Dashboard', icon: 'Home', end: true },
  { to: '/ta/candidates', label: 'Candidates', icon: 'Users' },
  { to: '/ta/jobs', label: 'Jobs', icon: 'Briefcase' },
];
// TA user management (invite/role/activate) is Super Admin only — an Admin
// TA has full pipeline oversight but not TA-account authority (§33-35, §74).
const TEAMS_NAV = { to: '/ta/team', label: 'Teams', icon: 'ShieldCheck' };

export default function TASidebar({ open, collapsed, onToggleCollapse, onNavigate }) {
  const { role } = useApp();
  const nav = role === 'admin' || role === 'admin_ta' ? [...NAV, TEAMS_NAV] : NAV;
  return (
    <aside className={`ta-sidebar${open ? ' ta-sidebar--open' : ''}`}>
      <button
        className="ta-collapse-btn"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={14} />
      </button>

      <div className="ta-brand">
        <img className="ta-brand__logo" src={logo} alt="Ccentrik" />
        <span className="ta-brand__badge" aria-hidden="true">C</span>
        <span className="ta-brand__text">
          <span className="ta-brand__sub">TA Portal</span>
        </span>
      </div>

      <nav className="ta-nav">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `ta-nav__link${isActive ? ' active' : ''}`}
            onClick={onNavigate}
            title={item.label}
          >
            <Icon name={item.icon} size={19} />
            <span className="ta-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="ta-sidebar__spacer" />

      <a className="ta-help" href="mailto:support@ccentrik.app" title="Visit our Help Center">
        <span className="ta-help__icon"><Icon name="LifeBuoy" size={16} /></span>
        <span className="ta-help__text">
          <span className="ta-help__title">Need help?</span>
          <span className="ta-help__sub">Visit our Help Center</span>
        </span>
      </a>
    </aside>
  );
}
