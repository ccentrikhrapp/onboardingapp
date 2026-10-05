import { Routes, Route, Navigate, useParams } from 'react-router-dom';

function LegacyJobRedirect() {
  const { jobId } = useParams();
  return <Navigate to={`/candidate/jobs/${jobId}`} replace />;
}

import CandidateLayout from '../layouts/CandidateLayout.jsx';
import TALayout from '../layouts/TALayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

import LoginPage from '../pages/LoginPage.jsx';
import TALoginPage from '../pages/TALoginPage.jsx';
import WelcomePage from '../pages/WelcomePage.jsx';
import SetPasswordPage from '../pages/SetPasswordPage.jsx';
import LegalPage from '../pages/LegalPage.jsx';
import RootGate from '../components/routing/RootGate.jsx';

import LandingPage from '../pages/candidate/LandingPage.jsx';
import JobsPage from '../pages/candidate/JobsPage.jsx';
import JobDetailsPage from '../pages/candidate/JobDetailsPage.jsx';
import ApplyPage from '../pages/candidate/ApplyPage.jsx';
import ApplicationSuccessPage from '../pages/candidate/ApplicationSuccessPage.jsx';
import MyApplicationPage from '../pages/candidate/MyApplicationPage.jsx';
import JoiningFormPage from '../pages/candidate/JoiningFormPage.jsx';
import CandidateProfilePage from '../pages/candidate/CandidateProfilePage.jsx';

import TADashboard from '../pages/talentAcquisition/TADashboard.jsx';
import TACandidatesPage from '../pages/talentAcquisition/TACandidatesPage.jsx';
import TADocumentVerifyPage from '../pages/talentAcquisition/TADocumentVerifyPage.jsx';
import TACandidateDetailPage from '../pages/talentAcquisition/TACandidateDetailPage.jsx';
import TAJobsPage from '../pages/talentAcquisition/TAJobsPage.jsx';
import TAJobDetailPage from '../pages/talentAcquisition/TAJobDetailPage.jsx';
import TAManagementPage from '../pages/talentAcquisition/TAManagementPage.jsx';
import CreateCandidatePage from '../pages/talentAcquisition/CreateCandidatePage.jsx';
import BulkUploadCandidatesPage from '../pages/talentAcquisition/BulkUploadCandidatesPage.jsx';
import DocumentRulesPage from '../pages/talentAcquisition/DocumentRulesPage.jsx';
import PipelineCandidatesPage from '../pages/talentAcquisition/PipelineCandidatesPage.jsx';
import PipelineBulkUploadPage from '../pages/talentAcquisition/PipelineBulkUploadPage.jsx';

import SettingsPage from '../pages/shared/SettingsPage.jsx';
import ProfilePage from '../pages/shared/ProfilePage.jsx';

export default function AppRoutes() {
  const { mustChangePassword } = useAuth();
  // First sign-in with the emailed temporary password: nothing else is reachable
  // until the person chooses their own password.
  if (mustChangePassword) return <SetPasswordPage mode="temp" />;
  return (
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
        <Route path="/ta/document-rules" element={<RoleRoute allow="admin"><DocumentRulesPage /></RoleRoute>} />
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
  );
}
