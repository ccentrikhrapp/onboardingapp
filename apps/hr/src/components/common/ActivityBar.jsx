import { useEffect, useState } from 'react';
import { subscribeActivity } from '../../lib/activity.js';

/* Thin bar across the top of the page while any server action is running,
   so a click always shows it was received. */
export default function ActivityBar() {
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeActivity((n) => setBusy(n > 0)), []);
  useEffect(() => {
    document.body.style.cursor = busy ? 'progress' : '';
    return () => { document.body.style.cursor = ''; };
  }, [busy]);
  if (!busy) return null;
  return (
    <div role="progressbar" aria-label="Working" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 2000, overflow: 'hidden', background: 'rgba(49, 87, 213, 0.15)' }}>
      <div style={{ height: '100%', width: '40%', background: '#3157D5', animation: 'ccx-activity 1s ease-in-out infinite' }} />
      <style>{'@keyframes ccx-activity { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }'}</style>
    </div>
  );
}
