import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import DataGrid from '../../components/ta/DataGrid.jsx';
import CandidateBoard from '../../components/ta/CandidateBoard.jsx';
import CandidatePreviewDrawer from '../../components/ta/CandidatePreviewDrawer.jsx';
import Toolbar from '../../components/ta/Toolbar.jsx';
import Tag from '../../components/ta/Tag.jsx';
import Button from '../../components/ta/Button.jsx';
import RowMenu from '../../components/ta/RowMenu.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listApplications, subscribeApplications, assignApplications, deleteApplication, decideApplication } from '../../api/applications.js';
import { listTAs } from '../../api/staff.js';
import { applicationFromDb } from '../../api/mappers.js';
import { APP_STATUS, stageBadgeForStatus } from '../../constants/statuses.js';

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

const STAGE_COLOR = {
  applied: 'var(--ta-pastel-blue)',
  screening: 'var(--ta-pastel-lavender)',
  interview: 'var(--ta-pastel-amber)',
  documents: 'var(--ta-pastel-peach)',
  offer: 'var(--ta-pastel-pink)',
  hired: 'var(--ta-pastel-green)',
  rejected: '#C84F2F',
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


/* A TA-created candidate must click the verification link before their
   application is real (see verify-ta-candidate) — everyone else (public
   apply) has nothing to verify. */
function verificationStatus(row) {
  if (row.rawSource !== 'ta_sourced') return { label: 'Not Required', tone: 'grey' };
  return row.status === 'DRAFT' ? { label: 'Pending Verification', tone: 'amber' } : { label: 'Verified', tone: 'green' };
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

// [dateFrom, dateTo) as ISO instants for the server-side created_at filter — local calendar days.
function dateRangeFor(preset, customFrom, customTo) {
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = startOfDay(new Date());
  if (preset === 'today') return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
  if (preset === 'yesterday') return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
  if (preset === '7d') return { from: addDays(today, -6).toISOString(), to: addDays(today, 1).toISOString() };
  if (preset === '30d') return { from: addDays(today, -29).toISOString(), to: addDays(today, 1).toISOString() };
  if (preset === 'custom' && customFrom && customTo) {
    return { from: startOfDay(customFrom).toISOString(), to: addDays(startOfDay(customTo), 1).toISOString() };
  }
  return { from: null, to: null };
}

// Compact column set — Candidate ID, email, phone, application ID,
// creation source and created date all still show, just inside the
// quick-view drawer (the Eye icon / clicking a board card) instead of
// widening the table into a horizontal scrollbar.
const COLUMNS = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'job', label: 'Job Applied', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'assignedToName', label: 'Assigned TA' },
  { key: 'verification', label: 'Verification Status' },
  { key: 'actions', label: '' },
];

export default function TACandidatesPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { role } = useApp();
  const toast = useToast();
  const isSuperTa = role === 'admin' || role === 'admin_ta'; // admin-tier — master prompt §33-35, §74

  const [viewMode, setViewMode] = useState('table'); // 'table' | 'board'
  const [previewId, setPreviewId] = useState(null);
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from: dateFrom, to: dateTo } = datePreset === 'all' ? { from: null, to: null } : dateRangeFor(datePreset, customFrom, customTo);

  const [remoteRows, setRemoteRows] = useState(null);
  // Bumped after a Kanban drag succeeds, to force a reload independent of
  // the realtime subscription below (which needs Postgres replication
  // enabled for this table — not guaranteed in every local environment).
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listApplications({ dateFrom, dateTo })
        .then((list) => {
          if (cancelled) return;
          setRemoteRows(
            (list || []).map(applicationFromDb).map((a) => ({
              id: a.id,
              candidateId: a.id, // navigate by application id in production
              name: a.candidateName || `${a.personal.firstName || ''} ${a.personal.lastName || ''}`.trim(),
              email: a.candidateEmail,
              phone: a.candidatePhone,
              candidateCode: a.candidateCode || '—',
              code: a.code,
              job: a.jobTitle,
              department: a.professional?.preferredJobLocation || 'General',
              experience: Number(a.professional?.totalExperience) || 0,
              rawSource: a.source,
              createdVia: a.additional?.createdVia || null,
              source: a.source === 'ta_link' ? 'Referral' : 'Direct',
              noticePeriod: a.professional?.noticePeriod || 'Not specified',
              submittedAt: a.submittedAt,
              createdAt: a.createdAt,
              status: a.status,
              atsScore: a.atsScore?.overall ?? null,
              assignedTo: a.assignedTo,
              assignedToName: a.assignedToName || '—',
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
  }, [dateFrom, dateTo, reloadToken]);

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

  const doDelete = async (row) => {
    const ok = window.confirm(`Permanently delete ${row.name}'s application? This removes the application and everything attached to it — documents, interviews, offer. This can't be undone.`);
    if (!ok) return;
    try {
      await deleteApplication(row.id);
      setRemoteRows((prev) => (prev || []).filter((r) => r.id !== row.id));
      toast.success('Application deleted.');
    } catch (e) {
      toast.error(e.message || 'Could not delete this application.');
    }
  };

  // Kanban drag — only the two transitions that are a single, no-extra-info
  // backend call (the same ones the "Advance candidate" button on the
  // profile page performs). Anything else (skipping a column, going
  // backward, or a stage that needs real data like an interview time or
  // an offer) is refused — those have to go through the candidate record,
  // where the right form/validation actually lives.
  const [draggingBusy, setDraggingBusy] = useState(false);
  // Why a target column needs more than a drag — each of these transitions
  // genuinely requires data a drop can't supply (a date, a document
  // decision, offer terms…), so the real form lives on the candidate record.
  const COLUMN_ORDER = ['applied', 'screening', 'interview', 'documents', 'offer', 'hired', 'rejected'];
  const WHY_NOT_DRAGGABLE = {
    interview: 'moving a candidate past Screening into Interview needs the interview round itself to be marked passed first',
    documents: 'unlocking Documents needs the interview round recorded as passed, which happens on the candidate record',
    offer: 'sending an offer needs offer details (designation, CTC, joining date) entered on the candidate record',
    hired: 'marking someone hired needs the offer to actually be accepted first',
  };
  const handleDropCard = async (row, targetColKey) => {
    if (draggingBusy) return;
    const currentCol = COLUMN_ORDER.find((k) => STAGE_GROUPS[k].match(row.status));
    const fromIdx = COLUMN_ORDER.indexOf(currentCol);
    const toIdx = COLUMN_ORDER.indexOf(targetColKey);

    let action = null;
    if (targetColKey === 'screening' && [APP_STATUS.SUBMITTED, APP_STATUS.RETURNED].includes(row.status)) action = 'start_review';
    else if (targetColKey === 'interview' && row.status === APP_STATUS.TA_REVIEW) action = 'advance';

    if (!action) {
      let reason;
      if (targetColKey === currentCol) reason = `${row.name} is already in ${STAGE_GROUPS[targetColKey].label}.`;
      else if (targetColKey === 'rejected') reason = `Rejecting a candidate needs a reason — open ${row.name}'s record and use Close application.`;
      else if (toIdx < fromIdx) reason = `Can't move ${row.name} backward from ${STAGE_GROUPS[currentCol]?.label || 'their current stage'} to ${STAGE_GROUPS[targetColKey].label} by dragging.`;
      else if (toIdx > fromIdx + 1) reason = `Can't skip stages — ${WHY_NOT_DRAGGABLE[targetColKey] || 'open the candidate record to move them that far'}.`;
      else reason = `Can't move to ${STAGE_GROUPS[targetColKey].label} by dragging — ${WHY_NOT_DRAGGABLE[targetColKey] || 'open the candidate record to complete this step'}.`;
      toast.error(reason);
      return;
    }
    setDraggingBusy(true);
    try {
      await decideApplication(row.id, action);
      toast.success(`${row.name} moved to ${STAGE_GROUPS[targetColKey].label}.`);
      setReloadToken((t) => t + 1);
    } catch (e) {
      toast.error(e.message || 'Could not move this candidate.');
    } finally {
      setDraggingBusy(false);
    }
  };

  const initialFilters = {};
  if (stageParam !== 'all') initialFilters.status = (r) => STAGE_GROUPS[stageParam].match(r.status);
  if (jobParam) initialFilters.job = jobParam;
  if (noticeParam) initialFilters.noticePeriod = noticeParam;
  if (sourceParam) initialFilters.source = sourceParam;

  const view = useCollectionView(rows, {
    searchFields: ['name', 'email', 'phone', 'candidateCode', 'code', 'job', 'department', 'source', 'noticePeriod', 'assignedToName', 'status'],
    pageSize: 30,
    initialSort: { key: 'submittedAt', dir: 'desc' },
    initialFilters: Object.keys(initialFilters).length ? initialFilters : undefined,
  });

  // Prefill from the top account bar's search (?q=…), once.
  const qParam = sp.get('q');
  const qAppliedRef = useRef(false);
  useEffect(() => {
    if (qParam && !qAppliedRef.current) {
      qAppliedRef.current = true;
      view.setQuery(qParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

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
    || activeSource !== 'all' || activeNotice !== 'all' || assignment !== 'all' || datePreset !== 'all' || !!view.query;

  const clearAll = () => {
    view.setQuery('');
    setStage('all');
    setExperience('all');
    setAssignment('all');
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
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
      <TAHeader title="Job Candidates" subtitle="Manage and track candidates through the recruitment process for open jobs." />

      <Toolbar
        search={{ value: view.query, onChange: view.setQuery, placeholder: 'Search by name, email, phone, Candidate ID, Application ID…' }}
        filters={[
          { label: 'Stage', value: stage, onChange: setStage, options: Object.entries(STAGE_GROUPS).map(([value, g]) => ({ value, label: g.label })) },
          { label: 'Job', value: activeJob, onChange: (v) => view.setFilter('job', v), options: jobOptions },
          { label: 'Experience', value: experience, onChange: setExperience, options: Object.entries(EXPERIENCE).map(([value, g]) => ({ value, label: g.label })) },
          { label: 'Source', value: activeSource, onChange: (v) => view.setFilter('source', v), options: SOURCES.map((s) => ({ value: s, label: s })) },
          { label: 'Notice Period', value: activeNotice, onChange: (v) => view.setFilter('noticePeriod', v), options: NOTICE_PERIODS.map((n) => ({ value: n, label: n })) },
          { label: 'Date', value: datePreset, onChange: setDatePreset, options: DATE_PRESETS },
          ...(isSuperTa ? [{ label: 'Assignment', value: assignment, onChange: setAssignment, options: [{ value: 'unassigned', label: 'Unassigned' }] }] : []),
        ]}
        onClearAll={hasFilters ? clearAll : undefined}
        action={(
          <span style={{ display: 'flex', gap: 8 }}>
            <span className="ta-viewtoggle">
              <button type="button" className={`ta-viewtoggle__btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')} aria-label="List view" title="List view">
                <Icon name="List" size={15} />
              </button>
              <button type="button" className={`ta-viewtoggle__btn${viewMode === 'board' ? ' active' : ''}`} onClick={() => setViewMode('board')} aria-label="Board view" title="Board view">
                <Icon name="Kanban" size={15} />
              </button>
            </span>
            <Button variant="ghost" icon="UploadCloud" onClick={() => navigate('/ta/candidates/bulk-upload')}>Bulk Upload</Button>
            <Button icon="UserPlus" onClick={() => navigate('/ta/candidates/new')}>Add Candidate</Button>
          </span>
        )}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      {datePreset === 'custom' && (
        <div className="ta-toolbar" style={{ marginTop: -6, marginBottom: 12 }}>
          <label className="ta-cell-sub">From <input type="date" className="ta-select" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
          <label className="ta-cell-sub">To <input type="date" className="ta-select" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
        </div>
      )}

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

      {viewMode === 'board' ? (
        <CandidateBoard
          columns={Object.entries(STAGE_GROUPS).map(([key, g]) => ({ key, label: g.label, match: g.match, color: STAGE_COLOR[key] }))}
          rows={view.allFiltered}
          onOpen={(r) => setPreviewId(r.candidateId)}
          onDropCard={handleDropCard}
        />
      ) : (
      <DataGrid
        columns={isSuperTa ? [{ key: 'select', label: '' }, ...COLUMNS] : COLUMNS}
        rows={view.rows}
        loading={remoteRows === null}
        sort={view.sort}
        onSort={view.onSort}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
        empty={{ icon: 'Users', title: 'No candidates match', message: 'Try changing the filters or search.' }}
        renderRow={(r) => {
          const badge = r.status === 'DRAFT'
            ? { label: 'Verification Pending', tone: 'amber' }
            : stageBadgeForStatus(r.status);
          const verification = verificationStatus(r);
          return (
            <tr key={r.id} onClick={() => navigate(`/ta/candidates/${r.candidateId}`)} style={{ cursor: 'pointer' }}>
              {isSuperTa && (
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} aria-label={`Select ${r.name}`} />
                </td>
              )}
              <td>
                <span className="ta-cell-cand__name">{r.name}</span><br />
                <span className="ta-cell-cand__sub">{experienceLabel(r.experience)} · {r.candidateCode}</span>
              </td>
              <td>
                <span className="ta-cell-strong">{r.job}</span><br />
                <span className="ta-cell-sub">{r.department}</span>
              </td>
              <td><Tag tone={badge.tone}>{badge.label}</Tag></td>
              <td className="ta-cell-mute">{r.assignedToName}</td>
              <td><Tag tone={verification.tone}>{verification.label}</Tag></td>
              <td>
                <span className="ta-rowactions" onClick={(e) => e.stopPropagation()}>
                  <RowMenu items={[
                    { label: 'Quick view', icon: 'Eye', onClick: () => setPreviewId(r.candidateId) },
                    { label: 'Email', icon: 'Mail', onClick: () => { window.location.href = `mailto:${r.email}`; } },
                    ...(isSuperTa ? [{ label: 'Delete', icon: 'Trash2', danger: true, onClick: () => doDelete(r) }] : []),
                  ]} />
                  <button className="ta-iconbtn" onClick={() => navigate(`/ta/candidates/${r.candidateId}`)} aria-label="Open candidate"><Icon name="ChevronRight" size={17} /></button>
                </span>
              </td>
            </tr>
          );
        }}
      />
      )}

      {previewId && (
        <CandidatePreviewDrawer applicationId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </>
  );
}
