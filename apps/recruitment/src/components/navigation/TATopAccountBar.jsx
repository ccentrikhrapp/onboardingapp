import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { ROLE_META } from '../../constants/roles.js';

/* Light top account bar above the page-title row — search, notifications,
   profile. Sits alongside the dark left sidebar (Talent Blooming
   reference). The search jumps to the Job Candidates table pre-filtered
   to whatever was typed — real search, not a decorative box. */
export default function TATopAccountBar({ onMenu }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { profile, role, signOut } = useApp();
  const name = profile?.full_name || profile?.email || 'Account';
  const roleLabel = ROLE_META[role]?.label || 'Talent Acquisition';

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/ta/candidates?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="ta-acctbar">
      <button className="ta-iconbtn ta-menubtn" onClick={onMenu} aria-label="Open navigation">
        <Icon name="Menu" size={18} />
      </button>
      <form className="ta-acctbar__search" onSubmit={submit}>
        <Icon name="Search" size={16} />
        <input type="text" placeholder="Search for candidates, jobs…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="ta-acctbar__tools">
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
