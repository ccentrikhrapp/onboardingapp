import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { listMyApplications } from '../../api/applications.js';
import { applicationFromDb } from '../../api/mappers.js';
import { initialsOf, formatCurrencyINR } from '../../utils/format.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/common/States.jsx';

function Info({ label, value }) {
  return (
    <div className="ta-info__item">
      <span className="ta-info__label">{label}</span>
      <span className="ta-info__value">{value || '—'}</span>
    </div>
  );
}

export default function CandidateProfilePage() {
  const navigate = useNavigate();
  const { configured } = useCandidateAuth();
  const [app, setApp] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    if (!configured) { setApp(null); return; }
    listMyApplications()
      .then((apps) => setApp(apps?.[0] ? applicationFromDb(apps[0]) : null))
      .catch(() => setApp(null));
  }, [configured]);

  if (app === undefined) {
    return <div className="cx-page cx-page--narrow"><SkeletonPage /></div>;
  }

  if (!app) {
    return (
      <div className="cx-page cx-page--narrow">
        <EmptyState
          icon="UserRound"
          title="No profile yet"
          message="Apply to an opportunity and your profile details will be saved here."
          action={<Button icon="Briefcase" onClick={() => navigate('/candidate/jobs')}>Explore jobs</Button>}
        />
      </div>
    );
  }

  const p = app.personal;
  const pr = app.professional;
  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();

  return (
    <div className="cx-page cx-page--narrow">
      <div className="cx-page__head">
        <h1 className="cx-page__title">My profile</h1>
        <p className="cx-page__sub">Details from your application — {app.code}</p>
      </div>

      <div className="ta-profile-head" style={{ marginBottom: 16 }}>
        <span className="ta-avatar">{initialsOf(name)}</span>
        <div className="grow">
          <div className="ta-cell-strong" style={{ fontSize: 15 }}>{name}</div>
          <div className="ta-cell-sub">
            {pr.currentJobTitle || 'Candidate'}{pr.currentCompany ? ` · ${pr.currentCompany}` : ''}
          </div>
        </div>
      </div>

      <Card title="Contact & details">
        <div className="ta-info">
          <Info label="Email" value={p.email} />
          <Info label="Phone" value={p.mobile} />
          <Info label="Current location" value={p.currentLocation} />
          <Info label="Total experience" value={pr.totalExperience ? `${pr.totalExperience} years` : '—'} />
          <Info label="Notice period" value={pr.noticePeriod} />
          <Info label="Expected salary" value={formatCurrencyINR(pr.expectedCTC)} />
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Education & skills">
        <div className="ta-info ta-info--1" style={{ marginBottom: 12 }}>
          <Info label="Highest qualification" value={app.education?.[0]?.qualification} />
        </div>
        <div className="ta-skills">
          {(pr.skills || []).length
            ? pr.skills.map((s) => <span key={s} className="ta-skill">{s}</span>)
            : <span className="ta-cell-mute">No skills listed</span>}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Button icon="ClipboardList" onClick={() => navigate('/candidate/application')}>View my application</Button>
        <Button variant="ghost" icon="Briefcase" onClick={() => navigate('/candidate/jobs')}>Browse jobs</Button>
      </div>
    </div>
  );
}
