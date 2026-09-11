import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

/* Top-right account button. HR has one role in this app, so there's no role
   switcher here — just profile links and sign out. */
export default function ProfileMenu({ links = [] }) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const name = profile?.full_name || profile?.email || 'HR Account';
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
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = (to) => { setOpen(false); navigate(to); };
  const doSignOut = async () => { setOpen(false); await signOut(); navigate('/'); };

  return (
    <div className="hr-profilemenu" ref={ref}>
      <button type="button" className="hr-profilemenu__btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={name}>
        <span className="hr-avatar-sq">{initials}</span>
        <span className="hr-profilemenu__who">
          <span className="hr-profilemenu__name">{name}</span>
          <span className="hr-profilemenu__role">HR</span>
        </span>
        <Icon name="ChevronDown" size={14} />
      </button>

      {open && (
        <div className="hr-profilemenu__panel" role="menu">
          {links.map((l) => (
            <button key={l.to} type="button" className="hr-profilemenu__item" onClick={() => go(l.to)} role="menuitem">
              <Icon name={l.icon} size={15} /> {l.label}
            </button>
          ))}
          <div className="hr-profilemenu__sep" />
          <button type="button" className="hr-profilemenu__item" onClick={doSignOut} role="menuitem">
            <Icon name="LogOut" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
