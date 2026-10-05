import { useMemo, useState } from 'react';
import Icon from '../common/Icon.jsx';
import Tag from './Tag.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { reviewDocument } from '../../api/documents.js';
import { docStatusMeta, requiredSlots, slotLabel, summarizeDocuments, currentFilesBySlot } from '../../utils/documentRules.js';

const CLASS_TAG = { mandatory: ['Mandatory', 'red'], conditional: ['Conditional', 'blue'], optional: ['Optional', 'grey'] };
const GROUPS = [
  ['Identity proof', ['pan_card', 'aadhaar', 'passport']],
  ['Education', ['tenth_cert', 'twelfth_cert', 'degree_marksheets']],
  ['Address proof', ['address_proof', 'address_proof_permanent']],
  ['Employment', ['prev_offer_letter', 'prev_appointment_letter', 'prev_relieving_letter', 'payslips_3m', 'increment_letter', 'employment_history']],
  ['Other joining documents', ['passport_photos', 'cancelled_cheque', 'current_offer_letter', 'name_change_proof']],
];

/* TA's first pass, requirement by requirement. Approving passes the file — or the candidate's REASON for not
   providing it — on to HR for final sign-off. Verification is complete when every APPLICABLE mandatory /
   conditional requirement is resolved; optional and not-applicable ones never block, and PAN / Aadhaar is one
   requirement satisfied by either. */
export default function TADocumentReview({ docs, onReload, onView, onOpen }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [remarkFor, setRemarkFor] = useState(null); // { id, action }
  const [text, setText] = useState('');
  const summary = useMemo(() => summarizeDocuments(docs, new Set(docs.map((d) => d.document_requirements?.key)).size), [docs]);
  const notApplicable = docs.filter((d) => d.status === 'not_applicable' && d.document_requirements?.key !== 'employment_history');
  const done = summary.approved + summary.approvedWithReason;

  const act = async (d, action, remarks) => {
    setBusy(d.id);
    try {
      const res = await reviewDocument(d.id, action, remarks);
      toast.success(action === 'approve'
        ? (res.status === 'under_verification' ? 'Approved — sent to HR for final sign-off.' : 'Confirmed.')
        : action === 'mark_na' ? 'Marked not applicable.' : 'Sent back to the candidate.');
      setRemarkFor(null); setText('');
      onReload();
    } catch (e) {
      toast.error(e.message || 'Could not save that decision.');
    } finally { setBusy(null); }
  };

  const tiles = [
    ['Applicable requirements', summary.applicable], ['Approved', summary.approved], ['Approved with reason', summary.approvedWithReason],
    ['Pending review', summary.pendingReview + summary.reasonSubmitted], ['Not applicable', summary.notApplicable],
    ['Rejected', summary.rejected], ['Clarification required', summary.clarification], ['Not yet provided', summary.missing],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {tiles.map(([l, n]) => (
          <div key={l} style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div><div className="ta-cell-sub">{l}</div>
          </div>
        ))}
      </div>
      <div className={`ta-note ta-note--${summary.identityResolved ? 'ok' : 'info'}`}>
        <Icon name={summary.identityResolved ? 'CheckCircle2' : 'BadgeCheck'} size={14} />
        <span>{summary.identityResolved ? <strong>Identity Proof – Satisfied</strong> : <>Identity proof: PAN <em>or</em> Aadhaar — one approved is enough.</>}</span>
      </div>
      <p className="ta-cell-sub">
        {summary.ready ? <><strong>Every applicable requirement is resolved</strong> — {done} approved. The rest of the reference checklist isn't needed.</> : <>Still to resolve: {summary.unresolved.join(', ')}.</>}
      </p>

      {GROUPS.map(([title, keys]) => {
        const rows = docs.filter((d) => keys.includes(d.document_requirements?.key) && d.status !== 'not_applicable')
          .sort((a, b) => (a.document_requirements.display_order - b.document_requirements.display_order) || ((a.employer_index || 0) - (b.employer_index || 0)));
        if (!rows.length) return null;
        return (
          <div key={title}>
            <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>{title}</h4>
            <div className="ta-stack" style={{ gap: 6 }}>
              {rows.map((d) => {
                const req = d.document_requirements;
                const meta = docStatusMeta(d);
                const [cl, tone] = CLASS_TAG[req.requirement_class] || CLASS_TAG.optional;
                const slots = requiredSlots(req);
                const bySlot = currentFilesBySlot(req, d.document_files || []);
                const files = (d.document_files || []).filter((f) => f.is_current);
                const review = ['uploaded', 'cannot_provide'].includes(d.status);
                const isBusy = busy === d.id;
                const asking = remarkFor?.id === d.id;
                return (
                  <div key={d.id} className="ta-docrow" style={{ flexWrap: 'wrap' }}>
                    <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ta-cell-strong" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {req.name}{d.employer_label ? ` — ${d.employer_label}` : ''}
                        {d.status !== 'requested' && <Tag tone={tone}>{cl}</Tag>}{req.any_of_group && <Tag tone="grey">PAN or Aadhaar</Tag>}
                      </div>
                      {files.length > 0 && (
                        <div className="ta-cell-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {slots.length
                            ? slots.map((s) => bySlot[s] && <button key={s} type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onView(d, bySlot[s], slotLabel(req, s))}><Icon name="Eye" size={12} /> {slotLabel(req, s)}</button>)
                            : files.map((f, i) => <button key={i} type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onView(d, f, f.file_name)}><Icon name="Eye" size={12} /> {f.file_name || `File ${i + 1}`}</button>)}
                        </div>
                      )}
                      {d.cannot_provide_reason && d.status !== 'requested' && <div className="ta-cell-sub">{d.na_reason ? 'Not applicable — ' : 'Cannot provide — '}reason: {d.cannot_provide_reason}</div>}
                      {d.hr_remarks && ['revision_required', 'rejected'].includes(d.status) && <div className="ta-cell-sub" style={{ color: 'var(--tag-red-fg)' }}>Sent back: {d.hr_remarks}</div>}
                      {asking && (
                        <div className="cx-docreason" style={{ marginTop: 6 }}>
                          <textarea className="cx-docreason__input" rows={2} placeholder={remarkFor.action === 'reject' ? 'Why is this not acceptable?' : 'What does the candidate need to correct or clarify?'} value={text} onChange={(e) => setText(e.target.value)} />
                          <div className="cx-docreason__btns">
                            <button className="ta-btn ta-btn--sm" disabled={!text.trim() || isBusy} onClick={() => act(d, remarkFor.action, text.trim())}>Send</button>
                            <button className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => { setRemarkFor(null); setText(''); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    {!asking && (
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {review && <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onOpen?.(d)}><Icon name="Eye" size={13} /> Verify</button>}
                        {review && <button type="button" className="ta-btn ta-btn--sm" disabled={isBusy} onClick={() => act(d, 'approve')}><Icon name="CheckCircle2" size={13} /> {d.status === 'cannot_provide' ? 'Approve reason' : 'Approve'}</button>}
                        {review && <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" disabled={isBusy} onClick={() => { setRemarkFor({ id: d.id, action: 'reupload_required' }); setText(''); }}><Icon name="RotateCcw" size={13} /> Request clarification</button>}
                        {review && <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" disabled={isBusy} onClick={() => { setRemarkFor({ id: d.id, action: 'reject' }); setText(''); }}><Icon name="X" size={13} /> Reject</button>}
                        {['requested', 'revision_required', 'rejected', 'cannot_provide', 'uploaded'].includes(d.status) && (
                          <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" disabled={isBusy} onClick={() => act(d, 'mark_na')}>Mark not applicable</button>
                        )}
                        {d.status === 'under_verification' && <span className="ta-cell-sub">With HR</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {(() => {
        const eh = docs.find((d) => d.document_requirements?.key === 'employment_history' && d.status === 'not_applicable');
        return eh ? (
          <div className="ta-docrow" style={{ flexWrap: 'wrap' }}>
            <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
            <div className="grow"><div className="ta-cell-strong">Employment details</div><div className="ta-cell-sub">Not Applicable – Fresher</div></div>
            <button type="button" className="ta-btn ta-btn--sm" disabled={busy === eh.id} onClick={() => act(eh, 'approve')}>Confirm fresher status</button>
          </div>
        ) : null;
      })()}

      {notApplicable.length > 0 && (
        <details>
          <summary className="ta-cell-sub" style={{ cursor: 'pointer' }}>Not applicable to this candidate ({notApplicable.length})</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {notApplicable.map((d) => <li key={d.id} className="ta-cell-sub">{d.document_requirements.name} — {d.na_reason || 'Not applicable'}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
