import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Toolbar from '../../components/ta/Toolbar.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import EmptyState from '../../components/ta/EmptyState.jsx';
import CreateJobDrawer from '../../components/workflow/CreateJobDrawer.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { listApplications } from '../../api/applications.js';
import { formatDate } from '../../utils/format.js';

/* "4–7 years" -> 4, so we can bucket jobs by the experience they ask for. */
const minYears = (exp) => parseInt(exp, 10) || 0;
const EXPERIENCE = {
  junior: { label: '0–3 years', match: (n) => n <= 3 },
  mid: { label: '3–6 years', match: (n) => n > 3 && n <= 6 },
  senior: { label: '6+ years', match: (n) => n > 6 },
};

const APPLICANTS = {
  some: { label: 'Has applicants', match: (n) => n > 0 },
  none: { label: 'No applicants yet', match: (n) => n === 0 },
};

export default function TAJobsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { jobs, createJob, deleteJob, role } = useApp();
  const isSuperAdmin = role === 'admin';
  const [pickedJobs, setPickedJobs] = useState([]);
  // Every TA-workspace role can post a job; deleting a posting stays admin-tier
  // only (a Normal TA can create jobs but not remove or edit existing ones).
  const canCreateJobs = role === 'ta' || role === 'admin' || role === 'admin_ta';
  const canManageJobs = role === 'admin' || role === 'admin_ta';
  const [open, setOpen] = useState(false);
  const [appsByJob, setAppsByJob] = useState({});

  useEffect(() => {
    listApplications()
      .then((list) => {
        const counts = {};
        (list || []).forEach((a) => { if (a.job_id) counts[a.job_id] = (counts[a.job_id] || 0) + 1; });
        setAppsByJob(counts);
      })
      .catch(() => setAppsByJob({}));
  }, []);

  const rows = useMemo(
    () => jobs.map((j) => ({ ...j, applicants: appsByJob[j.id] || 0 })),
    [jobs, appsByJob]
  );

  const view = useCollectionView(rows, {
    searchFields: [
      'code', 'title', 'department', 'location', 'workMode', 'employmentType', 'experience', 'description',
      (j) => (j.requiredSkills || []).join(' '),
      (j) => (j.preferredSkills || []).join(' '),
      (j) => (j.qualifications || []).join(' '),
      (j) => (j.responsibilities || []).join(' '),
    ],
    pageSize: 30,
    initialSort: { key: 'applicants', dir: 'desc' },
  });

  // Build a dropdown's options from the values that actually appear in the data.
  const optionsFor = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
  const deptOptions = useMemo(() => optionsFor('department'), [rows]);
  const modeOptions = useMemo(() => optionsFor('workMode'), [rows]);
  const typeOptions = useMemo(() => optionsFor('employmentType'), [rows]);
  const locationOptions = useMemo(() => optionsFor('location'), [rows]);

  const strFilter = (key) => (typeof view.filters[key] === 'string' ? view.filters[key] : 'all');
  const activeDept = strFilter('department');
  const activeMode = strFilter('workMode');
  const activeType = strFilter('employmentType');
  const activeLocation = strFilter('location');

  const [exp, setExpKey] = useState('all');
  const setExp = (key) => {
    setExpKey(key);
    view.setFilter('exp', key === 'all' ? 'all' : (r) => EXPERIENCE[key].match(minYears(r.experience)));
  };
  const [applicants, setApplicantsKey] = useState('all');
  const setApplicants = (key) => {
    setApplicantsKey(key);
    view.setFilter('applicants', key === 'all' ? 'all' : (r) => APPLICANTS[key].match(r.applicants));
  };

  const chips = [
    activeDept !== 'all' && { key: 'dept', label: activeDept, onRemove: () => view.setFilter('department', 'all') },
    activeMode !== 'all' && { key: 'mode', label: activeMode, onRemove: () => view.setFilter('workMode', 'all') },
    activeType !== 'all' && { key: 'type', label: activeType, onRemove: () => view.setFilter('employmentType', 'all') },
    activeLocation !== 'all' && { key: 'loc', label: activeLocation, onRemove: () => view.setFilter('location', 'all') },
    exp !== 'all' && { key: 'exp', label: EXPERIENCE[exp].label, onRemove: () => setExp('all') },
    applicants !== 'all' && { key: 'app', label: APPLICANTS[applicants].label, onRemove: () => setApplicants('all') },
  ].filter(Boolean);

  const clearAll = () => {
    view.setFilter('department', 'all');
    view.setFilter('workMode', 'all');
    view.setFilter('employmentType', 'all');
    view.setFilter('location', 'all');
    setExp('all');
    setApplicants('all');
  };

  const totalApplicants = rows.reduce((sum, r) => sum + r.applicants, 0);

  const removeSelectedJobs = async () => {
    const ids = [...pickedJobs];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} job${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    let done = 0;
    for (const id of ids) {
      try { await deleteJob(id); done += 1; } catch { /* counted below */ }
    }
    setPickedJobs([]);
    if (done === ids.length) toast.success(`${done} job${done === 1 ? '' : 's'} deleted.`);
    else toast.error(`${done} of ${ids.length} deleted. The rest could not be deleted.`);
  };

  const removeJob = async (job) => {
    const ok = window.confirm(`Delete "${job.title}"? This can't be undone.`);
    if (!ok) return;
    try {
      await deleteJob(job.id);
      toast.success(`${job.title} deleted.`);
    } catch (e) {
      toast.error(e.message || 'Could not delete the job.');
    }
  };

  return (
    <>
      <TAHeader title="Jobs" subtitle={`${jobs.length} open positions · ${totalApplicants} applicants in total`} />

      <Toolbar
        search={{ value: view.query, onChange: view.setQuery, placeholder: 'Search by Job ID, title, department…' }}
        filters={[
          { label: 'Department', value: activeDept, onChange: (v) => view.setFilter('department', v), options: deptOptions },
          { label: 'Work mode', value: activeMode, onChange: (v) => view.setFilter('workMode', v), options: modeOptions },
          { label: 'Type', value: activeType, onChange: (v) => view.setFilter('employmentType', v), options: typeOptions },
          { label: 'Location', value: activeLocation, onChange: (v) => view.setFilter('location', v), options: locationOptions },
          { label: 'Experience', value: exp, onChange: setExp, options: Object.entries(EXPERIENCE).map(([value, g]) => ({ value, label: g.label })) },
          { label: 'Applicants', value: applicants, onChange: setApplicants, options: Object.entries(APPLICANTS).map(([value, g]) => ({ value, label: g.label })) },
        ]}
        chips={chips}
        onClearAll={chips.length > 1 ? clearAll : undefined}
        action={canCreateJobs ? <Button icon="Plus" onClick={() => setOpen(true)}>Create Job</Button> : undefined}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      {isSuperAdmin && pickedJobs.length > 0 && (
        <div className="ta-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="ta-cell-strong">{pickedJobs.length} selected</span>
          <Button variant="danger" icon="Trash2" onClick={removeSelectedJobs}>Delete selected</Button>
          <Button variant="ghost" onClick={() => setPickedJobs([])}>Clear selection</Button>
        </div>
      )}

      {view.rows.length === 0 ? (
        <EmptyState icon="Briefcase" title="No jobs found" message="Try a different search, or create a new job." />
      ) : (
        <div className="ta-jobgrid">
          {view.rows.map((j) => (
            <div key={j.id} className="ta-jobcard" onClick={() => navigate(`/ta/jobs/${j.id}`)} role="button" tabIndex={0}>
              {isSuperAdmin && (
                <input
                  type="checkbox" className="ta-jobcard__pick" aria-label={`Select ${j.title}`}
                  checked={pickedJobs.includes(j.id)} onClick={(e) => e.stopPropagation()}
                  onChange={() => setPickedJobs((p) => (p.includes(j.id) ? p.filter((x) => x !== j.id) : [...p, j.id]))}
                />
              )}
              <div className="ta-jobcard__head">
                <span className="ta-jobcard__icon"><Icon name="Briefcase" size={16} /></span>
                <span className="ta-jobcard__headactions">
                  {canManageJobs && (
                    <button
                      className="ta-iconbtn" aria-label="Delete job"
                      onClick={(e) => { e.stopPropagation(); removeJob(j); }}
                    ><Icon name="Trash2" size={14} /></button>
                  )}
                  <span className="ta-jobcard__see">See Details <Icon name="ChevronRight" size={12} /></span>
                </span>
              </div>
              <div className="ta-jobcard__title">{j.title} {j.custom && <Tag tone="blue">New</Tag>}</div>
              <div className="ta-jobcard__sub">
                {j.department}{j.requiredSkills?.length ? ` · ${j.requiredSkills.slice(0, 3).join(', ')}` : ''}
              </div>
              <div className="ta-jobcard__tags">
                {j.employmentType && <span className="ta-jobcard__tag"><Icon name="Clock3" size={11} /> {j.employmentType}</span>}
                {j.location && <span className="ta-jobcard__tag"><Icon name="MapPin" size={11} /> {j.location}</span>}
              </div>
              <div className="ta-jobcard__foot">
                <span className="ta-jobcard__date"><Icon name="CalendarDays" size={11} /> {formatDate(j.deadline)}</span>
                <Tag tone={j.applicants ? 'blue' : 'grey'}>{j.applicants} applicants</Tag>
              </div>
            </div>
          ))}
        </div>
      )}

      {view.total > view.pageSize && (
        <div className="ta-gridnav">
          <button type="button" className="ta-btn ta-btn--ghost" disabled={view.page <= 1} onClick={() => view.setPage(view.page - 1)}>
            <Icon name="ChevronLeft" size={15} /> Previous
          </button>
          <span className="ta-gridnav__pos">Page {view.page} of {Math.max(1, Math.ceil(view.total / view.pageSize))}</span>
          <button type="button" className="ta-btn ta-btn--ghost" disabled={view.page >= Math.ceil(view.total / view.pageSize)} onClick={() => view.setPage(view.page + 1)}>
            Next <Icon name="ChevronRight" size={15} />
          </button>
        </div>
      )}

      <CreateJobDrawer
        open={open}
        onClose={() => setOpen(false)}
        onCreate={async (payload) => {
          try {
            const job = await createJob(payload);
            setOpen(false);
            toast.success(`${job.title} published (${job.code || job.id}).`);
          } catch (e) {
            toast.error(e.message || 'Could not create the job.');
          }
        }}
      />
    </>
  );
}
