import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { uid } from '../utils/ids.js';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'success') => {
      const id = uid('toast');
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      toast: {
        success: (m) => push(m, 'success'),
        error: (m) => push(m, 'error'),
        warning: (m) => push(m, 'warning'),
        info: (m) => push(m, 'info'),
      },
    }),
    [toasts, dismiss, push]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

export function useToastList() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastList must be used within ToastProvider');
  return { toasts: ctx.toasts, dismiss: ctx.dismiss };
}
