import { useAuth } from '../../context/AuthContext.jsx';

export default function ProfilePage() {
  const { profile } = useAuth();
  return (
    <div className="page-body" style={{ maxWidth: 640 }}>
      <h1 className="page-title mb-4">Profile</h1>
      <div className="hr-card">
        <div className="hr-card__body">
          <div className="row gap-4 mb-4">
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
              {(profile?.full_name || profile?.email || '?')[0]?.toUpperCase()}
            </span>
            <div>
              <div className="section-title">{profile?.full_name || profile?.email}</div>
              <div className="text-secondary text-small">HR</div>
            </div>
          </div>
          <div className="hr-info">
            <div className="hr-info__item"><span className="hr-info__label">Email</span><span className="hr-info__value">{profile?.email}</span></div>
            <div className="hr-info__item"><span className="hr-info__label">Role</span><span className="hr-info__value">{profile?.role}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
