import { Routes, Route, Navigate } from 'react-router-dom';
import HRLayout from '../layouts/HRLayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import VerificationQueuePage from '../pages/hr/VerificationQueuePage.jsx';
import VerificationWorkspacePage from '../pages/hr/VerificationWorkspacePage.jsx';
import OnboardingCasesPage from '../pages/hr/OnboardingCasesPage.jsx';
import OnboardingCaseDetailPage from '../pages/hr/OnboardingCaseDetailPage.jsx';
import SettingsPage from '../pages/shared/SettingsPage.jsx';
import ProfilePage from '../pages/shared/ProfilePage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route element={<RoleRoute><HRLayout /></RoleRoute>}>
        <Route path="/hr" element={<VerificationQueuePage />} />
        <Route path="/hr/applications/:applicationId" element={<VerificationWorkspacePage />} />
        <Route path="/hr/onboarding" element={<OnboardingCasesPage />} />
        <Route path="/hr/onboarding/:caseId" element={<OnboardingCaseDetailPage />} />
        <Route path="/hr/settings" element={<SettingsPage />} />
        <Route path="/hr/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
