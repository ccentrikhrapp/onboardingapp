import { useNavigate } from 'react-router-dom';
import Icon from './common/Icon.jsx';
import Button from './ta/Button.jsx';

/* How long ago a job was actually posted. */
function postedAgo(createdAt) {
  if (!createdAt) return 'recently';
  const days = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export default function JobCard({ job }) {
  const navigate = useNavigate();
  const skills = job.requiredSkills || [];
  return (
    <article className="cx-job" onClick={() => navigate(`/candidate/jobs/${job.id}`)}>
      <span className="cx-job__icon"><Icon name="Briefcase" size={17} /></span>

      <div className="cx-job__body">
        <div className="cx-job__top">
          <div className="cx-job__titles">
            <div className="cx-job__title">{job.title}</div>
            <div className="cx-job__dept">{job.department}</div>
          </div>
          <span className="cx-job__posted"><Icon name="CalendarDays" size={11} /> Posted {postedAgo(job.createdAt)}</span>
        </div>

        <div className="cx-job__meta">
          <span><Icon name="MapPin" size={12} /> {job.location}</span>
          <span><Icon name="BadgeCheck" size={12} /> {job.experience}</span>
          <span><Icon name="Clock3" size={12} /> {job.employmentType}</span>
        </div>

        {job.description && <p className="cx-job__desc">{job.description}</p>}

        <div className="cx-job__foot">
          <div className="cx-job__skills">
            {skills.slice(0, 5).map((s) => <span key={s} className="ta-skill">{s}</span>)}
            {skills.length > 5 && <span className="ta-skill ta-skill--more">+{skills.length - 5}</span>}
          </div>
          <div className="cx-job__actions" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" onClick={() => navigate(`/candidate/jobs/${job.id}`)}>View</Button>
            <Button iconRight="ArrowRight" onClick={() => navigate(`/candidate/apply/${job.id}`)}>Apply</Button>
          </div>
        </div>
      </div>
    </article>
  );
}
