import { useEffect, useState } from 'react';
import TAHeader from '../../components/ta/TAHeader.jsx';
import Card from '../../components/ta/Card.jsx';
import Tag from '../../components/ta/Tag.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { supabase } from '../../lib/supabase.js';
import { unwrap } from '../../api/client.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/common/States.jsx';

const CLASS_OPTIONS = [['mandatory', 'Mandatory'], ['conditional', 'Conditional'], ['optional', 'Optional']];
const GROUP_OF = {
  pan_card: 'Identity proof', aadhaar: 'Identity proof', passport: 'Identity proof',
  tenth_cert: 'Education', twelfth_cert: 'Education', degree_marksheets: 'Education',
  address_proof: 'Address proof', address_proof_permanent: 'Address proof',
  prev_offer_letter: 'Employment', prev_appointment_letter: 'Employment', prev_relieving_letter: 'Employment', payslips_3m: 'Employment', increment_letter: 'Employment', employment_history: 'Employment',
};

/* Super Admin: how each reference pre-offer document is treated once it applies to a candidate.
   Whether it applies at all (fresher, number of employers, same address, other offer…) is worked out
   automatically — these switches only decide how strict the review is. Row Level Security limits writes
   to Super Admin at the database, so this is not just a hidden page. */
export default function DocumentRulesPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => supabase.from('document_requirements').select('*').eq('stage', 'pre_offer').order('display_order').then(unwrap).then(setRows)
    .catch((e) => { toast.error(e.message || 'Could not load the rules.'); setRows([]); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const change = async (r, patch) => {
    setBusy(r.id);
    try {
      const { error } = await supabase.from('document_requirements').update(patch).eq('id', r.id);
      if (error) throw new Error('You need to be a Super Admin to change document rules.');
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      toast.success('Saved. New checklists use this; existing ones are not changed retroactively.');
    } catch (e) {
      toast.error(e.message);
    } finally { setBusy(null); }
  };

  const groups = rows ? [...new Set(rows.map((r) => GROUP_OF[r.key] || 'Other joining documents'))] : [];
  return (
    <>
      <TAHeader title="Document rules" subtitle="How each pre-offer document is treated when it applies to a candidate." />
      <Card title="Reference documents">
        <p className="ta-cell-sub" style={{ marginBottom: 10 }}>
          <strong>Mandatory</strong> must be resolved before the offer · <strong>Conditional</strong> applies only in some situations (previous-employer papers, cancelled cheque…) and must be resolved when it does ·
          <strong> Optional</strong> never blocks. PAN and Aadhaar are one requirement — either one satisfies it. "Cannot provide" lets a candidate give a reason for the team to accept.
        </p>
        {!rows ? <SkeletonBlock lines={6} /> : (
          <div className="ta-table-scroll">
            <table className="ta-table">
              <thead><tr><th>Document</th><th>Treated as</th><th>Cannot provide allowed</th><th>“Not applicable” allowed</th><th>HR sign-off</th><th>In use</th></tr></thead>
              <tbody>
                {groups.flatMap((g) => [
                  <tr key={`g-${g}`}><td colSpan={6} className="ta-cell-strong" style={{ background: 'var(--ta-blue-wash, #f3f6ff)' }}>{g}</td></tr>,
                  ...rows.filter((r) => (GROUP_OF[r.key] || 'Other joining documents') === g).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="ta-cell-strong">{r.name}</span>
                        {r.per_employer && <><br /><span className="ta-cell-sub">One per previous employer</span></>}
                        {r.any_of_group && <><br /><span className="ta-cell-sub">PAN or Aadhaar — either satisfies it</span></>}
                      </td>
                      <td>
                        <select className="ta-select" value={r.requirement_class} disabled={busy === r.id} onChange={(e) => change(r, { requirement_class: e.target.value })}>
                          {CLASS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td><input type="checkbox" checked={!!r.can_mark_cannot_provide} disabled={busy === r.id} onChange={(e) => change(r, { can_mark_cannot_provide: e.target.checked })} /></td>
                      <td><input type="checkbox" checked={!!r.na_allowed} disabled={busy === r.id} onChange={(e) => change(r, { na_allowed: e.target.checked })} /></td>
                      <td><input type="checkbox" checked={!!r.requires_hr_verification} disabled={busy === r.id} onChange={(e) => change(r, { requires_hr_verification: e.target.checked })} /></td>
                      <td>{r.active ? <Tag tone="green">Yes</Tag> : <Tag tone="grey">No</Tag>} <input type="checkbox" checked={!!r.active} disabled={busy === r.id} onChange={(e) => change(r, { active: e.target.checked })} aria-label={`Use ${r.name}`} /></td>
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
