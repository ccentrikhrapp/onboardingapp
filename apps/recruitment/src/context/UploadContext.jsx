import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useToast } from './ToastContext.jsx';

/* One place for "a file is uploading" feedback. While a task runs, a loader
   covers the page so the person can't click Upload again; it closes when the
   task succeeds or fails, and a notification says which. The task's own error
   is re-thrown so the screen can still show it next to the field. */
const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null); // label of the file being uploaded

  const run = useCallback(
    async (label, task) => {
      setBusy(label);
      try {
        const result = await task();
        toast.success(`${label} uploaded successfully.`);
        return result;
      } catch (err) {
        toast.error(`${label} upload failed${err?.message ? `: ${err.message}` : '. Please try again.'}`);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [toast]
  );

  const value = useMemo(() => ({ run, busy }), [run, busy]);

  return (
    <UploadContext.Provider value={value}>
      {children}
      {busy && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-busy="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
            background: 'rgba(15, 23, 42, 0.35)',
          }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, padding: '22px 26px', minWidth: 260,
              textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontSize: 14,
            }}
          >
            <div className="ta-spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, color: '#1f2430' }}>Uploading {busy}…</div>
            <div style={{ marginTop: 4, color: '#6b7280', fontSize: 12 }}>Please wait. Don&apos;t click Upload again.</div>
          </div>
        </div>
      )}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used within UploadProvider');
  return ctx;
}
