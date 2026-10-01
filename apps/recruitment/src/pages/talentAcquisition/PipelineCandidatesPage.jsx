import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import DataGrid from '../../components/ta/DataGrid.jsx';
import Toolbar from '../../components/ta/Toolbar.jsx';
import Tag from '../../components/ta/Tag.jsx';
import Button from '../../components/ta/Button.jsx';
import PipelineDrawer from '../../components/ta/PipelineDrawer.jsx';
import PipelineFormModal from '../../components/ta/PipelineFormModal.jsx';
import MoveToJobModal from '../../components/ta/MoveToJobModal.jsx';
import { useCollectionView } from '../../hooks/useCollectionView.js';
import { useToast } from '../../context/ToastContext.jsx';
import { listPipelineCandidates, setPipelineArchived } from '../../api/pipeline.js';
import { pipelineStatus, PIPELINE_STATUS_TONE } from '../../utils/pipelineForm.js';
import { formatDate } from '../../utils/format.js';

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'position', label: 'Position', sortable: true },
  { key: 'organisation', label: 'Organisation', sortable: true },
  { key: 'totalExp', label: 'Total Exp', sortable: true },
  { key: 'relevantExp', label: 'Relevant Exp', sortable: true },
  { key: 'currentCtc', label: 'Current CTC', sortable: true },
  { key: 'expectedCtc', label: 'Expected CTC', sortable: true },
  { key: 'offerLabel', label: 'Offer in Hand', sortable: true },
  { key: 'noticeDays', label: 'Notice', sortable: true },
  { key: 'currentLocation', label: 'Current Location', sortable: true },
  { key: 'hiringLocation', label: 'Hiring Location', sortable: true },
  { key: 'expectedAvailability', label: 'Expected Availability', sortable: true },
  { key: 'statusLabel', label: 'Status', sortable: true },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'actions', label: '' },
];

const STATUS_OPTIONS = ['Active', 'Reminder Due', 'Moved to Job Candidate', 'Archived'];

/* Pipeline Candidates — the future-hiring pool. Click a row for the side
   drawer (details + activity timeline); "Move to Job Candidate" hands a
   candidate to the normal Job Candidates workflow for a chosen job. */
export default function PipelineCandidatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
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

      {rows === null ? (
        <div className="ta-cell-sub" style={{ padding: 24 }}>Loading…</div>
      ) : (
        <DataGrid
          columns={COLUMNS}
          rows={view.rows}
          sort={view.sort}
          onSort={view.onSort}
          pager={{ page: view.page, pageSize: view.pageSize, total: view.total, onPage: view.setPage }}
          empty={{ icon: 'Users', title: 'No pipeline candidates', message: all.length ? 'Try changing the filters or search.' : 'Add candidates you want to keep in touch with for future openings.' }}
          renderRow={(r) => (
            <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: 'pointer' }}>
              <td>
                <span className="ta-cell-cand__name">{r.name}</span><br />
                <span className="ta-cell-cand__sub">{r.code}</span>
              </td>
              <td className="ta-cell-strong">{r.position}</td>
              <td className="ta-cell-mute">{r.organisation}</td>
              <td className="ta-cell-mute">{r.totalExp} yrs</td>
              <td className="ta-cell-mute">{r.relevantExp} yrs</td>
              <td className="ta-cell-mute">{r.currentCtc}</td>
              <td className="ta-cell-mute">{r.expectedCtc}</td>
              <td className="ta-cell-mute">{r.offerLabel}</td>
              <td className="ta-cell-mute">{r.noticeDays} d</td>
              <td className="ta-cell-mute">{r.currentLocation}</td>
              <td className="ta-cell-mute">{r.hiringLocation}</td>
              <td className="ta-cell-mute">{formatDate(r.expectedAvailability)}</td>
              <td><Tag tone={PIPELINE_STATUS_TONE[r.statusLabel]}>{r.statusLabel}</Tag></td>
              <td className="ta-cell-mute">{formatDate(r.createdAt)}</td>
              <td>
                <span className="ta-rowactions" onClick={(e) => e.stopPropagation()}>
                  <button className="ta-iconbtn" onClick={() => setSelectedId(r.id)} aria-label={`View ${r.name}`} title="View details"><Icon name="Eye" size={15} /></button>
                  {r.status !== 'moved' && <button className="ta-iconbtn" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} title="Edit"><Icon name="Pencil" size={15} /></button>}
                  {r.status === 'active' && <button className="ta-iconbtn" onClick={() => setMoving(r)} aria-label={`Move ${r.name} to Job Candidate`} title="Move to Job Candidate"><Icon name="ArrowRightLeft" size={15} /></button>}
                  {r.status !== 'moved' && (
                    <button className="ta-iconbtn" onClick={() => toggleArchive(r)} aria-label={r.status === 'archived' ? `Restore ${r.name}` : `Archive ${r.name}`} title={r.status === 'archived' ? 'Restore' : 'Archive'}>
                      <Icon name={r.status === 'archived' ? 'ArchiveRestore' : 'Archive'} size={15} />
                    </button>
                  )}
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
