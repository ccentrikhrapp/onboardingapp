import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import DataGrid from '../../components/ta/DataGrid.jsx';
import Toolbar from '../../components/ta/Toolbar.jsx';
import Tag from '../../components/ta/Tag.jsx';
import Button from '../../components/ta/Button.jsx';
import RowMenu from '../../components/ta/RowMenu.jsx';
import PipelineDrawer from '../../components/ta/PipelineDrawer.jsx';
import PipelineFormModal from '../../components/ta/PipelineFormModal.jsx';
import MoveToJobModal from '../../components/ta/MoveToJobModal.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { useToast } from '../../context/ToastContext.jsx';
import { listPipelineCandidates, setPipelineArchived, deletePipelineCandidates } from '../../api/pipeline.js';
import { useApp } from '../../context/AppContext.jsx';
import { pipelineStatus, PIPELINE_STATUS_TONE } from '../../utils/pipelineForm.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/common/States.jsx';

// Compact column set — everything else (offer in hand, hiring location,
// expected availability, added-by, activity history…) lives in the drawer
// that opens on row click, so the table never needs a horizontal scrollbar.
const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'position', label: 'Position', sortable: true },
  { key: 'experience', label: 'Experience' },
  { key: 'ctc', label: 'CTC (Current → Expected)' },
  { key: 'noticeDays', label: 'Notice', sortable: true },
  { key: 'currentLocation', label: 'Location', sortable: true },
  { key: 'statusLabel', label: 'Status', sortable: true },
  { key: 'actions', label: '' },
];

const STATUS_OPTIONS = ['Active', 'Reminder Due', 'Moved to Job Candidate', 'Archived'];

/* Pipeline Candidates — the future-hiring pool. Click a row for the side
   drawer (details + activity timeline); "Move to Job Candidate" hands a
   candidate to the normal Job Candidates workflow for a chosen job. */
export default function PipelineCandidatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { role } = useApp();
  const isSuperAdmin = role === 'admin';
  const [picked, setPicked] = useState([]);
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [selectedId, setSelectedId] = useState(sp.get('open'));
  const [editing, setEditing] = useState(null); // candidate | 'new'
  const [moving, setMoving] = useState(null);

  const load = () =>
    listPipelineCandidates()
      .then((list) => setRows(list.map((c) => ({
        ...c, statusLabel: pipelineStatus(c), offerLabel: c.offerInHand ? 'Yes' : 'No',
      }))))
      .catch(() => { setRows([]); toast.error('Could not load pipeline candidates.'); });
  const removeSelected = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} pipeline candidate${ids.length === 1 ? '' : 's'}? Their notes and history are deleted too. This can't be undone.`)) return;
    try {
      await deletePipelineCandidates(ids);
      toast.success(`${ids.length} candidate${ids.length === 1 ? '' : 's'} deleted.`);
      setPicked([]);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not delete the selected candidates.');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Opened from a reminder popup / bell notification (?open=<id>).
  useEffect(() => {
    const id = sp.get('open');
    if (id) setSelectedId(id);
  }, [sp]);

  const all = rows || [];
  const view = useCollectionView(all, {
    searchFields: ['name', 'email', 'phone', 'position', 'organisation', 'code'],
    pageSize: 25,
    initialSort: { key: 'createdAt', dir: 'desc' },
    // Archived candidates are hidden until the Status filter asks for them.
    initialFilters: { statusLabel: (r) => r.statusLabel !== 'Archived' },
  });

  const activeStatus = typeof view.filters.statusLabel === 'string' ? view.filters.statusLabel : 'all';
  const activeOffer = typeof view.filters.offerLabel === 'string' ? view.filters.offerLabel : 'all';
  const activeHiring = typeof view.filters.hiringLocation === 'string' ? view.filters.hiringLocation : 'all';
  const setStatus = (v) => view.setFilter('statusLabel', v === 'all' ? (r) => r.statusLabel !== 'Archived' : v);
  const hiringOptions = useMemo(
    () => [...new Set(all.map((r) => r.hiringLocation))].sort().map((l) => ({ value: l, label: l })),
    [all]
  );
  const hasFilters = activeStatus !== 'all' || activeOffer !== 'all' || activeHiring !== 'all' || !!view.query;
  const clearAll = () => {
    view.setQuery('');
    setStatus('all');
    view.setFilter('offerLabel', 'all');
    view.setFilter('hiringLocation', 'all');
  };

  const selected = all.find((r) => r.id === selectedId) || null;
  const closeDrawer = () => {
    setSelectedId(null);
    if (sp.get('open')) { sp.delete('open'); setSp(sp, { replace: true }); }
  };

  const toggleArchive = async (c) => {
    const archive = c.status !== 'archived';
    try {
      await setPipelineArchived(c.id, archive);
      toast.success(archive ? 'Candidate archived.' : 'Candidate restored to the pipeline.');
      load();
    } catch (err) {
      toast.error(err.message || 'Could not update this candidate.');
    }
  };

  return (
    <>
      <TAHeader title="Pipeline Candidates" subtitle="Candidates worth keeping warm for future openings — track notes, follow-ups and availability, then move them to a job." />

      <Toolbar
        search={{ value: view.query, onChange: view.setQuery, placeholder: 'Search name, email, phone, position…' }}
        filters={[
          { label: 'Status', value: activeStatus, onChange: setStatus, options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) },
          { label: 'Offer in Hand', value: activeOffer, onChange: (v) => view.setFilter('offerLabel', v), options: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] },
          { label: 'Hiring Location', value: activeHiring, onChange: (v) => view.setFilter('hiringLocation', v), options: hiringOptions },
        ]}
        onClearAll={hasFilters ? clearAll : undefined}
        action={(
          <span style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" icon="UploadCloud" onClick={() => navigate('/ta/pipeline/bulk-upload')}>Bulk Upload</Button>
            <Button icon="UserPlus" onClick={() => setEditing('new')}>Add Candidate</Button>
          </span>
        )}
        pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
      />

      {isSuperAdmin && picked.length > 0 && (
        <div className="ta-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="ta-cell-strong">{picked.length} selected</span>
          <Button variant="danger" icon="Trash2" onClick={removeSelected}>Delete selected</Button>
          <Button variant="ghost" onClick={() => setPicked([])}>Clear selection</Button>
        </div>
      )}

      {rows === null ? (
        <div style={{ padding: 24 }}><SkeletonBlock lines={3} /></div>
      ) : (
        <DataGrid
          columns={isSuperAdmin ? [{ key: '_pick', label: (
            <input type="checkbox" aria-label="Select all on this page"
              checked={view.rows.length > 0 && view.rows.every((r) => picked.includes(r.id))}
              onChange={(e) => setPicked(e.target.checked ? [...new Set([...picked, ...view.rows.map((r) => r.id)])] : picked.filter((id) => !view.rows.some((r) => r.id === id)))} />
          ) }, ...COLUMNS] : COLUMNS}
          rows={view.rows}
          sort={view.sort}
          onSort={view.onSort}
          pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
          empty={{ icon: 'Users', title: 'No pipeline candidates', message: all.length ? 'Try changing the filters or search.' : 'Add candidates you want to keep in touch with for future openings.' }}
          renderRow={(r) => (
            <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: 'pointer' }}>
              {isSuperAdmin && (
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.includes(r.id)}
                    onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                </td>
              )}
              <td>
                <span className="ta-cell-cand__name">{r.name}</span><br />
                <span className="ta-cell-cand__sub">{r.code}</span>
              </td>
              <td>
                <span className="ta-cell-strong">{r.position}</span><br />
                <span className="ta-cell-sub">{r.organisation}</span>
              </td>
              <td className="ta-cell-mute">{r.totalExp} yrs total · {r.relevantExp} yrs rel.</td>
              <td className="ta-cell-mute">{r.currentCtc} → {r.expectedCtc}{r.offerLabel === 'Yes' ? ' · offer in hand' : ''}</td>
              <td className="ta-cell-mute">{r.noticeDays} d</td>
              <td className="ta-cell-mute">{r.currentLocation}</td>
              <td><Tag tone={PIPELINE_STATUS_TONE[r.statusLabel]}>{r.statusLabel}</Tag></td>
              <td>
                <span className="ta-rowactions" onClick={(e) => e.stopPropagation()}>
                  <RowMenu items={[
                    ...(r.status !== 'moved' ? [{ label: 'Edit', icon: 'Pencil', onClick: () => setEditing(r) }] : []),
                    ...(r.status === 'active' ? [{ label: 'Move to Job Candidate', icon: 'ArrowRightLeft', onClick: () => setMoving(r) }] : []),
                    ...(r.status !== 'moved' ? [{
                      label: r.status === 'archived' ? 'Restore' : 'Archive',
                      icon: r.status === 'archived' ? 'ArchiveRestore' : 'Archive',
                      onClick: () => toggleArchive(r),
                    }] : []),
                  ]} />
                  <button className="ta-iconbtn" onClick={() => setSelectedId(r.id)} aria-label={`View ${r.name}`} title="View details"><Icon name="ChevronRight" size={17} /></button>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {selected && (
        <PipelineDrawer
          candidate={selected}
          onClose={closeDrawer}
          onEdit={() => setEditing(selected)}
          onMove={() => setMoving(selected)}
          onArchive={() => toggleArchive(selected)}
          onChanged={load}
        />
      )}

      {editing && (
        <PipelineFormModal
          open
          candidate={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); load(); setSelectedId(saved.id); }}
        />
      )}

      {moving && (
        <MoveToJobModal
          open
          candidate={moving}
          onClose={() => { setMoving(null); load(); }}
          onMoved={load}
        />
      )}
    </>
  );
}
