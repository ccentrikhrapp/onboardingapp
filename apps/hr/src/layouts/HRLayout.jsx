import { Suspense, useMemo, useState } from 'react';
import { SkeletonPage } from '../components/kit/Skeleton.jsx';
import { Outlet, useLocation } from 'react-router-dom';
import HRSidebar from '../components/navigation/HRSidebar.jsx';
import HRTopbar from '../components/navigation/HRTopbar.jsx';
import ConnectGoogleBanner from '../components/auth/ConnectGoogleBanner.jsx';

export default function HRLayout() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [head, setHead] = useState(null);
  const { pathname } = useLocation();

  const ctx = useMemo(() => ({ setHead }), []);

  return (
    <div className="hr-shell">
      <HRSidebar open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="overlay" onClick={() => setOpen(false)} />}

      <div className="hr-main">
        <HRTopbar head={head} onMenu={() => setOpen(true)} />
        <ConnectGoogleBanner settingsPath="/hr/settings" />
        <div className="hr-page" key={pathname}>
          <Suspense fallback={<SkeletonPage />}><Outlet context={ctx} /></Suspense>
        </div>
      </div>
    </div>
  );
}
