import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createLink, setLinkActive, createConfidentialInvite, listConfidentialInvites } from '../../api/applicationLinks.js';
import { Field, Input } from '../../components/ta/Field.jsx';
import { emailError } from '../../utils/validation.js';
import { listApplications } from '../../api/applications.js';
import { APP_STATUS, stageIndexForStatus } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/common/States.jsx';

/* The TA's personal application link for this role. One link per (TA, job);
   the token is server-generated and attribution is resolved server-side. */
function ApplicationLinkCard({ jobId }) {
  const toast = useToast();
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    createLink(jobId)
      .then((l) => !cancelled && setLink(l))
      .catch(() => !cancelled && setLink(null))
      .finally(() => !cancelled && setBusy(false));
    return () => { cancelled = true; };
  }, [jobId]);

  if (busy) return <Card title="Your application link"><SkeletonBlock lines={2} /></Card>;
  if (!link) return null;

  const url = `${window.location.origin}/candidate/apply?ref=${link.token}`;
  const toggle = async () => {
    const updated = await setLinkActive(link.id, !link.active);
    setLink(updated);
  };

  return (
    <Card title="Your application link">
      <p className="ta-cell-sub" style={{ marginBottom: 10 }}>
        Share this link. Anyone who applies through it is attributed to you automatically.
      </p>
      <div className="ta-copyrow">
        <input className="ta-copyrow__input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button
          variant="ghost"
          icon="Copy"
          onClick={() => { navigator.clipboard?.writeText(url); toast.success('Link copied.'); }}
        >
          Copy
        </Button>
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tag tone={link.active ? 'green' : 'grey'}>{link.active ? 'Active' : 'Disabled'}</Tag>
        <button className="ta-link" onClick={toggle}>{link.active ? 'Disable link' : 'Re-enable link'}</button>
      </div>
    </Card>
  );
}

/* One-off, discreet invitations for a specific candidate the TA wants to
   approach directly — the candidate-facing page never names the TA. A TA can
   generate as many of these as they like for the same role. */
function ConfidentialInviteCard({ jobId }) {
  const toast = useToast();
  const [invites, setInvites] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = () => listConfidentialInvites(jobId).then(setInvites).catch(() => {});
  useEffect(() => { reload(); }, [jobId]);

  const generate = async () => {
    const msg = emailError(email, { required: false });
    setEmailErr(msg);
    if (msg) return;
    setCreating(true);
    try {
      await createConfidentialInvite(jobId, { invitedName: name.trim(), invitedEmail: email.trim() });
      setName('');
      setEmail('');
      toast.success('Invitation link generated.');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not generate the invitation.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card title="Confidential invitations">
      <p className="ta-cell-sub" style={{ marginBottom: 10 }}>
        For a candidate you'd like to approach directly. Their page never mentions you or the
        recruitment pipeline — just the opportunity.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Field label="Candidate name" hint="Optional">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Candidate email" hint="Optional" error={emailErr}>
          <Input
            value={email} error={emailErr} placeholder="Optional"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => setEmailErr(emailError(e.target.value, { required: false }))}
          />
        </Field>
      </div>
      <Button variant="ghost" icon="UserPlus" onClick={generate} disabled={creating}>
        {creating ? 'Generating…' : 'Generate invitation link'}
      </Button>

      {invites.length > 0 && (
        <div className="ta-stack" style={{ marginTop: 14 }}>
          {invites.map((inv) => {
            const url = `${window.location.origin}/candidate/apply?ref=${inv.token}`;
            return (
              <div key={inv.id} className="ta-copyrow">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ta-cell-strong">{inv.invited_name || 'Unnamed invitation'}</div>
                  <div className="ta-cell-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
                </div>
                <Tag tone={inv.active ? 'green' : 'grey'}>{inv.active ? 'Active' : 'Disabled'}</Tag>
                <Button variant="ghost" icon="Copy" onClick={() => { navigator.clipboard?.writeText(url); toast.success('Link copied.'); }}>
                  Copy
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const BREAKDOWN = [
  { label: 'Applied', reach: 0, tone: 'blue' },
  { label: 'Screening', reach: 1, tone: 'violet' },
  { label: 'Interview', reach: 2, tone: 'amber' },
  { label: 'Offer', reach: 4, tone: 'green' },
  { label: 'Hired', reach: 5, tone: 'green' },
];

function List({ title, items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 className="ta-card__title" style={{ marginBottom: 10 }}>{title}</h3>
      <ul className="ta-bullets">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export default function TAJobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { getJob, deleteJob, role } = useApp();
  const canManageJobs = role === 'admin' || role === 'admin_ta';
  const { configured } = useAuth();
  const toast = useToast();
  const job = getJob(jobId);
  const [applicants, setApplicants] = useState([]);

  const removeJob = async () => {
    const ok = window.confirm(`Delete "${job.title}"? This can't be undone.`);
    if (!ok) return;
    try {
      await deleteJob(job.id);
      toast.success(`${job.title} deleted.`);
      navigate('/ta/jobs');
    } catch (e) {
      toast.error(e.message || 'Could not delete the job.');
    }
  };

  useEffect(() => {
    listApplications()
      .then((list) => setApplicants((list || []).filter((a) => a.job_id === jobId)))
      .catch(() => setApplicants([]));
  }, [jobId]);

  const breakdown = BREAKDOWN.map((b) => ({
    ...b,
    value: applicants.filter((a) => a.status !== APP_STATUS.REJECTED && stageIndexForStatus(a.status) >= b.reach).length,
  }));

  if (!job) {
    return (
      <EmptyState icon="Briefcase" title="Job not found" message="This job may have been removed."
        action={<Button variant="ghost" onClick={() => navigate('/ta/jobs')}>Back to jobs</Button>} />
    );
  }

  return (
    <>
      <TAHeader
        title={job.title}
        subtitle={`${job.department} · ${job.location} · ${job.employmentType} · ${job.workMode} · apply by ${formatDate(job.deadline)}`}
        backTo="/ta/jobs"
        backLabel="Jobs"
      />

      <div className="ta-page-actions">
        <Button icon="Users" onClick={() => navigate(`/ta/candidates?job=${encodeURIComponent(job.title)}`)}>View applicants</Button>
        {canManageJobs && (
          <Button variant="danger" icon="Trash2" onClick={removeJob}>Delete job</Button>
        )}
      </div>

      <div className="ta-detail-grid">
        <Card>
          <div style={{ marginBottom: 22 }}>
            <h3 className="ta-card__title" style={{ marginBottom: 10 }}>About the role</h3>
            <p className="ta-cell-mute" style={{ lineHeight: 1.7 }}>{job.description}</p>
          </div>
          <List title="Responsibilities" items={job.responsibilities} />
          {job.requiredSkills?.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <h3 className="ta-card__title" style={{ marginBottom: 10 }}>Required skills</h3>
              <div className="ta-skills">{job.requiredSkills.map((s) => <span key={s} className="ta-skill">{s}</span>)}</div>
            </div>
          )}
          {job.preferredSkills?.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <h3 className="ta-card__title" style={{ marginBottom: 10 }}>Preferred skills</h3>
              <div className="ta-skills">{job.preferredSkills.map((s) => <span key={s} className="ta-skill">{s}</span>)}</div>
            </div>
          )}
          <List title="Qualifications" items={job.qualifications} />
          <List title="What we offer" items={job.benefits} />
        </Card>

        <div className="ta-stack">
        {configured && <ApplicationLinkCard jobId={job.id} />}
        {configured && <ConfidentialInviteCard jobId={job.id} />}
        <Card title="Applicant pipeline">
          {applicants.length === 0 ? (
            <p className="ta-cell-mute">No applicants yet for this role.</p>
          ) : (
            <div className="ta-pipe">
              {breakdown.map((b) => (
                <div className="ta-pipe__row" key={b.label} style={{ cursor: 'default' }}>
                  <span className="ta-pipe__icon" style={{ '--p-bg': `var(--tag-${b.tone}-bg)`, '--p-fg': `var(--tag-${b.tone}-fg)` }}>
                    <Icon name="CircleDot" size={13} />
                  </span>
                  <span className="ta-pipe__label">{b.label}</span>
                  <span className="ta-pipe__count">{b.value}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Button variant="ghost" iconRight="ArrowRight" onClick={() => navigate(`/ta/candidates?job=${encodeURIComponent(job.title)}`)}>
              Open in candidates
            </Button>
          </div>
        </Card>
        </div>
      </div>
    </>
  );
}
