import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { useApp } from '../../context/AppContext.jsx';

const NAV = [
  { to: '/ta', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/ta/jobs', label: 'Jobs', icon: 'Briefcase' },
  { to: '/ta/candidates', label: 'Candidates', icon: 'UsersRound' },
  { to: '/ta/pipeline', label: 'Pipeline', icon: 'UserRoundCheck' },
  { to: '/ta/settings', label: 'Settings', icon: 'Settings' },
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
        <span className="ta-brand__badge"><img className="ta-brand__logo" src={logo} alt="" /></span>
        <span className="ta-brand__text">
          <span className="ta-brand__name">Ccentrik</span>
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

      <a className="ta-sidebar__help" href="mailto:support@ccentrik.app">
        <span>Need Help?</span>
        <span className="ta-sidebar__help-sub">Open our help center</span>
      </a>
    </aside>
  );
}
