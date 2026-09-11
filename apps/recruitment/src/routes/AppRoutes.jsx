import { Routes, Route, Navigate, useParams } from 'react-router-dom';

function LegacyJobRedirect() {
  const { jobId } = useParams();
  return <Navigate to={`/candidate/jobs/${jobId}`} replace />;
}

import CandidateLayout from '../layouts/CandidateLayout.jsx';
import TALayout from '../layouts/TALayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';

import LoginPage from '../pages/LoginPage.jsx';
import TALoginPage from '../pages/TALoginPage.jsx';

import LandingPage from '../pages/candidate/LandingPage.jsx';
import JobsPage from '../pages/candidate/JobsPage.jsx';
import JobDetailsPage from '../pages/candidate/JobDetailsPage.jsx';
import ApplyPage from '../pages/candidate/ApplyPage.jsx';
import ApplicationSuccessPage from '../pages/candidate/ApplicationSuccessPage.jsx';
import MyApplicationPage from '../pages/candidate/MyApplicationPage.jsx';
import CandidateProfilePage from '../pages/candidate/CandidateProfilePage.jsx';

import TADashboard from '../pages/talentAcquisition/TADashboard.jsx';
import TACandidatesPage from '../pages/talentAcquisition/TACandidatesPage.jsx';
import TACandidateDetailPage from '../pages/talentAcquisition/TACandidateDetailPage.jsx';
import TAJobsPage from '../pages/talentAcquisition/TAJobsPage.jsx';
import TAJobDetailPage from '../pages/talentAcquisition/TAJobDetailPage.jsx';

import SettingsPage from '../pages/shared/SettingsPage.jsx';
import ProfilePage from '../pages/shared/ProfilePage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/ta/login" element={<TALoginPage />} />

      {/* Candidate / public */}
      <Route element={<CandidateLayout />}>
        <Route path="/candidate" element={<LandingPage />} />
        <Route path="/candidate/jobs" element={<JobsPage />} />
        <Route path="/candidate/jobs/:jobId" element={<JobDetailsPage />} />
        <Route path="/candidate/apply" element={<ApplyPage />} />
        <Route path="/candidate/apply/:jobId" element={<ApplyPage />} />
        <Route path="/candidate/application" element={<MyApplicationPage />} />
        <Route path="/candidate/application/success" element={<ApplicationSuccessPage />} />
        <Route path="/candidate/profile" element={<CandidateProfilePage />} />

        {/* legacy redirects */}
        <Route path="/jobs" element={<Navigate to="/candidate/jobs" replace />} />
        <Route path="/jobs/:jobId" element={<LegacyJobRedirect />} />
        <Route path="/apply" element={<Navigate to="/candidate/apply" replace />} />
        <Route path="/how-it-works" element={<Navigate to="/candidate" replace />} />
        <Route path="/application-success" element={<Navigate to="/candidate/application/success" replace />} />
        <Route path="/my-application" element={<Navigate to="/candidate/application" replace />} />
      </Route>

      {/* Talent Acquisition */}
      <Route
        element={
          <RoleRoute allow="ta">
            <TALayout />
          </RoleRoute>
        }
      >
        <Route path="/ta" element={<TADashboard />} />
        <Route path="/ta/applications" element={<Navigate to="/ta/candidates" replace />} />
        <Route path="/ta/candidates" element={<TACandidatesPage />} />
        <Route path="/ta/candidates/:candidateId" element={<TACandidateDetailPage />} />
        <Route path="/ta/jobs" element={<TAJobsPage />} />
        <Route path="/ta/jobs/:jobId" element={<TAJobDetailPage />} />
        <Route path="/ta/settings" element={<SettingsPage />} />
        <Route path="/ta/profile" element={<ProfilePage role="ta" />} />
      </Route>

      {/* HR now lives in the separate apps/hr application — see
          docs/requirements/02-two-application-architecture.md. An 'hr' role
          reaching this app (it shouldn't — HR staff sign in on the HR app's
          own Supabase project) is handled by LoginPage, not routed here. */}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
