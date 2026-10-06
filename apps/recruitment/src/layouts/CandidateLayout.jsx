import { Outlet, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { SkeletonPage } from '../components/common/States.jsx';
import CandidateHeader from '../components/navigation/CandidateHeader.jsx';

export default function CandidateLayout() {
  const { pathname } = useLocation();
  return (
    <div className="cx">
      <CandidateHeader />
      <main className="cx-main route-view" key={pathname}>
        <Suspense fallback={<div className="cx-page"><SkeletonPage /></div>}><Outlet /></Suspense>
      </main>
      <footer className="cx-footer">
        <div className="cx-footer__inner">© 2026 Ccentrik · Recruitment &amp; Onboarding</div>
      </footer>
    </div>
  );
}
