import EmailSettingsCard from '../../components/settings/EmailSettingsCard.jsx';

export default function EmailSettingsPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 className="page-title mb-4">Email</h2>
      <EmailSettingsCard />
    </div>
  );
}
