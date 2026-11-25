import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { useApp } from '../../context/AppContext.jsx';
import { ROLE_META } from '../../constants/roles.js';

const NAV = [
  { to: '/ta', label: 'Dashboard', icon: 'Home', end: true },
  { to: '/ta/pipeline', label: 'Pipeline', icon: 'UsersRound' },
  { to: '/ta/candidates', label: 'Candidates', icon: 'Users' },
  { to: '/ta/jobs', label: 'Jobs', icon: 'Briefcase' },
];
const TEAMS_NAV = { to: '/ta/team', label: 'Teams', icon: 'ShieldCheck' };

/* Horizontal top nav (Sakrome reference) — replaces the left sidebar. Page
   title / back-link / search still render one row below, via TATopbar +
   TAHeader (unchanged, so every page keeps working exactly as before). */
export default function TATopNav2() {
  const { role, profile, signOut } = useApp();
  const isAdminTier = role === 'admin' || role === 'admin_ta';
  const name = profile?.full_name || profile?.email || 'Account';
  const roleLabel = ROLE_META[role]?.label || 'Talent Acquisition';
  const nav = isAdminTier ? [...NAV, TEAMS_NAV] : NAV;

  return (
    <header className="ta-topnav2">
      <div className="ta-topnav2__brand">
        <img src={logo} alt="Ccentrik" className="ta-topnav2__logo" />
      </div>

      <nav className="ta-topnav2__nav">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `ta-topnav2__link${isActive ? ' active' : ''}`}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ta-topnav2__tools">
        <NavLink to="/ta/settings" className="ta-iconbtn" aria-label="Settings"><Icon name="Settings" size={17} /></NavLink>
        <NotificationBell variant="ta" />
        <ProfileMenu
          name={name}
          roleLabel={roleLabel}
          links={[{ label: 'Profile & settings', icon: 'Settings', to: '/ta/settings' }]}
          onSignOut={signOut}
          afterSignOut="/ta/login"
        />
      </div>
    </header>
  );
}
