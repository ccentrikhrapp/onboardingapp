import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import { listPipelineCandidates, pipelineFromDb } from '../../api/pipeline.js';

const norm = (v) => String(v ?? '').toLowerCase();
const matches = (row, fields, q) => fields.some((f) => norm(row[f]).includes(q));

/* Dashboard-wide search: one box, three groups of results (Jobs, Candidates,
   Pipeline), each field within a group searched — not just the title. Jobs
   and Candidates come from what the Dashboard already loaded; Pipeline is
   fetched once, the first time this box is used. */
export default function UniversalSearch({ jobs, apps }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pipeline, setPipeline] = useState(null); // null = not yet loaded
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const ensurePipeline = () => {
    if (pipeline !== null || loadingPipeline) return;
    setLoadingPipeline(true);
    listPipelineCandidates()
      .then((rows) => setPipeline((rows || []).map(pipelineFromDb)))
      .catch(() => setPipeline([]))
      .finally(() => setLoadingPipeline(false));
  };

  const q = norm(query).trim();
  const results = useMemo(() => {
    if (!q) return { jobsR: [], appsR: [], pipelineR: [] };
    const jobsR = (jobs || [])
      .filter((j) => matches(j, ['title', 'code', 'department', 'location', 'workMode', 'employmentType'], q))
      .slice(0, 5);
    const appsR = (apps || [])
      .filter((a) => matches(a, ['name', 'email', 'phone', 'code', 'candidateCode', 'jobTitle'], q))
      .slice(0, 5);
    const pipelineR = (pipeline || [])
      .filter((p) => matches(p, ['name', 'email', 'phone', 'code', 'position', 'organisation'], q))
      .slice(0, 5);
    return { jobsR, appsR, pipelineR };
  }, [q, jobs, apps, pipeline]);

  const totalResults = results.jobsR.length + results.appsR.length + results.pipelineR.length;

  const go = (path) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: '1 1 320px', maxWidth: 420 }}>
      <div className="ta-search ta-search--wide">
        <Icon name="Search" size={16} />
        <input
          value={query}
          placeholder="Search jobs, candidates, pipeline — any field…"
          onFocus={() => { setOpen(true); ensurePipeline(); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); ensurePipeline(); }}
        />
      </div>
      {open && q && (
        <div className="ta-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40, maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {totalResults === 0 && !loadingPipeline && (
            <div className="ta-cell-sub" style={{ padding: 10 }}>No matches in jobs, candidates or pipeline.</div>
          )}
          {results.jobsR.length > 0 && (
            <>
              <div className="ta-cell-sub" style={{ padding: '6px 8px', fontWeight: 600 }}>Jobs</div>
              {results.jobsR.map((j) => (
                <button key={j.id} type="button" className="ta-searchresult" onClick={() => go(`/ta/jobs/${j.id}`)}>
                  <span className="ta-cell-strong">{j.title}</span>
                  <span className="ta-cell-sub">{j.code} · {j.department} · {j.location}</span>
                </button>
              ))}
            </>
          )}
          {results.appsR.length > 0 && (
            <>
              <div className="ta-cell-sub" style={{ padding: '6px 8px', fontWeight: 600 }}>Candidates</div>
              {results.appsR.map((a) => (
                <button key={a.id} type="button" className="ta-searchresult" onClick={() => go(`/ta/candidates/${a.id}`)}>
                  <span className="ta-cell-strong">{a.name || a.email || 'Candidate'}</span>
                  <span className="ta-cell-sub">{a.candidateCode || a.code} · {a.jobTitle || 'General application'}</span>
                </button>
              ))}
            </>
          )}
          {results.pipelineR.length > 0 && (
            <>
              <div className="ta-cell-sub" style={{ padding: '6px 8px', fontWeight: 600 }}>Pipeline Candidates</div>
              {results.pipelineR.map((p) => (
                <button key={p.id} type="button" className="ta-searchresult" onClick={() => go(`/ta/pipeline?open=${p.id}`)}>
                  <span className="ta-cell-strong">{p.name}</span>
                  <span className="ta-cell-sub">{p.code} · {p.position}{p.organisation ? ` @ ${p.organisation}` : ''}</span>
                </button>
              ))}
            </>
          )}
          {loadingPipeline && <div className="ta-cell-sub" style={{ padding: 10 }}><span className="ta-spinner" /> Searching pipeline…</div>}
        </div>
      )}
    </div>
  );
}
