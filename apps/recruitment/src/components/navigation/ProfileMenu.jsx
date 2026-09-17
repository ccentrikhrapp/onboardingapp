import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import { useApp } from '../../context/AppContext.jsx';

const ROLE_TITLE = { candidate: 'Candidate', ta: 'Talent Acquisition', admin: 'Admin' };

/* Top-right account button shared by both portals. */
export default function ProfileMenu({ links = [] }) {
  const navigate = useNavigate();
  const { profile, role, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const name = profile?.full_name || profile?.email || 'Account';
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = (to) => { setOpen(false); navigate(to); };
  const doSignOut = async () => {
    setOpen(false);
    // Capture before signOut() clears the profile/role from context.
    const wasStaff = role === 'ta' || role === 'admin' || role === 'admin_ta';
    await signOut();
    navigate(wasStaff ? '/ta/login' : '/', { replace: true });
  };

  return (
    <div className="profilemenu" ref={ref}>
      <button
        type="button"
        className="profilemenu__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
      >
        <span className="ta-avatar-sq">{initials}</span>
        <span className="profilemenu__who">
          <span className="profilemenu__name">{name}</span>
          <span className="profilemenu__role">{ROLE_TITLE[role]}</span>
        </span>
        <Icon name="ChevronDown" size={14} />
      </button>

      {open && (
        <div className="profilemenu__panel" role="menu">
          <div className="profilemenu__head">
            <span className="ta-avatar-sq">{initials}</span>
            <span className="profilemenu__id">
              <strong>{name}</strong>
              <span>{ROLE_TITLE[role]}</span>
            </span>
          </div>

          {links.map((l) => (
            <button key={l.to} type="button" className="profilemenu__item" onClick={() => go(l.to)} role="menuitem">
              <Icon name={l.icon} size={15} /> {l.label}
            </button>
          ))}

          <div className="profilemenu__sep" />
          <button type="button" className="profilemenu__item" onClick={doSignOut} role="menuitem">
            <Icon name="LogOut" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
