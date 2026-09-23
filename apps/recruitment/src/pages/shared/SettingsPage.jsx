import { Card } from '../../components/common/Card.jsx';
import { useApp } from '../../context/AppContext.jsx';
import EmailSettingsCard from '../../components/settings/EmailSettingsCard.jsx';

export default function SettingsPage() {
  const { profile } = useApp();

  return (
    <div className="page-body" style={{ maxWidth: 720 }}>
      <h1 className="page-title mb-4">Settings</h1>
      <Card title="Account">
        <p className="text-secondary text-small">
          Signed in as <strong>{profile?.email}</strong>. Access is managed by your
          administrator via the staff allowlist.
        </p>
      </Card>
      <EmailSettingsCard />
    </div>
  );
}
