import Icon from './Icon.jsx';
import { useToastList } from '../../context/ToastContext.jsx';

const ICONS = {
  success: 'CheckCircle2',
  error: 'XCircle',
  warning: 'AlertTriangle',
  info: 'Info',
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToastList();
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role="status">
          <span className="toast__icon">
            <Icon name={ICONS[t.tone] || 'Info'} size={18} />
          </span>
          <span className="grow">{t.message}</span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="X" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
