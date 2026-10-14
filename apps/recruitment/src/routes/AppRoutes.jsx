import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';

function LegacyJobRedirect() {
  const { jobId } = useParams();
  return <Navigate to={`/candidate/jobs/${jobId}`} replace />;
}

import CandidateLayout from '../layouts/CandidateLayout.jsx';
import TALayout from '../layouts/TALayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const TALoginPage = lazy(() => import('../pages/TALoginPage.jsx'));
const WelcomePage = lazy(() => import('../pages/WelcomePage.jsx'));
const SetPasswordPage = lazy(() => import('../pages/SetPasswordPage.jsx'));
const LegalPage = lazy(() => import('../pages/LegalPage.jsx'));
import RootGate from '../components/routing/RootGate.jsx';

const LandingPage = lazy(() => import('../pages/candidate/LandingPage.jsx'));
const JobsPage = lazy(() => import('../pages/candidate/JobsPage.jsx'));
const JobDetailsPage = lazy(() => import('../pages/candidate/JobDetailsPage.jsx'));
const ApplyPage = lazy(() => import('../pages/candidate/ApplyPage.jsx'));
const ApplicationSuccessPage = lazy(() => import('../pages/candidate/ApplicationSuccessPage.jsx'));
const MyApplicationPage = lazy(() => import('../pages/candidate/MyApplicationPage.jsx'));
const JoiningFormPage = lazy(() => import('../pages/candidate/JoiningFormPage.jsx'));
const CandidateProfilePage = lazy(() => import('../pages/candidate/CandidateProfilePage.jsx'));

const TADashboard = lazy(() => import('../pages/talentAcquisition/TADashboard.jsx'));
const TACandidatesPage = lazy(() => import('../pages/talentAcquisition/TACandidatesPage.jsx'));
const TADocumentVerifyPage = lazy(() => import('../pages/talentAcquisition/TADocumentVerifyPage.jsx'));
const TACandidateDetailPage = lazy(() => import('../pages/talentAcquisition/TACandidateDetailPage.jsx'));
const TAJobsPage = lazy(() => import('../pages/talentAcquisition/TAJobsPage.jsx'));
const TAJobDetailPage = lazy(() => import('../pages/talentAcquisition/TAJobDetailPage.jsx'));
const TAManagementPage = lazy(() => import('../pages/talentAcquisition/TAManagementPage.jsx'));
const CreateCandidatePage = lazy(() => import('../pages/talentAcquisition/CreateCandidatePage.jsx'));
const BulkUploadCandidatesPage = lazy(() => import('../pages/talentAcquisition/BulkUploadCandidatesPage.jsx'));
const PipelineCandidatesPage = lazy(() => import('../pages/talentAcquisition/PipelineCandidatesPage.jsx'));
const PipelineBulkUploadPage = lazy(() => import('../pages/talentAcquisition/PipelineBulkUploadPage.jsx'));

const SettingsPage = lazy(() => import('../pages/shared/SettingsPage.jsx'));
const ProfilePage = lazy(() => import('../pages/shared/ProfilePage.jsx'));

export default function AppRoutes() {
  const { mustChangePassword } = useAuth();
  // First sign-in with the emailed temporary password: nothing else is reachable
  // until the person chooses their own password.
  if (mustChangePassword) return <Suspense fallback={null}><SetPasswordPage mode="temp" /></Suspense>;
  return (
    <Suspense fallback={null}>
    <Routes>
      {/* A visitor with no specific destination (typed the bare domain) picks
          candidate vs TA here — replaces the old ad-hoc "looking to apply?"
          / "TA sign in here" footer links on each login page with one
          explicit choice. Anyone arriving via a real job link skips this
          entirely and lands straight on /candidate/jobs/:id (fully public —
          see JobDetailsPage). Signing in is deferred to the moment a
          candidate actually starts an application (ApplyPage's own compact
          "Sign in with Google" prompt), not forced up front. */}
      <Route path="/" element={<RootGate><WelcomePage /></RootGate>} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
      <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
      <Route path="/candidate/login" element={<LoginPage />} />
      <Route path="/login" element={<Navigate to="/candidate" replace />} />
      <Route path="/ta/login" element={<TALoginPage />} />

      {/* Candidate / public */}
      <Route element={<CandidateLayout />}>
        <Route path="/candidate" element={<LandingPage />} />
        <Route path="/candidate/jobs" element={<JobsPage />} />
        <Route path="/candidate/jobs/:jobId" element={<JobDetailsPage />} />
        <Route path="/candidate/apply" element={<ApplyPage />} />
        <Route path="/candidate/apply/:jobId" element={<ApplyPage />} />
        <Route path="/candidate/application" element={<MyApplicationPage />} />
        <Route path="/candidate/joining" element={<JoiningFormPage />} />
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
        <Route path="/ta/pipeline" element={<PipelineCandidatesPage />} />
        <Route path="/ta/pipeline/bulk-upload" element={<PipelineBulkUploadPage />} />
        <Route path="/ta/candidates" element={<TACandidatesPage />} />
        <Route path="/ta/candidates/new" element={<CreateCandidatePage />} />
        <Route path="/ta/candidates/bulk-upload" element={<BulkUploadCandidatesPage />} />
        <Route path="/ta/candidates/:candidateId/documents/:documentId/verify" element={<TADocumentVerifyPage />} />
        <Route path="/ta/candidates/:candidateId" element={<TACandidateDetailPage />} />
        <Route path="/ta/jobs" element={<TAJobsPage />} />
        <Route path="/ta/jobs/:jobId" element={<TAJobDetailPage />} />
        <Route path="/ta/team" element={<RoleRoute allow="team"><TAManagementPage /></RoleRoute>} />
        <Route path="/ta/settings" element={<SettingsPage />} />
        <Route path="/ta/profile" element={<ProfilePage role="ta" />} />
      </Route>

      {/* HR now lives in the separate apps/hr application — see
          docs/requirements/02-two-application-architecture.md. An 'hr' role
          reaching this app (it shouldn't — HR staff sign in on the HR app's
          own Supabase project) is handled by LoginPage, not routed here. */}

      <Route path="*" element={<Navigate to="/candidate" replace />} />
    </Routes>
    </Suspense>
  );
}
