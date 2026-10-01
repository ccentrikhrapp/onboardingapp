import { useMemo, useRef, useState } from 'react';
import Icon from '../common/Icon.jsx';
import Button from '../ta/Button.jsx';
import Tag from '../ta/Tag.jsx';
import { Field, Input, Select, Textarea } from '../ta/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadDocumentFile, submitDocument, setDocumentAnswers } from '../../api/documents.js';
import { docStatusMeta, requiredSlots, slotLabel, summarizeDocuments, currentFilesBySlot } from '../../utils/documentRules.js';

const GROUPS = [
  ['Identity proof', ['pan_card', 'aadhaar', 'passport']],
  ['Education', ['tenth_cert', 'twelfth_cert', 'degree_marksheets']],
  ['Address proof', ['address_proof', 'address_proof_permanent']],
  ['Employment', ['prev_offer_letter', 'prev_appointment_letter', 'prev_relieving_letter', 'payslips_3m', 'increment_letter', 'employment_history']],
  ['Other joining documents', ['passport_photos', 'cancelled_cheque', 'current_offer_letter', 'name_change_proof']],
];
const CLASS_TAG = { mandatory: ['Required', 'red'], conditional: ['Applicable', 'blue'], optional: ['Optional', 'grey'] };
const LOCKED = ['uploaded', 'under_verification', 'verified', 'reason_approved', 'na_accepted', 'not_applicable'];
const YESNO = ['Yes', 'No'];

/* The document checklist is worked out from YOUR situation (fresher or experienced, how many previous
   employers, other offer, same address, name change). Only what applies to you is asked for; the rest is
   listed as not applicable. For any item you can upload, say you can't provide it (give a reason the team
   reviews), or — where allowed — say it doesn't apply. Progress counts only what applies. */
export default function PreOfferDocuments({ app, docs, onReload }) {
  const toast = useToast();
  const summary = useMemo(() => summarizeDocuments(docs, new Set(docs.map((d) => d.document_requirements?.key)).size), [docs]);
  const experienced = app.additional?.candidateType === 'experienced' || (app.additional?.candidateType == null && Number(app.professional?.totalExperience) > 0);
  const answers = app.additional?.docAnswers || {};
  const applicable = docs.filter((d) => d.status !== 'not_applicable');
  const notApplicable = docs.filter((d) => d.status === 'not_applicable');
  const [showNa, setShowNa] = useState(false);
  const done = summary.approved + summary.approvedWithReason;

  const tiles = [
    ['Applicable to you', summary.applicable], ['Submitted', summary.submitted], ['Approved', done],
    ['Pending review', summary.pendingReview], ['Cannot provide — reason submitted', summary.reasonSubmitted],
    ['Clarification / rejected', summary.clarification + summary.rejected], ['Not applicable', summary.notApplicable],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ta-note ta-note--info">
        <Icon name="Info" size={14} />
        <span>
          <strong>{experienced ? 'Experienced' : 'Fresher'}</strong> — you only need to deal with what applies to you. If a document isn't available, choose <em>Cannot provide</em> and give a reason; the team reviews each one.
        </span>
      </div>

      <div>
        <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>Documentation progress</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {tiles.map(([label, n]) => (
            <div key={label} style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div>
              <div className="ta-cell-sub">{label}</div>
            </div>
          ))}
        </div>
        {summary.ready && summary.applicable > 0 && <div className="ta-note ta-note--ok" style={{ marginTop: 8 }}><Icon name="CheckCircle2" size={14} /> <span>Everything that applies to you is approved.</span></div>}
      </div>

      <Questions app={app} answers={answers} experienced={experienced} onSaved={onReload} />

      <div className={`ta-note ta-note--${summary.identityResolved ? 'ok' : 'info'}`}>
        <Icon name={summary.identityResolved ? 'CheckCircle2' : 'BadgeCheck'} size={14} />
        <span>{summary.identityResolved ? <strong>Identity Proof – Satisfied</strong> : <><strong>Identity proof:</strong> provide your PAN <em>or</em> your Aadhaar — one is enough.</>}</span>
      </div>

      {GROUPS.map(([title, keys]) => {
        const rows = applicable.filter((d) => keys.includes(d.document_requirements?.key))
          .sort((a, b) => (a.document_requirements.display_order - b.document_requirements.display_order) || ((a.employer_index || 0) - (b.employer_index || 0)));
        if (!rows.length) return null;
        return (
          <div key={title}>
            <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>{title}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((d) => <DocCard key={d.id} doc={d} appId={app.id} identityResolved={summary.identityResolved} onDone={onReload} toast={toast} />)}
            </div>
          </div>
        );
      })}

      {notApplicable.length > 0 && (
        <div>
          <button type="button" className="ta-link" onClick={() => setShowNa((v) => !v)}>{showNa ? 'Hide' : 'Show'} what doesn’t apply to you ({notApplicable.length})</button>
          {showNa && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {notApplicable.map((d) => <li key={d.id} className="ta-cell-sub">{d.document_requirements.name} — Not Applicable{d.na_reason ? ` (${d.na_reason})` : ''}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Questions({ app, answers, experienced, onSaved }) {
  const toast = useToast();
  const [employers, setEmployers] = useState(() => (answers.previousEmployers?.length ? answers.previousEmployers.map((e) => e.name || '') : ['']));
  const [other, setOther] = useState(answers.holdingOtherOffer || '');
  const [same, setSame] = useState(answers.permanentSameAsCurrent || '');
  const [nameChanged, setNameChanged] = useState(answers.nameChanged || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = {};
      if (experienced) body.previousEmployers = employers.map((n) => ({ name: n.trim() })).filter((e, i, a) => e.name || a.length === 1);
      if (other) body.holdingOtherOffer = other;
      if (same) body.permanentSameAsCurrent = same;
      if (nameChanged) body.nameChanged = nameChanged;
      await setDocumentAnswers(body);
      toast.success('Saved — your document list is updated.');
      onSaved();
    } catch (e) {
      toast.error(e.message || 'Could not save your answers.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
      <div className="ta-cell-strong" style={{ marginBottom: 8 }}>A few questions so we ask only for what applies</div>
      {experienced && (
        <div style={{ marginBottom: 10 }}>
          <div className="ta-field__label" style={{ marginBottom: 4 }}>Your previous employers ({Math.max(1, employers.filter(Boolean).length || 1)})</div>
          {employers.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <Input value={n} placeholder={`Employer ${i + 1} name`} onChange={(e) => setEmployers((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
              {employers.length > 1 && <button type="button" className="ta-iconbtn" aria-label="Remove employer" onClick={() => setEmployers((l) => l.filter((_, j) => j !== i))}><Icon name="X" size={14} /></button>}
            </div>
          ))}
          {employers.length < 10 && <Button variant="ghost" icon="Plus" onClick={() => setEmployers((l) => [...l, ''])}>Add previous employer</Button>}
          <div className="ta-cell-sub" style={{ marginTop: 4 }}>You get one set of documents (offer, appointment, relieving letter, payslips) per employer — not more.</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <Field label="Are you holding any other offer letter?"><Select value={other} placeholder="Select" options={YESNO} onChange={(e) => setOther(e.target.value)} /></Field>
        <Field label="Permanent address same as current address?"><Select value={same} placeholder="Select" options={YESNO} onChange={(e) => setSame(e.target.value)} /></Field>
        <Field label="Has your name changed since your documents were issued?"><Select value={nameChanged} placeholder="Select" options={YESNO} onChange={(e) => setNameChanged(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 8 }}><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save answers'}</Button></div>
    </div>
  );
}

function DocCard({ doc, appId, identityResolved, onDone, toast }) {
  const req = doc.document_requirements;
  const meta = docStatusMeta(doc);
  const [clsLabel, clsTone] = CLASS_TAG[req.requirement_class] || CLASS_TAG.optional;
  const slots = requiredSlots(req);
  const bySlot = currentFilesBySlot(req, doc.document_files || []);
  const allFiles = (doc.document_files || []).filter((f) => f.is_current);
  const locked = LOCKED.includes(doc.status);
  const attention = ['revision_required', 'rejected'].includes(doc.status);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('upload');
  const [category, setCategory] = useState('');
  const [text, setText] = useState(doc.cannot_provide_reason || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const single = useRef(null);
  const accept = (req.allowed_file_types || []).map((t) => `.${t}`).join(',');

  const send = async (payload, okMsg) => {
    setBusy(true); setErr('');
    try {
      await submitDocument({ applicationDocumentId: doc.id, ...payload });
      if (okMsg) toast.success(okMsg);
      setOpen(false);
      onDone();
    } catch (e) {
      setErr(e.fields?.reason || e.message || 'Could not save.');
    } finally { setBusy(false); }
  };

  const upload = async (files, slot = null) => {
    if (!files?.length) return;
    setBusy(true); setErr('');
    try {
      const list = [...files].slice(0, slots.length ? 1 : req.multiple_files ? 20 : 1);
      for (let i = 0; i < list.length; i++) {
        const up = await uploadDocumentFile(appId, req, list[i]);
        await submitDocument({ applicationDocumentId: doc.id, ...up, slot, replace: i === 0 && (attention || !allFiles.length) });
      }
      toast.success(`${req.name} uploaded.`);
      onDone();
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally { setBusy(false); }
  };

  const title = doc.employer_label ? `${req.name} — ${doc.employer_label}` : req.name;
  const hidePan = req.any_of_group && identityResolved && !['verified', 'na_accepted'].includes(doc.status);

  return (
    <div style={{ border: `1px solid ${attention ? 'var(--tag-red-fg, #dc2626)' : 'var(--ta-line, #e5e7eb)'}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="FileText" size={15} />
        <strong style={{ flex: 1, minWidth: 180, fontSize: 13 }}>{title}</strong>
        {doc.status !== 'requested' && <Tag tone={clsTone}>{clsLabel}</Tag>}
        <Tag tone={meta.tone}>{hidePan ? 'Not needed — identity satisfied' : meta.label}</Tag>
      </div>
      {req.description && doc.status === 'requested' && <div className="ta-cell-sub" style={{ marginTop: 4 }}>{req.description}</div>}
      {doc.hr_remarks && attention && <div className="ta-note ta-note--warn" style={{ marginTop: 8 }}><Icon name="AlertTriangle" size={14} /> <span><strong>Reviewer:</strong> {doc.hr_remarks}</span></div>}
      {allFiles.length > 0 && <div className="ta-cell-sub" style={{ marginTop: 4 }}>Uploaded: {allFiles.map((f) => f.file_name || 'file').join(', ')}</div>}
      {doc.cannot_provide_reason && doc.status !== 'requested' && <div className="ta-cell-sub" style={{ marginTop: 4 }}>Your reason: {doc.cannot_provide_reason}</div>}

      {!locked && !open && (
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" icon={doc.status === 'requested' ? 'Upload' : 'RefreshCw'} onClick={() => { setOpen(true); setChoice(doc.status === 'cannot_provide' ? 'cannot_provide' : 'upload'); }}>
            {doc.status === 'requested' ? 'Provide' : 'Update'}
          </Button>
        </div>
      )}

      {!locked && open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label className="ta-check"><input type="radio" checked={choice === 'upload'} onChange={() => setChoice('upload')} /> <span>Upload document</span></label>
            {req.can_mark_cannot_provide && <label className="ta-check"><input type="radio" checked={choice === 'cannot_provide'} onChange={() => setChoice('cannot_provide')} /> <span>Cannot provide</span></label>}
            {req.na_allowed && <label className="ta-check"><input type="radio" checked={choice === 'not_applicable'} onChange={() => setChoice('not_applicable')} /> <span>Not applicable</span></label>}
          </div>

          {choice === 'upload' ? (
            slots.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {slots.map((s) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 12.5, minWidth: 110 }}>{slotLabel(req, s)}</strong>
                    <span className="ta-cell-sub" style={{ flex: 1 }}>{bySlot[s] ? bySlot[s].file_name : 'Not uploaded yet'}</span>
                    <label className="ta-btn ta-btn--ghost ta-btn--sm" style={{ cursor: 'pointer' }}>
                      <Icon name="Upload" size={13} /> {bySlot[s] ? 'Replace' : 'Upload'}
                      <input type="file" hidden accept={accept} disabled={busy} onChange={(e) => { upload(e.target.files, s); e.target.value = ''; }} />
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <input ref={single} type="file" hidden multiple={!!req.multiple_files} accept={accept} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                <Button variant="ghost" icon="Upload" disabled={busy} onClick={() => single.current?.click()}>{req.multiple_files ? 'Choose files' : 'Choose file'}</Button>
                <span className="ta-cell-sub" style={{ marginLeft: 8 }}>{req.multiple_files ? 'You can attach several files — they are reviewed together as one requirement.' : `${(req.allowed_file_types || []).join(', ').toUpperCase()} · up to ${req.max_file_size_mb || 10} MB`}</span>
              </div>
            )
          ) : (
            <>
              {choice === 'cannot_provide' && (
                <Field label={`Reason for not providing ${req.name.toLowerCase()}`} required>
                  <Select value={category} placeholder="Select a reason" options={req.reason_options?.length ? req.reason_options : ['Document not available', 'Other']} onChange={(e) => setCategory(e.target.value)} />
                </Field>
              )}
              <Field label="Please explain" required hint="A short, honest explanation — it is reviewed like a document.">
                <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              <div>
                <Button
                  disabled={busy || text.trim().length < 5 || (choice === 'cannot_provide' && !category)}
                  onClick={() => send(choice === 'not_applicable'
                    ? { notApplicable: true, reason: text.trim() }
                    : { cannotProvide: true, reason: category ? `${category} — ${text.trim()}` : text.trim() }, 'Saved — the team will review it.')}
                >{busy ? 'Saving…' : 'Submit'}</Button>
              </div>
            </>
          )}
          {err && <div className="ta-field__error"><Icon name="AlertCircle" size={12} /> {err}</div>}
          <div><Button variant="ghost" onClick={() => { setOpen(false); setErr(''); }} disabled={busy}>Close</Button></div>
        </div>
      )}
    </div>
  );
}
