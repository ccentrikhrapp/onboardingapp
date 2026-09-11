import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../../components/kit/Button.jsx';

export default function SettingsPage() {
  const { signOut } = useAuth();
  return (
    <div className="page-body" style={{ maxWidth: 640 }}>
      <h1 className="page-title mb-4">Settings</h1>
      <div className="hr-card">
        <div className="hr-card__body">
          <p className="text-secondary" style={{ marginBottom: 14 }}>
            Access to this application is managed by your administrator via the staff
            allowlist — there is nothing to configure here yet.
          </p>
          <Button variant="ghost" icon="LogOut" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
