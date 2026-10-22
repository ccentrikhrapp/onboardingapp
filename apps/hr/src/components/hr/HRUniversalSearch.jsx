import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon.jsx';

const norm = (v) => String(v ?? '').toLowerCase();
const matches = (row, fields, q) => fields.some((f) => norm(row[f]).includes(q));

/* Dashboard-wide search: one box, two groups of results (Candidates,
   Employees), same pattern as the recruitment app's UniversalSearch — both
   datasets are already loaded by the Dashboard, so no extra fetch here. */
export default function HRUniversalSearch({ cases, employees }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = norm(query).trim();
  const results = useMemo(() => {
    if (!q) return { casesR: [], employeesR: [] };
    const casesR = (cases || [])
      .filter((c) => matches(c, ['candidate_name', 'job_title', 'department'], q))
      .slice(0, 5);
    const employeesR = (employees || [])
      .filter((e) => matches(e, ['full_name', 'employee_code', 'designation'], q))
      .slice(0, 5);
    return { casesR, employeesR };
  }, [q, cases, employees]);

  const totalResults = results.casesR.length + results.employeesR.length;

  const go = (path) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <div className="hr-search hr-search--wide">
        <Icon name="Search" size={16} />
        <input
          value={query}
          placeholder="Search candidates, employees…"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
      </div>
      {open && q && (
        <div className="hr-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40, maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {totalResults === 0 && (
            <div className="hr-cell-sub" style={{ padding: 10 }}>No matches in candidates or employees.</div>
          )}
          {results.casesR.length > 0 && (
            <>
              <div className="hr-cell-sub" style={{ padding: '6px 8px', fontWeight: 600 }}>Candidates</div>
              {results.casesR.map((c) => (
                <button key={c.id} type="button" className="hr-searchresult" onClick={() => go(`/hr/candidates/${c.id}`)}>
                  <span className="hr-cell-strong">{c.candidate_name}</span>
                  <span className="hr-cell-sub">{c.job_title}{c.department ? ` · ${c.department}` : ''}</span>
                </button>
              ))}
            </>
          )}
          {results.employeesR.length > 0 && (
            <>
              <div className="hr-cell-sub" style={{ padding: '6px 8px', fontWeight: 600 }}>Employees</div>
              {results.employeesR.map((e) => (
                <button key={e.id} type="button" className="hr-searchresult" onClick={() => go(`/hr/employees/${e.id}`)}>
                  <span className="hr-cell-strong">{e.full_name}</span>
                  <span className="hr-cell-sub">{e.employee_code}{e.designation ? ` · ${e.designation}` : ''}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
