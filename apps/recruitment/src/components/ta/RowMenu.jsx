import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon.jsx';

/* Compact "⋯ More" menu for secondary row actions — keeps a table row down
   to one obviously-primary action (e.g. a trailing chevron to open the
   record) instead of a line of equally-weighted icon buttons. */
export default function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!items.length) return null;
  return (
    <span className="ta-rowmenu" ref={ref}>
      <button type="button" className="ta-rowmenu__btn" aria-haspopup="menu" aria-expanded={open} title="More actions" onClick={() => setOpen((v) => !v)}>
        <Icon name="MoreHorizontal" size={15} />
      </button>
      {open && (
        <span className="ta-rowmenu__panel" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`ta-rowmenu__item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={14} />} {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
