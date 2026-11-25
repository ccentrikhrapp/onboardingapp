import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import Tag from './Tag.jsx';
import Button from './Button.jsx';
import ResumeViewer from './ResumeViewer.jsx';
import NotesPanel from './NotesPanel.jsx';
import { Drawer } from '../common/Modal.jsx';
import { getApplication } from '../../api/applications.js';
import { applicationFromDb } from '../../api/mappers.js';
import { stageBadgeForStatus } from '../../constants/statuses.js';
import { formatDate, initialsOf, avatarToneOf } from '../../utils/format.js';
import { SkeletonBlock } from '../common/States.jsx';

const SOURCE_LABEL = { careers: 'Job Portal', ta_link: 'Job Portal (TA link)', ta_sourced: 'TA-created' };
function creationSourceLabel(app) {
  if (app.source === 'ta_sourced' && app.additional?.createdVia === 'csv') return 'TA bulk upload';
  if (app.source === 'ta_sourced' && app.additional?.createdVia === 'pipeline') return 'From Pipeline';
  return SOURCE_LABEL[app.source] || app.source || '—';
}

/* Quick-look slide-over — opens over the list/board instead of navigating
   away, per the Tiimi reference. "Open full profile" goes to the existing
   routable page for the full workflow (interviews, offer, documents etc.);
   this panel is read-only. */
export default function CandidatePreviewDrawer({ applicationId, onClose }) {
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!applicationId) return;
    setApp(null);
    setError(null);
    getApplication(applicationId)
      .then((row) => setApp(applicationFromDb(row)))
      .catch((e) => setError(e.message || 'Could not load this candidate.'));
  }, [applicationId]);

  const badge = app ? stageBadgeForStatus(app.status) : null;

  return (
    <Drawer
      open={!!applicationId}
      onClose={onClose}
      title={app ? app.candidateName : 'Candidate'}
      footer={app && (
        <Button icon="ArrowUpRight" onClick={() => navigate(`/ta/candidates/${app.id}`)}>
          Open full profile
        </Button>
      )}
    >
      {!app && !error && <SkeletonBlock lines={6} />}
      {error && <div className="ta-note ta-note--err"><Icon name="AlertTriangle" size={14} /> {error}</div>}
      {app && (
        <div className="ta-stack" style={{ gap: 18 }}>
          <div className="ta-preview-head">
            <span className={`ta-avatar ta-avatar--${avatarToneOf(app.candidateName)}`} style={{ width: 44, height: 44, fontSize: 15 }}>
              {initialsOf(app.candidateName)}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ta-cell-cand__name" style={{ fontSize: 15 }}>{app.candidateName}</div>
              <div className="ta-cell-sub">{app.jobTitle}</div>
            </div>
            {badge && <Tag tone={badge.tone}>{badge.label}</Tag>}
          </div>

          <div className="ta-preview-grid">
            <div><span className="ta-cell-sub">Candidate ID</span><br /><span className="ta-cell-strong">{app.candidateCode || '—'}</span></div>
            <div><span className="ta-cell-sub">Application ID</span><br /><span className="ta-cell-strong">{app.code}</span></div>
            <div><span className="ta-cell-sub">Email</span><br /><span className="ta-cell-strong">{app.candidateEmail || '—'}</span></div>
            <div><span className="ta-cell-sub">Phone</span><br /><span className="ta-cell-strong">{app.candidatePhone || '—'}</span></div>
            <div><span className="ta-cell-sub">Assigned TA</span><br /><span className="ta-cell-strong">{app.assignedToName || 'Unassigned'}</span></div>
            <div><span className="ta-cell-sub">Applied</span><br /><span className="ta-cell-strong">{formatDate(app.createdAt)}</span></div>
            <div><span className="ta-cell-sub">Source</span><br /><span className="ta-cell-strong">{creationSourceLabel(app)}</span></div>
          </div>

          <div>
            <h3 className="ta-card__title" style={{ marginBottom: 8 }}>Resume</h3>
            <ResumeViewer resumePath={app.resumePath} resumeMeta={app.resumeMeta} />
          </div>

          <div>
            <h3 className="ta-card__title" style={{ marginBottom: 8 }}>Notes</h3>
            <NotesPanel applicationId={app.id} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
