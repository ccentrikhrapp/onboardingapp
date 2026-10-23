import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import { WorkListGroup, WorkListRow } from '../../components/kit/WorkList.jsx';
import Icon from '../../components/common/Icon.jsx';
import { listVerifications } from '../../api/verification.js';

/* Group the flat document_verifications rows into one row per candidate
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
  const verifiedCount = groups.filter((g) => g.verified).length;
  const actionCount = groups.length - verifiedCount;

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
        <div className="hr-toolbar" style={{ marginBottom: 14 }}>
          <button type="button" className={`hr-filterchip${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>All ({groups.length})</button>
          <button type="button" className={`hr-filterchip${filter === 'verified' ? ' is-active' : ''}`} onClick={() => toggleFilter('verified')}>Verified ({verifiedCount})</button>
          <button type="button" className={`hr-filterchip${filter === 'action' ? ' is-active' : ''}`} onClick={() => toggleFilter('action')}>Action required ({actionCount})</button>
        </div>
      )}

      {groups.length > 0 && (
        <WorkListGroup title="Candidates" count={visibleGroups.length} empty="No candidates match this filter.">
          {visibleGroups.length > 0 && (
            <div className="hr-pipe">
              {visibleGroups.map((g) => (
                <WorkListRow
                  key={g.applicationId}
                  onClick={() => navigate(`/hr/applications/${g.applicationId}`)}
                  lead={g.candidateName || 'Candidate'}
                  sub={`${g.jobTitle} · ${g.applicationCode}`}
                  tag={<Tag tone={g.verified ? 'green' : g.rejected ? 'red' : 'amber'}>{g.verified ? 'Verified' : 'Action required'}</Tag>}
                  trail={(
                    <>
                      <span className="hr-cell-sub" style={{ whiteSpace: 'nowrap' }}>{g.approved}/{g.total} approved{g.rejected ? ` · ${g.rejected} need action` : ''}</span>
                      <Icon name="ChevronRight" size={16} />
                    </>
                  )}
                />
              ))}
            </div>
          )}
        </WorkListGroup>
      )}
    </>
  );
}
