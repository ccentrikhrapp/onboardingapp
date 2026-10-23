import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import HRHeader from '../../components/kit/HRHeader.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import DataGrid from '../../components/kit/DataGrid.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import Tag from '../../components/kit/Tag.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { listOnboardingCases } from '../../api/onboarding.js';
import { listAllOnboardingDocuments } from '../../api/onboardingDocuments.js';
import { ONBOARDING_STATUSES, statusMeta } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/kit/Skeleton.jsx';

const STAGE_FILTERS = [
  { key: 'onboarding_initiated', label: 'Initiated' },
  { key: 'documents_pending', label: 'Documents' },
  { key: 'formalities_pending', label: 'Formalities' },
  { key: 'ready_for_joining', label: 'Joining' },
  { key: 'employee_created', label: 'Employee' },
];

const COLUMNS = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'position', label: 'Position', sortable: true },
  { key: 'hrStatus', label: 'Onboarding Stage', sortable: true },
  { key: 'joiningDate', label: 'Joining', sortable: true },
  { key: 'actions', label: '' },
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
        docs: rejected ? { tone: 'red', text: `${rejected} rejected` }
          : docs.length && verified === docs.length ? { tone: 'green', text: 'All verified' }
          : verified ? { tone: 'amber', text: `${verified}/${docs.length} verified` }
          : { tone: 'grey', text: '—' },
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

  const kpis = [
    { icon: 'Users', accent: 'blue', label: 'Onboarding candidates', value: rows.length, onClick: () => setStage('all') },
    { icon: 'FileSearch', accent: 'amber', label: 'Documents pending', value: rows.filter((r) => ['onboarding_initiated', 'documents_pending', 'documents_submitted', 'verification_in_progress'].includes(r.hrStatus)).length, onClick: () => setStage('documents_pending') },
    { icon: 'CalendarClock', accent: 'violet', label: 'Ready for joining', value: rows.filter((r) => r.hrStatus === 'ready_for_joining' || r.hrStatus === 'joining_confirmed').length, onClick: () => setStage('ready_for_joining') },
    { icon: 'UserRoundCheck', accent: 'green', label: 'Onboarded', value: rows.filter((r) => ['employee_created', 'completed'].includes(r.hrStatus)).length, onClick: () => setStage('employee_created') },
  ];

  if (remote.loading) return <SkeletonPage />;

  return (
    <>
      <HRHeader title="Candidates" subtitle="Candidates who have accepted an offer and are onboarding." />

      <StatBar items={kpis} />

      <Toolbar
        filters={[
          { label: 'Stage', value: stage, onChange: setStage, options: STAGE_FILTERS.map((s) => ({ value: s.key, label: s.label })) },
          { label: 'Department', value: activeDept, onChange: (v) => view.setFilter('department', v), options: deptOptions },
        ]}
        onClearAll={hasFilters ? clearAll : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      <DataGrid
        columns={COLUMNS}
        rows={view.rows}
        sort={view.sort}
        onSort={view.onSort}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
        empty={{ icon: 'Users', title: 'No candidates onboarding yet', message: 'Candidates appear here once a TA marks an offer accepted.' }}
        renderRow={(r) => {
          const meta = statusMeta(r.hrStatus);
          return (
            <tr key={r.id} onClick={() => navigate(`/hr/candidates/${r.id}`)} style={{ cursor: 'pointer' }}>
              <td>
                <span className="hr-cell-strong">{r.name}</span><br />
                <span className="hr-cell-sub">{r.department}</span>
              </td>
              <td className="hr-cell-mute">{r.position}</td>
              <td>
                <Tag tone={meta.tone}>{meta.label}</Tag>
                {r.docsIssue && <div className="hr-cell-sub" style={{ marginTop: 2, color: 'var(--tag-red-fg)' }}>Document rejected</div>}
              </td>
              <td className="hr-cell-mute">
                {r.joiningDate ? <span><Icon name="CalendarCheck" size={13} /> {formatDate(r.joiningDate)}</span> : 'Not set'}
              </td>
              <td>
                <span onClick={(e) => e.stopPropagation()}>
                  <button className="hr-iconbtn" onClick={() => navigate(`/hr/candidates/${r.id}`)} aria-label="Open candidate">
                    <Icon name="ChevronRight" size={17} />
                  </button>
                </span>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}
