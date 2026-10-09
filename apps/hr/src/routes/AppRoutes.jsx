import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HRLayout from '../layouts/HRLayout.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ALL_STAFF_ROLES, ROLES } from '../constants/roles.js';
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const SetPasswordPage = lazy(() => import('../pages/SetPasswordPage.jsx'));
const HRTeamsPage = lazy(() => import('../pages/hr/HRTeamsPage.jsx'));
const HRDashboard = lazy(() => import('../pages/hr/HRDashboard.jsx'));
const VerificationQueuePage = lazy(() => import('../pages/hr/VerificationQueuePage.jsx'));
const VerificationWorkspacePage = lazy(() => import('../pages/hr/VerificationWorkspacePage.jsx'));
const HRCandidatesPage = lazy(() => import('../pages/hr/HRCandidatesPage.jsx'));
const DocumentRulesPage = lazy(() => import('../pages/hr/DocumentRulesPage.jsx'));
const SettingsLayout = lazy(() => import('../pages/shared/SettingsLayout.jsx'));
const EmailSettingsPage = lazy(() => import('../pages/shared/EmailSettingsPage.jsx'));
const JoiningReviewPage = lazy(() => import('../pages/hr/JoiningReviewPage.jsx'));
const HRCandidateDetailPage = lazy(() => import('../pages/hr/HRCandidateDetailPage.jsx'));
const HREmployeesPage = lazy(() => import('../pages/hr/HREmployeesPage.jsx'));
const HRActivityPage = lazy(() => import('../pages/hr/HRActivityPage.jsx'));
const EmployeeOnboardingPage = lazy(() => import('../pages/hr/EmployeeOnboardingPage.jsx'));
const OnboardingTasksPage = lazy(() => import('../pages/hr/OnboardingTasksPage.jsx'));
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
        <Route path="/hr/employee-onboarding" element={<EmployeeOnboardingPage />} />
        <Route path="/hr/employee-onboarding/:employeeId" element={<EmployeeOnboardingPage />} />
        <Route path="/hr/activity" element={<HRActivityPage />} />
        {/* Document Rules moved under Settings. Old links still work. */}
        <Route path="/hr/document-rules" element={<Navigate to="/hr/settings/documents/rules" replace />} />
        <Route path="/hr/team" element={<RoleRoute allow={[ROLES.ADMIN]}><HRTeamsPage /></RoleRoute>} />
        <Route path="/hr/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/hr/settings/general" replace />} />
          <Route path="general" element={<SettingsPage />} />
          <Route path="email" element={<EmailSettingsPage />} />
          <Route path="documents/rules" element={<RoleRoute allow={[ROLES.ADMIN, ROLES.HR]}><DocumentRulesPage /></RoleRoute>} />
        </Route>
      </Route>

      {/* Accounts/IT/Office Admin only need their own assigned onboarding
          tasks and their profile — not the rest of the HR workflow. */}
      <Route element={<RoleRoute allow={ALL_STAFF_ROLES}><HRLayout /></RoleRoute>}>
        <Route path="/hr/tasks" element={<OnboardingTasksPage />} />
        <Route path="/hr/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
