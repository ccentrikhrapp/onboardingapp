import { useEffect, useMemo, useRef, useState } from 'react';
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
const MARK_NA_ELIGIBLE = ['requested', 'revision_required', 'rejected', 'cannot_provide', 'uploaded'];

/* Compact "⋯ More" menu for the exception actions (Reject / Mark not
   applicable) — keeping them out of the row's main action line is what
   lets Approve read as the one obviously-primary action per row, instead
   of five equally-weighted buttons competing for attention. */
function DocRowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!items.length) return null;
  return (
    <span className="ta-rowmenu" ref={ref}>
      <button type="button" className="ta-rowmenu__btn" aria-haspopup="menu" aria-expanded={open} title="More actions" onClick={() => setOpen((v) => !v)}>
        <Icon name="MoreHorizontal" size={15} />
      </button>
      {open && (
        <span className="ta-rowmenu__panel" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`ta-rowmenu__item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} size={14} /> {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/* TA's first pass, requirement by requirement. Approving passes the file — or the candidate's REASON for not
   providing it — on to HR for final sign-off. Verification is complete when every APPLICABLE mandatory /
   conditional requirement is resolved; optional and not-applicable ones never block, and PAN / Aadhaar is one
   requirement satisfied by either. */
export default function TADocumentReview({ docs, onReload, onView, onOpen }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [remarkFor, setRemarkFor] = useState(null); // { id, action }
  const [text, setText] = useState('');
  const [resolveOpen, setResolveOpen] = useState(false);
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
    ['Applicable', summary.applicable], ['Approved', summary.approved], ['Approved w/ reason', summary.approvedWithReason],
    ['Pending', summary.pendingReview + summary.reasonSubmitted], ['Not applicable', summary.notApplicable],
    ['Rejected', summary.rejected], ['Clarification', summary.clarification], ['Not yet provided', summary.missing],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ta-docsum">
        {tiles.map(([l, n]) => (
          <div key={l} className="ta-docsum__tile">
            <div className="ta-docsum__n">{n}</div>
            <div className="ta-cell-sub">{l}</div>
          </div>
        ))}
      </div>

      <div className={`ta-note ta-note--${summary.identityResolved ? 'ok' : 'info'}`}>
        <Icon name={summary.identityResolved ? 'CheckCircle2' : 'BadgeCheck'} size={14} />
        <span>{summary.identityResolved ? <strong>Identity proof — satisfied</strong> : <>Identity proof: PAN <em>or</em> Aadhaar — one approved is enough.</>}</span>
      </div>

      {summary.ready ? (
        <p className="ta-cell-sub"><strong>Every applicable requirement is resolved</strong> — {done} approved. The rest of the reference checklist isn't needed.</p>
      ) : (
        <div>
          <button type="button" className={`ta-actmore${resolveOpen ? ' is-open' : ''}`} onClick={() => setResolveOpen((v) => !v)}>
            Still to resolve · {summary.unresolved.length} requirement{summary.unresolved.length === 1 ? '' : 's'}
            <Icon name="ChevronDown" size={14} />
          </button>
          {resolveOpen && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {summary.unresolved.map((u) => <li key={u} className="ta-cell-sub">{u}</li>)}
            </ul>
          )}
        </div>
      )}

      {GROUPS.map(([title, keys]) => {
        const rows = docs.filter((d) => keys.includes(d.document_requirements?.key) && d.status !== 'not_applicable')
          .sort((a, b) => (a.document_requirements.display_order - b.document_requirements.display_order) || ((a.employer_index || 0) - (b.employer_index || 0)));
        if (!rows.length) return null;
        return (
          <div key={title}>
            <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>{title}</h4>
            <div className="ta-stack" style={{ gap: 8 }}>
              {rows.map((d) => {
                const req = d.document_requirements;
                const meta = docStatusMeta(d);
                const [cl, tone] = CLASS_TAG[req.requirement_class] || CLASS_TAG.optional;
                const slots = requiredSlots(req);
                const bySlot = currentFilesBySlot(req, d.document_files || []);
                const files = (d.document_files || []).filter((f) => f.is_current);
                const review = ['uploaded', 'cannot_provide'].includes(d.status);
                const markNaEligible = MARK_NA_ELIGIBLE.includes(d.status);
                const isBusy = busy === d.id;
                const asking = remarkFor?.id === d.id;
                const menuItems = [];
                if (review) menuItems.push({ label: 'Reject', icon: 'X', danger: true, disabled: isBusy, onClick: () => setRemarkFor({ id: d.id, action: 'reject' }) });
                if (review && markNaEligible) menuItems.push({ label: 'Mark not applicable', icon: 'Circle', disabled: isBusy, onClick: () => act(d, 'mark_na') });
                return (
                  <div key={d.id} className="ta-docrow ta-docrow--wide">
                    <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ta-cell-strong" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {req.name}{d.employer_label ? ` — ${d.employer_label}` : ''}
                        {d.status !== 'requested' && <Tag tone={tone}>{cl}</Tag>}{req.any_of_group && <Tag tone="grey">PAN or Aadhaar</Tag>}
                      </div>
                      {files.length > 0 && (
                        <div className="ta-cell-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                          {slots.length
                            ? slots.map((s) => bySlot[s] && <button key={s} type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onView(d, bySlot[s], slotLabel(req, s))}><Icon name="Eye" size={12} /> {slotLabel(req, s)}</button>)
                            : files.map((f, i) => <button key={i} type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onView(d, f, f.file_name)}><Icon name="Eye" size={12} /> {f.file_name || `File ${i + 1}`}</button>)}
                        </div>
                      )}
                      {d.cannot_provide_reason && d.status !== 'requested' && <div className="ta-cell-sub" style={{ marginTop: 2 }}>{d.na_reason ? 'Not applicable — ' : 'Cannot provide — '}reason: {d.cannot_provide_reason}</div>}
                      {d.hr_remarks && ['revision_required', 'rejected'].includes(d.status) && <div className="ta-cell-sub" style={{ color: 'var(--tag-red-fg)', marginTop: 2 }}>Sent back: {d.hr_remarks}</div>}
                      {asking && (
                        <div className="cx-docreason" style={{ marginTop: 6 }}>
                          <textarea className="cx-docreason__input" rows={2} placeholder={remarkFor.action === 'reject' ? 'Why is this not acceptable?' : 'What does the candidate need to correct or clarify?'} value={text} onChange={(e) => setText(e.target.value)} />
                          <div className="cx-docreason__btns">
                            <button className="ta-btn ta-btn--primary ta-btn--sm" disabled={!text.trim() || isBusy} onClick={() => act(d, remarkFor.action, text.trim())}>Send</button>
                            <button className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => { setRemarkFor(null); setText(''); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="ta-docrow__right">
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      {!asking && (
                        <span className="ta-docrow__actions">
                          {review ? (
                            <>
                              <button type="button" className="ta-btn ta-btn--primary ta-btn--sm" disabled={isBusy} onClick={() => act(d, 'approve')}>
                                <Icon name="CheckCircle2" size={13} /> {d.status === 'cannot_provide' ? 'Approve reason' : 'Approve'}
                              </button>
                              <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" onClick={() => onOpen?.(d)}>
                                <Icon name="Eye" size={13} /> Verify
                              </button>
                              <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" disabled={isBusy} onClick={() => { setRemarkFor({ id: d.id, action: 'reupload_required' }); setText(''); }}>
                                <Icon name="RotateCcw" size={13} /> Clarify
                              </button>
                              <DocRowMenu items={menuItems} />
                            </>
                          ) : markNaEligible ? (
                            <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm" disabled={isBusy} onClick={() => act(d, 'mark_na')}>Mark not applicable</button>
                          ) : null}
                          {d.status === 'under_verification' && <span className="ta-cell-sub">With HR</span>}
                        </span>
                      )}
                    </div>
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
          <div className="ta-docrow">
            <span className="ta-docrow__icon"><Icon name="FileText" size={15} /></span>
            <div className="grow"><div className="ta-cell-strong">Employment details</div><div className="ta-cell-sub">Not Applicable – Fresher</div></div>
            <button type="button" className="ta-btn ta-btn--primary ta-btn--sm" disabled={busy === eh.id} onClick={() => act(eh, 'approve')}>Confirm fresher status</button>
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
