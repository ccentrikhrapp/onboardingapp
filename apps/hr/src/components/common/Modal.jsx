import { useEffect } from 'react';
import Icon from './Icon.jsx';

/* No modal existed anywhere in this app before — every other screen is a
   full page or an inline panel. Built to match hr.css's own tokens rather
   than pulling in a second design system. */
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
  return (
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
    </div>
  );
}
