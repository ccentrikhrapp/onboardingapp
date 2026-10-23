import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import Icon from '../../components/common/Icon.jsx';
import { listVerifications } from '../../api/verification.js';

const STATUS_TONE = {
  pending: 'grey',
  under_review: 'amber',
  approved: 'green',
  rejected: 'red',
  reupload_required: 'amber',
};

/* Group the flat document_verifications rows into one card per candidate
   application — this is the "Pre-Offer Verification Queue" (docs/requirements/
   03-recruitment-hr-integration.md §10). */
function groupByApplication(rows) {
  const byApp = new Map();
  for (const r of rows) {
    if (!byApp.has(r.source_application_id)) {
      byApp.set(r.source_application_id, {
        applicationId: r.source_application_id,
        candidateName: r.candidate_name,
        jobTitle: r.job_title,
        applicationCode: r.application_code,
        docs: [],
      });
    }
    byApp.get(r.source_application_id).docs.push(r);
  }
  return [...byApp.values()].map((g) => {
    const total = g.docs.length;
    const approved = g.docs.filter((d) => d.status === 'approved').length;
    const rejected = g.docs.filter((d) => d.status === 'rejected' || d.status === 'reupload_required').length;
    const pending = total - approved - rejected;
    return { ...g, total, approved, rejected, pending, verified: approved === total };
  });
}

export default function VerificationQueuePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'verified' | 'action'

  useEffect(() => {
    let cancelled = false;
    listVerifications()
      .then((data) => !cancelled && setRows(data || []))
      .catch((e) => !cancelled && setError(e.message || 'Could not load the verification queue.'));
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => groupByApplication(rows || []), [rows]);
  const toggleFilter = (value) => setFilter((v) => (v === value ? 'all' : value));
  const visibleGroups = groups.filter((g) => {
    if (filter === 'verified') return g.verified;
    if (filter === 'action') return !g.verified;
    return true;
  });

  return (
    <>
      <HRHeader title="Pre-Offer Verification Queue" subtitle="Candidates with documents awaiting HR verification." />

      {error && (
        <Card><p className="text-secondary">{error}</p></Card>
      )}

      {rows === null && !error && (
        <div className="stack gap-3" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton-block" />)}
        </div>
      )}

      {rows !== null && groups.length === 0 && (
        <EmptyState
          icon="ClipboardCheck"
          title="Nothing to verify right now"
          message="Documents appear here automatically as soon as a candidate uploads them in the recruitment application."
        />
      )}

      {groups.length > 0 && (
        <StatBar
          items={[
            { icon: 'ClipboardCheck', accent: 'blue', label: 'Candidates', value: groups.length, active: filter === 'all', onClick: () => setFilter('all') },
            { icon: 'CheckCircle2', accent: 'green', label: 'Verified', value: groups.filter((g) => g.verified).length, active: filter === 'verified', onClick: () => toggleFilter('verified') },
            { icon: 'AlertTriangle', accent: 'amber', label: 'Action required', value: groups.filter((g) => !g.verified).length, active: filter === 'action', onClick: () => toggleFilter('action') },
          ]}
        />
      )}

      {groups.length > 0 && visibleGroups.length === 0 && (
        <Card><p className="hr-cell-mute">No candidates match this filter.</p></Card>
      )}

      <div className="hr-stack">
        {visibleGroups.map((g) => (
          <Card key={g.applicationId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="hr-cell-strong">{g.candidateName || 'Candidate'}</div>
                <div className="hr-cell-sub">{g.jobTitle} · {g.applicationCode}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="hr-cell-sub">{g.approved}/{g.total} approved{g.rejected ? ` · ${g.rejected} need action` : ''}</span>
                <Tag tone={g.verified ? 'green' : g.rejected ? 'red' : 'amber'}>
                  {g.verified ? 'Verified' : 'Action required'}
                </Tag>
                <Button variant="ghost" iconRight="ArrowRight" onClick={() => navigate(`/hr/applications/${g.applicationId}`)}>
                  Review
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
