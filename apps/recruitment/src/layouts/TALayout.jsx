import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import TASidebar from '../components/navigation/TASidebar.jsx';
import TATopbar from '../components/navigation/TATopbar.jsx';
import Icon from '../components/common/Icon.jsx';
import ConnectGoogleBanner from '../components/auth/ConnectGoogleBanner.jsx';

const BOTTOM_NAV = [
  { to: '/ta', label: 'Dashboard', icon: 'Home', end: true },
  { to: '/ta/pipeline', label: 'Pipeline', icon: 'UsersRound' },
  { to: '/ta/candidates', label: 'Job Candidates', icon: 'Users' },
  { to: '/ta/jobs', label: 'Jobs', icon: 'Briefcase' },
];

const COLLAPSE_KEY = 'talentflow.ta.sidebar.collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

export default function TALayout() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [head, setHead] = useState(null);
  const { pathname } = useLocation();

  const ctx = useMemo(() => ({ setHead }), []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className={`ta-shell${collapsed ? ' ta-shell--collapsed' : ''}`}>
      <TASidebar
        open={open}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onNavigate={() => setOpen(false)}
      />
      {open && <div className="overlay" style={{ zIndex: 39 }} onClick={() => setOpen(false)} />}

      <div className="ta-main">
        <TATopbar head={head} onMenu={() => setOpen(true)} />
        <ConnectGoogleBanner needCalendar settingsPath="/ta/settings" />
        <div className="ta-page" key={pathname}>
          <Outlet context={ctx} />
        </div>
      </div>

      <nav className="ta-bottomnav">
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `ta-bottomnav__link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={19} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
