import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { useGoogleSignIn } from '../../components/auth/useGoogleSignIn.js';
import { formatDate } from '../../utils/format.js';

function List({ title, items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 className="ta-card__title" style={{ marginBottom: 10 }}>{title}</h3>
      <ul className="ta-bullets">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export default function JobDetailsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { getJob, jobsLoading } = useApp();
  const { user } = useCandidateAuth();
  const { signing, trigger } = useGoogleSignIn(undefined, useCandidateAuth);
  const job = getJob(jobId);

  if (jobsLoading) {
    return <div className="cx-page"><div className="cx-loading">Loading role…</div></div>;
  }

  if (!job) {
    return (
      <div className="cx-page">
        <EmptyState icon="SearchX" title="Job not found"
          action={<Button variant="ghost" onClick={() => navigate('/candidate/jobs')}>Back to all jobs</Button>} />
      </div>
    );
  }

  const facts = [
    { label: 'Department', value: job.department },
    { label: 'Experience', value: job.experience },
    { label: 'Apply by', value: formatDate(job.deadline) },
  ];

  return (
    <div className="cx-page">
      <button className="ta-link" onClick={() => navigate('/candidate/jobs')} style={{ marginBottom: 14 }}>
        <Icon name="ArrowLeft" size={14} /> All jobs
      </button>

      <div className="cx-jobhead">
        <div className="cx-jobhead__main">
          <span className="ta-cell-sub">{job.department} · {job.code}</span>
          <h1 className="cx-page__title" style={{ marginTop: 2 }}>{job.title}</h1>
          <p className="cx-page__sub" style={{ marginTop: 4 }}>{job.location} · {job.employmentType} · {job.workMode}</p>
        </div>
        <dl className="cx-jobhead__facts">
          {facts.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="ta-detail-grid">
        <Card>
          <div style={{ marginBottom: 20 }}>
            <h3 className="ta-card__title" style={{ marginBottom: 10 }}>About the role</h3>
            <p className="ta-cell-mute" style={{ lineHeight: 1.7 }}>{job.description}</p>
          </div>
          <List title="Responsibilities" items={job.responsibilities} />
          {job.requiredSkills?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 className="ta-card__title" style={{ marginBottom: 10 }}>Required skills</h3>
              <div className="ta-skills">{job.requiredSkills.map((s) => <span key={s} className="ta-skill">{s}</span>)}</div>
            </div>
          )}
          {job.preferredSkills?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 className="ta-card__title" style={{ marginBottom: 10 }}>Preferred skills</h3>
              <div className="ta-skills">{job.preferredSkills.map((s) => <span key={s} className="ta-skill">{s}</span>)}</div>
            </div>
          )}
          <List title="Qualifications" items={job.qualifications} />
          <List title="What we offer" items={job.benefits} />
        </Card>

        <Card title="Ready to apply?">
          <p className="ta-cell-sub" style={{ marginBottom: 16 }}>Takes about 2 minutes with your resume.</p>
          <Button iconRight="ArrowRight" onClick={() => navigate(`/candidate/apply/${job.id}`)} style={{ width: '100%' }}>
            Apply now
          </Button>
          {user ? (
            <button type="button" className="ta-link" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={() => navigate('/candidate/application')}>
              View my application status
            </button>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Button variant="ghost" icon="CircleUserRound" disabled={signing} onClick={() => trigger()} style={{ flex: 1 }}>
                {signing ? 'Opening Google…' : 'Sign up with Google'}
              </Button>
              <Button variant="ghost" icon="CircleUserRound" disabled={signing} onClick={() => trigger()} style={{ flex: 1 }}>
                Sign in with Google
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
