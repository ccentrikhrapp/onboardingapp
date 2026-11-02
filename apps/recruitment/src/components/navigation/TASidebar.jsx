import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { useApp } from '../../context/AppContext.jsx';

const NAV = [
  { to: '/ta', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/ta/pipeline', label: 'Pipeline Candidates', icon: 'UsersRound' },
  { to: '/ta/candidates', label: 'Job Candidates', icon: 'UserRoundCheck' },
  { to: '/ta/jobs', label: 'Jobs', icon: 'Briefcase' },
];
// TA user management (invite/role/activate) is Super Admin only — an Admin
// TA has full pipeline oversight but not TA-account authority (§33-35, §74).
const TEAMS_NAV = { to: '/ta/team', label: 'Teams', icon: 'ShieldCheck' };
// Super Admin only — the database enforces it too (RLS on document_requirements).

/* Icon-only rail, per the reference design — no text labels (tooltips via
   `title` carry the names instead). Every link/route here is unchanged
   from the labeled sidebar this replaces; only the presentation shrank. */
export default function TASidebar({ open, collapsed, onToggleCollapse, onNavigate }) {
  const { role } = useApp();
  const nav = role === 'admin' || role === 'admin_ta' ? [...NAV, TEAMS_NAV] : NAV;
  return (
    <aside className={`ta-sidebar${open ? ' ta-sidebar--open' : ''}`}>
      <div className="ta-brand">
        <img className="ta-brand__logo" src={logo} alt="Ccentrik" />
        <button
          className="ta-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={13} />
        </button>
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

      <a className="ta-nav__link" href="mailto:support@ccentrik.app" title="Need help? Visit our Help Center">
        <Icon name="LifeBuoy" size={19} />
        <span className="ta-nav__label">Need help?</span>
      </a>
      <NavLink to="/ta/settings" className={({ isActive }) => `ta-nav__link${isActive ? ' active' : ''}`} title="Profile & settings">
        <Icon name="Settings" size={19} />
        <span className="ta-nav__label">Settings</span>
      </NavLink>
    </aside>
  );
}
