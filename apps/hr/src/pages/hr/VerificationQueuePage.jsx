import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
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

  useEffect(() => {
    let cancelled = false;
    listVerifications()
      .then((data) => !cancelled && setRows(data || []))
      .catch((e) => !cancelled && setError(e.message || 'Could not load the verification queue.'));
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => groupByApplication(rows || []), [rows]);

  return (
    <>
      <HRHeader title="Pre-Offer Verification Queue" subtitle="Candidates with documents awaiting HR verification." />

      {error && (
        <Card><p className="text-secondary">{error}</p></Card>
      )}

      {rows === null && !error && <div className="hr-loading">Loading…</div>}

      {rows !== null && groups.length === 0 && (
        <EmptyState
          icon="ClipboardCheck"
          title="Nothing to verify right now"
          message="Documents appear here automatically as soon as a candidate uploads them in the recruitment application."
        />
      )}

      <div className="hr-stack">
        {groups.map((g) => (
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
