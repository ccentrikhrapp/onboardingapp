import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/documentRules.css';

/* Settings shell: left navigation, page content on the right. Document Rules
   lives here (admins only) rather than in the primary sidebar. */
export default function SettingsLayout() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const inDocuments = pathname.startsWith('/hr/settings/documents');

  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Settings">
        <h1 className="settings-nav__title">Settings</h1>
        <NavLink to="/hr/settings/general" className={({ isActive }) => `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`}>General</NavLink>
        {role === 'admin' && (
          <>
            <div className="settings-nav__group" aria-current={inDocuments ? 'true' : undefined}>Documents</div>
            <NavLink to="/hr/settings/documents/rules" className={({ isActive }) => `settings-nav__link settings-nav__child${isActive ? ' settings-nav__link--active' : ''}`}>Document Rules</NavLink>
          </>
        )}
        <NavLink to="/hr/settings/email" className={({ isActive }) => `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`}>Email</NavLink>
      </nav>
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
