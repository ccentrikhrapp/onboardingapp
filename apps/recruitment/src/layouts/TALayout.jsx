import { Suspense, useMemo, useState } from 'react';
import { SkeletonPage } from '../components/common/States.jsx';
import { Outlet, useLocation } from 'react-router-dom';
import TATopNav3 from '../components/navigation/TATopNav3.jsx';
import TATopbar from '../components/navigation/TATopbar.jsx';
import ConnectGoogleBanner from '../components/auth/ConnectGoogleBanner.jsx';

export default function TALayout() {
  const [head, setHead] = useState(null);
  const { pathname } = useLocation();

  const ctx = useMemo(() => ({ setHead }), []);

  return (
    <div className="ta-shell ta-shell--topnav">
      <TATopNav3 />

      <div className="ta-main">
        <TATopbar head={head} />
        <ConnectGoogleBanner needCalendar settingsPath="/ta/settings" />
        <div className="ta-page" key={pathname}>
          <Suspense fallback={<SkeletonPage />}><Outlet context={ctx} /></Suspense>
        </div>
      </div>
    </div>
  );
}
