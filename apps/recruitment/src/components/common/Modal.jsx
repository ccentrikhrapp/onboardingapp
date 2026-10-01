import { useEffect } from 'react';
import Icon from './Icon.jsx';
import Button from './Button.jsx';

export function Modal({ open, onClose, title, children, footer, size }) {
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
    <div className="overlay overlay--center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${size === 'lg' ? ' modal--lg' : ''}${size === 'xl' ? ' modal--xl' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay overlay--right" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`drawer${wide ? ' drawer--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer__header">
          <h3 className="drawer__title">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary' }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-secondary">{message}</p>
    </Modal>
  );
}
