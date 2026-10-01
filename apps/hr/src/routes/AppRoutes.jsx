import { Routes, Route, Navigate } from 'react-router-dom';
import HRLayout from '../layouts/HRLayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import SetPasswordPage from '../pages/SetPasswordPage.jsx';
import HRTeamsPage from '../pages/hr/HRTeamsPage.jsx';
import HRDashboard from '../pages/hr/HRDashboard.jsx';
import VerificationQueuePage from '../pages/hr/VerificationQueuePage.jsx';
import VerificationWorkspacePage from '../pages/hr/VerificationWorkspacePage.jsx';
import HRCandidatesPage from '../pages/hr/HRCandidatesPage.jsx';
import DocumentRulesPage from '../pages/hr/DocumentRulesPage.jsx';
import JoiningReviewPage from '../pages/hr/JoiningReviewPage.jsx';
import HRCandidateDetailPage from '../pages/hr/HRCandidateDetailPage.jsx';
import HREmployeesPage from '../pages/hr/HREmployeesPage.jsx';
import HRActivityPage from '../pages/hr/HRActivityPage.jsx';
import SettingsPage from '../pages/shared/SettingsPage.jsx';
import ProfilePage from '../pages/shared/ProfilePage.jsx';

export default function AppRoutes() {
  const { mustChangePassword } = useAuth();
  // First sign-in with the emailed temporary password: nothing else is reachable
  // until the person chooses their own password.
  if (mustChangePassword) return <SetPasswordPage mode="temp" />;
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
      <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />

      <Route element={<RoleRoute><HRLayout /></RoleRoute>}>
        <Route path="/hr" element={<HRDashboard />} />
        <Route path="/hr/verification" element={<VerificationQueuePage />} />
        <Route path="/hr/applications/:applicationId" element={<VerificationWorkspacePage />} />
        <Route path="/hr/candidates" element={<HRCandidatesPage />} />
        <Route path="/hr/candidates/:candidateId" element={<HRCandidateDetailPage />} />
        <Route path="/hr/candidates/:candidateId/joining" element={<JoiningReviewPage />} />
        {/* Old links some pages/emails may still point at. */}
        <Route path="/hr/onboarding" element={<Navigate to="/hr/candidates" replace />} />
        <Route path="/hr/employees" element={<HREmployeesPage />} />
        <Route path="/hr/activity" element={<HRActivityPage />} />
        <Route path="/hr/document-rules" element={<RoleRoute allow="admin"><DocumentRulesPage /></RoleRoute>} />
        <Route path="/hr/team" element={<RoleRoute allow="admin"><HRTeamsPage /></RoleRoute>} />
        <Route path="/hr/settings" element={<SettingsPage />} />
        <Route path="/hr/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
