import { useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import logo from '../../assets/ccentrik-logo.png';
import { useApp } from '../../context/AppContext.jsx';
import { ROLE_META } from '../../constants/roles.js';

const NAV = [
  { to: '/ta', label: 'Dashboard', end: true },
  { to: '/ta/candidates', label: 'Candidates' },
  { to: '/ta/jobs', label: 'Jobs' },
  { to: '/ta/pipeline', label: 'Pipeline' },
];
const TEAMS_NAV = { to: '/ta/team', label: 'Teams' };

/* Fixed, floating, rounded top navbar — replaces the left sidebar
   entirely, stays on screen while the page scrolls. */
export default function TATopNav3() {
  const navigate = useNavigate();
  const { role, profile, signOut } = useApp();
  const isAdminTier = role === 'admin' || role === 'admin_ta';
  const name = profile?.full_name || profile?.email || 'Account';
  const roleLabel = ROLE_META[role]?.label || 'Talent Acquisition';
  const nav = isAdminTier ? [...NAV, TEAMS_NAV] : NAV;

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) {
      navigate(`/ta/candidates?q=${encodeURIComponent(q.trim())}`);
      setSearchOpen(false);
      setQ('');
    }
  };

  return (
    <header className="ta-topnav3">
      <img className="ta-topnav3__logo" src={logo} alt="Ccentrik" />

      {!searchOpen && (
        <nav className="ta-topnav3__pills">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `ta-topnav3__pill${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

      {searchOpen && (
        <form className="ta-topnav3__searchbar" onSubmit={submit}>
          <Icon name="Search" size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search candidates, jobs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => !q && setSearchOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
          />
        </form>
      )}

      <div className="ta-topnav3__tools">
        {!searchOpen && (
          <button type="button" className="ta-topnav3__iconbtn" onClick={openSearch} aria-label="Search">
            <Icon name="Search" size={16} />
          </button>
        )}
        <NavLink to="/ta/settings" className="ta-topnav3__icon">Settings</NavLink>
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
