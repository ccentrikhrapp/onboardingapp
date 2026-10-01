import { useEffect, useState } from 'react';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listDocConfig, updateDocConfig } from '../../api/joining.js';

const CLASS_OPTIONS = [['critical', 'Mandatory'], ['conditional', 'Conditional'], ['optional', 'Optional']];

/* Super Admin: how each reference joining document is treated. The reference
   list is NOT "every employee must give everything" — the joining form works
   out what applies to each person; these switches decide how strictly each
   document is treated when it does apply. No code change needed. */
export default function DocumentRulesPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    listDocConfig().then((r) => setRows(r.config)).catch((e) => { toast.error(e.message || 'Could not load the rules.'); setRows([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = async (key, changes) => {
    setBusy(key);
    try {
      const r = await updateDocConfig(key, changes);
      setRows(r.config);
      toast.success('Saved.');
    } catch (e) {
      toast.error(e.message || 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  };

  const groups = rows ? [...new Set(rows.map((r) => r.group))] : [];
  return (
    <>
      <HRHeader title="Document rules" subtitle="How each joining document is treated when it applies to an employee." />
      <Card title="Reference documents">
        <p className="hr-cell-sub" style={{ marginBottom: 10 }}>
          <strong>Mandatory</strong> blocks approval until HR resolves it · <strong>Conditional</strong> applies only in some situations (e.g. previous-employer papers for experienced employees) · <strong>Optional</strong> never blocks.
          "Cannot provide" lets an employee give a reason for HR to accept. Whether a document applies at all (fresher, number of employers, same address…) is worked out automatically.
        </p>
        {!rows ? <div className="hr-loading">Loading…</div> : (
          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead><tr><th>Document</th><th>Treated as</th><th>Cannot provide allowed</th><th>“Not applicable” allowed</th><th>HR approval</th><th>Max files</th><th>In use</th></tr></thead>
              <tbody>
                {groups.flatMap((g) => [
                  <tr key={`g-${g}`}><td colSpan={7} className="hr-cell-strong" style={{ background: 'var(--hr-blue-wash, #f3f6ff)' }}>{g}</td></tr>,
                  ...rows.filter((r) => r.group === g).map((r) => (
                    <tr key={r.key}>
                      <td><span className="hr-cell-strong">{r.name}</span>{r.perEmployer && <><br /><span className="hr-cell-sub">One per previous employer</span></>}{r.anyOf && <><br /><span className="hr-cell-sub">Identity proof: PAN or Aadhaar (any one)</span></>}{r.dataOnly && <><br /><span className="hr-cell-sub">Filled from the form</span></>}</td>
                      <td>
                        <select className="hr-input" value={r.classification} disabled={busy === r.key} onChange={(e) => change(r.key, { classification: e.target.value })}>
                          {CLASS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td><input type="checkbox" checked={r.cannotProvide} disabled={busy === r.key || r.dataOnly} onChange={(e) => change(r.key, { cannotProvide: e.target.checked })} /></td>
                      <td><input type="checkbox" checked={r.naAllowed} disabled={busy === r.key} onChange={(e) => change(r.key, { naAllowed: e.target.checked })} /></td>
                      <td><input type="checkbox" checked={r.hrApproval} disabled={busy === r.key} onChange={(e) => change(r.key, { hrApproval: e.target.checked })} /></td>
                      <td>{r.dataOnly ? '—' : (
                        <input className="hr-input" type="number" min="1" max="30" style={{ width: 70 }} defaultValue={r.maxFiles} disabled={busy === r.key}
                          onBlur={(e) => { const n = Number(e.target.value); if (n !== r.maxFiles && n >= 1 && n <= 30) change(r.key, { maxFiles: n }); }} />
                      )}</td>
                      <td>{r.active ? <Tag tone="green">Yes</Tag> : <Tag tone="grey">No</Tag>} <input type="checkbox" checked={r.active} disabled={busy === r.key} onChange={(e) => change(r.key, { active: e.target.checked })} aria-label={`Use ${r.name}`} /></td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
