import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import DataGrid from '../../components/ta/DataGrid.jsx';
import Toolbar from '../../components/ta/Toolbar.jsx';
import Tag from '../../components/ta/Tag.jsx';
import Button from '../../components/ta/Button.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listApplications, subscribeApplications, assignApplications } from '../../api/applications.js';
import { listTAs } from '../../api/staff.js';
import { applicationFromDb } from '../../api/mappers.js';
import { APP_STATUS, stageBadgeForStatus } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';

/* Friendly stage buckets for the filter dropdown. */
const STAGE_GROUPS = {
  applied: { label: 'Applied', match: (s) => [APP_STATUS.SUBMITTED, APP_STATUS.RETURNED].includes(s) },
  screening: { label: 'Screening', match: (s) => s === APP_STATUS.TA_REVIEW },
  interview: { label: 'Interview', match: (s) => [APP_STATUS.INTERVIEW_PLANNING, APP_STATUS.INTERVIEW_IN_PROGRESS, APP_STATUS.INTERVIEW_PASSED].includes(s) },
  documents: { label: 'Documents', match: (s) => [APP_STATUS.DOC_VERIFICATION, APP_STATUS.DOCS_VERIFIED].includes(s) },
  offer: { label: 'Offer', match: (s) => [APP_STATUS.OFFER_DRAFT, APP_STATUS.OFFER_ISSUED, APP_STATUS.OFFER_ACCEPTED].includes(s) },
  hired: {
    label: 'Hired',
    match: (s) => [APP_STATUS.ONBOARDING_PENDING, APP_STATUS.HR_VERIFICATION, APP_STATUS.HR_VERIFICATION_REJECTED, APP_STATUS.JOINING_PENDING, APP_STATUS.EMPLOYEE].includes(s),
  },
  rejected: { label: 'Rejected', match: (s) => [APP_STATUS.REJECTED, APP_STATUS.INTERVIEW_FAILED].includes(s) },
};

const EXPERIENCE = {
  junior: { label: '0–3 years', match: (n) => n <= 3 },
  mid: { label: '3–6 years', match: (n) => n > 3 && n <= 6 },
  senior: { label: '6+ years', match: (n) => n > 6 },
};

const SOURCES = ['Direct', 'Job Board', 'Referral', 'Social'];

// Same notice-period options offered on the apply form, so the filter matches the stored values.
const NOTICE_PERIODS = ['Immediate', '15 days', '30 days', '45 days', '60 days', '90 days'];

function experienceLabel(n) {
  return n <= 0 ? 'Fresher' : `${n}+ Years`;
}

const COLUMNS = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'job', label: 'Job Applied', sortable: true },
  { key: 'experience', label: 'Experience', sortable: true },
  { key: 'status', label: 'Current Stage', sortable: true },
  { key: 'noticePeriod', label: 'Notice Period', sortable: true },
  { key: 'submittedAt', label: 'Applied On', sortable: true },
  { key: 'docs', label: 'Documents' },
  { key: 'actions', label: 'Actions' },
];

export default function TACandidatesPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { role } = useApp();
  const toast = useToast();
  const isSuperTa = role === 'admin'; // Super TA — master prompt §33-35, §74

  const [remoteRows, setRemoteRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listApplications()
        .then((list) => {
          if (cancelled) return;
          setRemoteRows(
            (list || []).map(applicationFromDb).map((a) => ({
              id: a.id,
              candidateId: a.id, // navigate by application id in production
              name: a.candidateName || `${a.personal.firstName || ''} ${a.personal.lastName || ''}`.trim(),
              email: a.candidateEmail,
              job: a.jobTitle,
              department: a.professional?.preferredJobLocation || 'General',
              experience: Number(a.professional?.totalExperience) || 0,
              source: a.source === 'ta_link' ? 'Referral' : 'Direct',
              noticePeriod: a.professional?.noticePeriod || 'Not specified',
              submittedAt: a.submittedAt,
              status: a.status,
              assignedTo: a.assignedTo,
              docs: { tone: 'grey', text: '—' },
            }))
          );
        })
        .catch(() => !cancelled && setRemoteRows([]));
    load();
    // Live refresh — a new application, or a status change, updates the table
    // without a manual reload (Phase 1 spec §49).
    const unsub = subscribeApplications(load);
    return () => { cancelled = true; unsub(); };
  }, []);

  const rows = remoteRows || [];

  const stageParam = STAGE_GROUPS[sp.get('stage')] ? sp.get('stage') : 'all';
  const jobParam = sp.get('job') || null;
  const noticeParam = sp.get('notice') || null; // set when arriving from the dashboard's notice-period chart
  const sourceParam = SOURCES.includes(sp.get('source')) ? sp.get('source') : null; // dashboard source donut
  const [stage, setStageKey] = useState(stageParam);
  const [experience, setExpKey] = useState('all');
  const [assignment, setAssignmentKey] = useState('all');

  // --- Super TA: unassigned queue + multi-assign (careers applications with
  // no job-owning TA land here until HR/admin routes them — §33-35). ---
  const [tas, setTas] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [assignTo, setAssignTo] = useState('');
  const [assigning, setAssigning] = useState(false);
  useEffect(() => {
    if (isSuperTa) listTAs().then(setTas).catch(() => setTas([]));
  }, [isSuperTa]);
  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const doAssign = async () => {
    if (!assignTo || selected.size === 0) return;
    setAssigning(true);
    try {
      const result = await assignApplications([...selected], assignTo);
      toast.success(`Assigned ${result.assigned} candidate${result.assigned === 1 ? '' : 's'}.`);
      setSelected(new Set());
      setAssignTo('');
    } catch (e) {
      toast.error(e.message || 'Could not assign the selected candidates.');
    } finally {
      setAssigning(false);
    }
  };

  const initialFilters = {};
  if (stageParam !== 'all') initialFilters.status = (r) => STAGE_GROUPS[stageParam].match(r.status);
  if (jobParam) initialFilters.job = jobParam;
  if (noticeParam) initialFilters.noticePeriod = noticeParam;
  if (sourceParam) initialFilters.source = sourceParam;

  const view = useCollectionView(rows, {
    searchFields: ['name', 'email', 'candidateId', 'job'],
    pageSize: 30,
    initialSort: { key: 'submittedAt', dir: 'desc' },
    initialFilters: Object.keys(initialFilters).length ? initialFilters : undefined,
  });

  const jobOptions = useMemo(
    () => [...new Set(rows.map((r) => r.job))].sort().map((j) => ({ value: j, label: j })),
    [rows]
  );

  const activeJob = typeof view.filters.job === 'string' ? view.filters.job : 'all';
  const activeSource = typeof view.filters.source === 'string' ? view.filters.source : 'all';
  const activeNotice = typeof view.filters.noticePeriod === 'string' ? view.filters.noticePeriod : 'all';

  const setStage = (key) => {
    setStageKey(key);
    view.setFilter('status', key === 'all' ? 'all' : (r) => STAGE_GROUPS[key].match(r.status));
  };
  const setExperience = (key) => {
    setExpKey(key);
    view.setFilter('experience', key === 'all' ? 'all' : (r) => EXPERIENCE[key].match(r.experience));
  };
  const setAssignment = (key) => {
    setAssignmentKey(key);
    view.setFilter('assignment', key === 'all' ? 'all' : (r) => !r.assignedTo);
  };

  // The dropdowns / search box already show what's active — no chip row,
  // just a "Clear filters" affordance.
  const hasFilters = stage !== 'all' || experience !== 'all' || activeJob !== 'all'
    || activeSource !== 'all' || activeNotice !== 'all' || assignment !== 'all' || !!view.query;

  const clearAll = () => {
    view.setQuery('');
    setStage('all');
    setExperience('all');
    setAssignment('all');
    view.setFilter('job', 'all');
    view.setFilter('source', 'all');
    view.setFilter('noticePeriod', 'all');
  };

  // Re-apply filters when the page is already open and the URL params change
  // (e.g. clicking a second dashboard tile). The first run is handled by initialFilters.
  const spKey = `${sp.get('stage') || ''}|${sp.get('job') || ''}|${sp.get('notice') || ''}|${sp.get('source') || ''}`;
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    setStage(stageParam);
    view.setFilter('job', jobParam || 'all');
    view.setFilter('noticePeriod', noticeParam || 'all');
    view.setFilter('source', sourceParam || 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  return (
    <>
      <TAHeader title="Candidates" subtitle="Manage and track candidates through the recruitment process." />

      <Toolbar
        filters={[
          { label: 'Stage', value: stage, onChange: setStage, options: Object.entries(STAGE_GROUPS).map(([value, g]) => ({ value, label: g.label })) },
          { label: 'Job', value: activeJob, onChange: (v) => view.setFilter('job', v), options: jobOptions },
          { label: 'Experience', value: experience, onChange: setExperience, options: Object.entries(EXPERIENCE).map(([value, g]) => ({ value, label: g.label })) },
          { label: 'Source', value: activeSource, onChange: (v) => view.setFilter('source', v), options: SOURCES.map((s) => ({ value: s, label: s })) },
          { label: 'Notice Period', value: activeNotice, onChange: (v) => view.setFilter('noticePeriod', v), options: NOTICE_PERIODS.map((n) => ({ value: n, label: n })) },
          ...(isSuperTa ? [{ label: 'Assignment', value: assignment, onChange: setAssignment, options: [{ value: 'unassigned', label: 'Unassigned' }] }] : []),
        ]}
        onClearAll={hasFilters ? clearAll : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      {isSuperTa && selected.size > 0 && (
        <div className="ta-note ta-note--info" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span>{selected.size} candidate{selected.size === 1 ? '' : 's'} selected</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="ta-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Assign to…</option>
              {tas.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
            </select>
            <Button onClick={doAssign} disabled={!assignTo || assigning}>{assigning ? 'Assigning…' : 'Assign'}</Button>
          </span>
        </div>
      )}

      <DataGrid
        columns={isSuperTa ? [{ key: 'select', label: '' }, ...COLUMNS] : COLUMNS}
        rows={view.rows}
        sort={view.sort}
        onSort={view.onSort}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
        empty={{ icon: 'Users', title: 'No candidates match', message: 'Try changing the filters or search.' }}
        renderRow={(r) => {
          const badge = stageBadgeForStatus(r.status);
          return (
            <tr key={r.id} onClick={() => navigate(`/ta/candidates/${r.candidateId}`)} style={{ cursor: 'pointer' }}>
              {isSuperTa && (
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} aria-label={`Select ${r.name}`} />
                </td>
              )}
              <td>
                <span className="ta-cell-cand__name">{r.name}</span><br />
                <span className="ta-cell-cand__sub">{r.email}</span>
              </td>
              <td>
                <span className="ta-cell-strong">{r.job}</span><br />
                <span className="ta-cell-sub">{r.department}</span>
              </td>
              <td className="ta-cell-mute">{experienceLabel(r.experience)}</td>
              <td><Tag tone={badge.tone}>{badge.label}</Tag></td>
              <td className="ta-cell-mute">{r.noticePeriod}</td>
              <td className="ta-cell-mute">{formatDate(r.submittedAt)}</td>
              <td>{r.docs.text === '—' ? <span className="ta-cell-mute">—</span> : <Tag tone={r.docs.tone}>{r.docs.text}</Tag>}</td>
              <td>
                <span className="ta-rowactions" onClick={(e) => e.stopPropagation()}>
                  <a className="ta-iconbtn" href={`mailto:${r.email}`} aria-label={`Email ${r.name}`}><Icon name="Mail" size={15} /></a>
                  <button className="ta-iconbtn" onClick={() => navigate(`/ta/candidates/${r.candidateId}`)} aria-label="Open candidate"><Icon name="ChevronRight" size={17} /></button>
                </span>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}
