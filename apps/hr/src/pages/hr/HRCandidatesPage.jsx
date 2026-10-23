import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import Tag from '../../components/kit/Tag.jsx';
import { WorkListGroup, WorkListRow } from '../../components/kit/WorkList.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { listOnboardingCases } from '../../api/onboarding.js';
import { listAllOnboardingDocuments } from '../../api/onboardingDocuments.js';
import { ONBOARDING_STATUSES, statusMeta } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';
import { SkeletonPage } from '../../components/kit/Skeleton.jsx';

const STAGE_FILTERS = [
  { key: 'onboarding_initiated', label: 'Initiated' },
  { key: 'documents_pending', label: 'Documents' },
  { key: 'formalities_pending', label: 'Formalities' },
  { key: 'ready_for_joining', label: 'Joining' },
  { key: 'employee_created', label: 'Employee' },
];

export default function HRCandidatesPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [remote, setRemote] = useState({ loading: true, cases: [], docs: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listOnboardingCases(), listAllOnboardingDocuments()])
      .then(([cases, docs]) => !cancelled && setRemote({ loading: false, cases: cases || [], docs: docs || [] }))
      .catch(() => !cancelled && setRemote({ loading: false, cases: [], docs: [] }));
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const docsByCase = {};
    remote.docs.forEach((d) => {
      (docsByCase[d.onboarding_case_id] ||= []).push(d);
    });
    return remote.cases.map((c) => {
      const docs = docsByCase[c.id] || [];
      const verified = docs.filter((d) => d.status === 'verified').length;
      const rejected = docs.filter((d) => d.status === 'rejected').length;
      return {
        id: c.id,
        name: c.candidate_name,
        position: c.job_title,
        department: c.department || 'General',
        joiningDate: c.joining_date,
        hrStatus: c.status,
        hrRank: ONBOARDING_STATUSES.indexOf(c.status),
        docsIssue: rejected > 0,
      };
    });
  }, [remote]);

  const stageParam = STAGE_FILTERS.some((s) => s.key === sp.get('stage')) ? sp.get('stage') : 'all';
  const deptParam = sp.get('dept') || null;
  const [stage, setStageKey] = useState(stageParam);

  const initialFilters = {};
  if (stageParam !== 'all') {
    const rank = ONBOARDING_STATUSES.indexOf(stageParam);
    initialFilters.hrRank = (r) => r.hrRank >= rank;
  }
  if (deptParam) initialFilters.department = deptParam;

  const view = useCollectionView(rows, {
    searchFields: ['name'],
    pageSize: 30,
    initialSort: { key: 'name', dir: 'asc' },
    initialFilters,
  });

  const deptOptions = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort().map((d) => ({ value: d, label: d })),
    [rows]
  );
  const activeDept = typeof view.filters.department === 'string' ? view.filters.department : 'all';

  const setStage = (key) => {
    setStageKey(key);
    const rank = ONBOARDING_STATUSES.indexOf(key);
    view.setFilter('hrRank', key === 'all' ? 'all' : (r) => r.hrRank >= rank);
  };

  const hasFilters = stage !== 'all' || activeDept !== 'all';
  const clearAll = () => { setStage('all'); view.setFilter('department', 'all'); };

  if (remote.loading) return <SkeletonPage />;

  return (
    <>
      <HRHeader title="Candidates" subtitle="Candidates who have accepted an offer and are onboarding." />

      <Toolbar
        filters={[
          { label: 'Stage', value: stage, onChange: setStage, options: STAGE_FILTERS.map((s) => ({ value: s.key, label: s.label })) },
          { label: 'Department', value: activeDept, onChange: (v) => view.setFilter('department', v), options: deptOptions },
        ]}
        onClearAll={hasFilters ? clearAll : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      <WorkListGroup
        title="Onboarding candidates"
        count={view.total}
        empty="No candidates onboarding yet — candidates appear here once a TA marks an offer accepted."
      >
        {view.rows.length > 0 && (
          <div className="hr-pipe">
            {view.rows.map((r) => {
              const meta = statusMeta(r.hrStatus);
              return (
                <WorkListRow
                  key={r.id}
                  onClick={() => navigate(`/hr/candidates/${r.id}`)}
                  lead={r.name}
                  sub={`${r.position} · ${r.department}${r.docsIssue ? ' · document rejected' : ''}`}
                  tag={<Tag tone={meta.tone}>{meta.label}</Tag>}
                  trail={(
                    <>
                      <span className="hr-cell-sub" style={{ whiteSpace: 'nowrap' }}>
                        {r.joiningDate ? <><Icon name="CalendarCheck" size={13} /> {formatDate(r.joiningDate)}</> : 'Joining not set'}
                      </span>
                      <Icon name="ChevronRight" size={16} />
                    </>
                  )}
                />
              );
            })}
          </div>
        )}
      </WorkListGroup>
    </>
  );
}
