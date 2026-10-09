import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

/* No modal existed anywhere in this app before — every other screen is a
   full page or an inline panel. Built to match hr.css's own tokens rather
   than pulling in a second design system.

   Rendered via a portal to document.body rather than in place: .hr-main
   (the scrollable content column every page renders inside) sets
   overflow-x: hidden, and per the CSS overflow spec that forces its other
   axis to a non-visible value too — which most browsers then also treat as
   a clipping box for position:fixed descendants, even though fixed is
   defined to be positioned against the viewport. Without the portal, this
   modal would render clipped to (and only correctly placed within) however
   much of .hr-main happened to be in its unscrolled layout position,
   instead of centered over the actual viewport the person is looking at. */
export function Modal({ open, onClose, title, children, size }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="hr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`hr-modal${size === 'xl' ? ' hr-modal--xl' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="hr-modal__header">
          <h3 className="hr-modal__title">{title}</h3>
          <button className="hr-modal__close" onClick={onClose} aria-label="Close">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="hr-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
