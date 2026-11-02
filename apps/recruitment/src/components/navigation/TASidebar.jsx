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

export default function TASidebar({ open, onNavigate }) {
  const { role } = useApp();
  const nav = role === 'admin' || role === 'admin_ta' ? [...NAV, TEAMS_NAV] : NAV;
  return (
    <aside className={`ta-sidebar${open ? ' ta-sidebar--open' : ''}`}>
      <div className="ta-brand">
        <img className="ta-brand__logo" src={logo} alt="Ccentrik" />
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
          >
            <Icon name={item.icon} size={18} />
            <span className="ta-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="ta-sidebar__spacer" />

      <a className="ta-nav__link" href="mailto:support@ccentrik.app">
        <Icon name="LifeBuoy" size={18} />
        <span className="ta-nav__label">Need help?</span>
      </a>
      <NavLink to="/ta/settings" className={({ isActive }) => `ta-nav__link${isActive ? ' active' : ''}`}>
        <Icon name="Settings" size={18} />
        <span className="ta-nav__label">Settings</span>
      </NavLink>
    </aside>
  );
}
