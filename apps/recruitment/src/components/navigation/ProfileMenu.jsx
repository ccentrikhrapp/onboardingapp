import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';

/* Top-right account button — used on both the TA topbar and the candidate
   header, each rendered under its OWN auth context. It never reads auth state
   itself (that was the exact bug: a shared context meant this menu — and its
   Sign out — silently acted on whichever identity happened to be signed in
   anywhere in the app). The identity and sign-out action are passed in by
   whichever layout renders it, so a TA's session can never leak into the
   candidate header's menu or vice versa. */
export default function ProfileMenu({ name, roleLabel, links = [], onSignOut, afterSignOut = '/' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const display = name || 'Account';
  const initials = display
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
    await onSignOut();
    navigate(afterSignOut, { replace: true });
  };

  return (
    <div className="profilemenu" ref={ref}>
      <button
        type="button"
        className="profilemenu__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={display}
      >
        <span className="ta-avatar-sq">{initials}</span>
        <span className="profilemenu__who">
          <span className="profilemenu__name">{display}</span>
          <span className="profilemenu__role">{roleLabel}</span>
        </span>
        <Icon name="ChevronDown" size={14} />
      </button>

      {open && (
        <div className="profilemenu__panel" role="menu">
          <div className="profilemenu__head">
            <span className="ta-avatar-sq">{initials}</span>
            <span className="profilemenu__id">
              <strong>{display}</strong>
              <span>{roleLabel}</span>
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
