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

/* Horizontal top navigation, per the HireOn reference — replaces the left
   sidebar. Same routes/links as the sidebar it replaces; only the
   orientation changed. */
export default function TATopNav() {
  const { role } = useApp();
  const nav = role === 'admin' || role === 'admin_ta' ? [...NAV, TEAMS_NAV] : NAV;
  return (
    <nav className="ta-topnav">
      <div className="ta-topnav__brand">
        <img className="ta-topnav__logo" src={logo} alt="Ccentrik" />
        <span className="ta-topnav__name">Ccentrik</span>
      </div>
      <div className="ta-topnav__links">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `ta-topnav__link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
