import { useRef, useState } from 'react';
import Icon from '../../common/Icon.jsx';
import Button from '../../ta/Button.jsx';
import Tag from '../../ta/Tag.jsx';
import { Field, Select, Textarea } from '../../ta/Field.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { submitJoiningDocument, uploadJoiningFile } from '../../../api/joining.js';

const CLASS_TAG = { critical: ['Required', 'red'], conditional: ['Applicable', 'blue'], optional: ['Optional', 'grey'] };
const LOCKED = ['approved', 'approved_with_reason', 'na_accepted'];

/* The document list is worked out from YOUR answers: a fresher isn't asked
   for previous-employment papers, one previous employer means one set, and so
   on. Anything that doesn't apply is shown collapsed at the bottom. For each
   item you can upload, say you can't provide it (with a reason HR reviews), or
   — where allowed — say it doesn't apply. Progress counts only what applies. */
export default function JoiningDocumentsStep({ documents, applicationId, disabled, onUpdated }) {
  const { items, summary, identityResolved, employmentType, previousEmployers } = documents;
  const groups = [...new Set(items.filter((i) => i.applicability !== 'not_applicable').map((i) => i.group))];
  const notApplicable = items.filter((i) => i.applicability === 'not_applicable');
  const [showNa, setShowNa] = useState(false);
  const done = summary.approved + summary.approvedWithReason;

  const tiles = [
    ['Applicable to you', summary.applicable], ['Submitted', summary.submitted], ['Approved', done],
    ['Pending HR review', summary.pendingReview], ['Cannot provide — reason submitted', summary.reasonSubmitted],
    ['Clarification / rejected', summary.clarification + summary.rejected], ['Not applicable', summary.notApplicable],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ta-note ta-note--info">
        <Icon name="Info" size={14} />
        <span>
          <strong>{employmentType}</strong>{employmentType === 'Experienced' ? ` · ${previousEmployers} previous employer${previousEmployers === 1 ? '' : 's'}` : ''}.
          {' '}You only need to deal with what applies to you — the rest of the checklist is shown as not applicable. If a document isn't available, choose <em>Cannot provide</em> and give a reason; HR reviews each one.
        </span>
      </div>

      <div>
        <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>Joining documentation progress</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {tiles.map(([label, n]) => (
            <div key={label} style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div>
              <div className="ta-cell-sub">{label}</div>
            </div>
          ))}
        </div>
        {documents.approvedAt && <div className="ta-note ta-note--ok" style={{ marginTop: 8 }}><Icon name="CheckCircle2" size={14} /> <span>HR has approved your joining documentation.</span></div>}
      </div>

      <div className={`ta-note ta-note--${identityResolved ? 'ok' : 'info'}`}>
        <Icon name={identityResolved ? 'CheckCircle2' : 'BadgeCheck'} size={14} />
        <span>{identityResolved ? <strong>Identity Proof – Satisfied</strong> : <><strong>Identity proof:</strong> provide your PAN <em>or</em> your Aadhaar — one is enough.</>}</span>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <h4 className="ta-card__title" style={{ margin: '0 0 6px' }}>{g}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.filter((i) => i.group === g && i.applicability !== 'not_applicable').map((it) => (
              <DocItem key={it.itemKey} item={it} applicationId={applicationId} disabled={disabled} onUpdated={onUpdated} identityResolved={identityResolved} />
            ))}
          </div>
        </div>
      ))}

      {notApplicable.length > 0 && (
        <div>
          <button type="button" className="ta-link" onClick={() => setShowNa((v) => !v)}>
            {showNa ? 'Hide' : 'Show'} what doesn’t apply to you ({notApplicable.length})
          </button>
          {showNa && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {notApplicable.map((i) => <li key={i.itemKey} className="ta-cell-sub">{i.name} — {i.status === 'na_accepted' ? 'Not required for this employee' : `Not Applicable${i.naReason ? ` (${i.naReason})` : ''}`}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DocItem({ item, applicationId, disabled, onUpdated, identityResolved }) {
  const toast = useToast();
  const locked = LOCKED.includes(item.status) || disabled || item.dataOnly;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(item.choice || 'upload');
  const [files, setFiles] = useState([]);
  const [reasonCategory, setReasonCategory] = useState(item.reasonCategory || '');
  const [reasonText, setReasonText] = useState(item.reasonText || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef(null);
  const [clsLabel, clsTone] = CLASS_TAG[item.classification];
  const attention = ['clarification_required', 'rejected'].includes(item.status);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      let uploaded;
      if (choice === 'upload') {
        if (!files.length) throw Object.assign(new Error('Choose at least one file.'), { fields: {} });
        uploaded = await Promise.all(files.map((f) => uploadJoiningFile(applicationId, item.itemKey, f)));
      }
      const res = await submitJoiningDocument({ itemKey: item.itemKey, choice, files: uploaded, reasonCategory, reasonText });
      onUpdated(res);
      setOpen(false);
      setFiles([]);
      toast.success('Saved. HR will review it.');
    } catch (e) {
      setErr(e.fields?.reasonCategory || e.fields?.reasonText || e.fields?.files || e.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${attention ? 'var(--tag-red-fg, #dc2626)' : 'var(--ta-line, #e5e7eb)'}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="FileText" size={15} />
        <strong style={{ flex: 1, minWidth: 180, fontSize: 13 }}>{item.name}</strong>
        {item.status !== 'awaiting' && <Tag tone={clsTone}>{clsLabel}</Tag>}
        <Tag tone={item.tone}>{item.anyOf && identityResolved && !item.resolved ? 'Not needed — identity satisfied' : item.label}</Tag>
      </div>
      {item.hint && <div className="ta-cell-sub" style={{ marginTop: 4 }}>{item.hint}</div>}
      {item.dataOnly && <div className="ta-cell-sub" style={{ marginTop: 4 }}>Taken from your Employment step — nothing to upload.</div>}
      {item.hrRemarks && attention && <div className="ta-note ta-note--warn" style={{ marginTop: 8 }}><Icon name="AlertTriangle" size={14} /> <span><strong>HR:</strong> {item.hrRemarks}</span></div>}
      {item.files.length > 0 && <div className="ta-cell-sub" style={{ marginTop: 4 }}>Uploaded: {item.files.map((f) => f.name).join(', ')}</div>}
      {item.choice !== 'upload' && item.reasonText && <div className="ta-cell-sub" style={{ marginTop: 4 }}>Your reason{item.reasonCategory ? ` (${item.reasonCategory})` : ''}: {item.reasonText}</div>}

      {!locked && !open && (
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" icon={item.status === 'awaiting' ? 'Upload' : 'RefreshCw'} onClick={() => setOpen(true)}>
            {item.status === 'awaiting' ? 'Provide' : 'Update'}
          </Button>
        </div>
      )}

      {!locked && open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label className="ta-check"><input type="radio" checked={choice === 'upload'} onChange={() => setChoice('upload')} /> <span>Upload document</span></label>
            {item.cannotProvide && <label className="ta-check"><input type="radio" checked={choice === 'cannot_provide'} onChange={() => setChoice('cannot_provide')} /> <span>Cannot provide</span></label>}
            {item.naAllowed && <label className="ta-check"><input type="radio" checked={choice === 'not_applicable'} onChange={() => setChoice('not_applicable')} /> <span>Not applicable</span></label>}
          </div>

          {choice === 'upload' ? (
            <div>
              <input ref={input} type="file" multiple={item.maxFiles > 1} accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setFiles([...e.target.files].slice(0, item.maxFiles))} />
              <Button variant="ghost" icon="Upload" onClick={() => input.current?.click()}>Choose file{item.maxFiles > 1 ? 's' : ''}</Button>
              <span className="ta-cell-sub" style={{ marginLeft: 8 }}>{files.length ? files.map((f) => f.name).join(', ') : `PDF or image, up to ${item.maxFiles} file${item.maxFiles === 1 ? '' : 's'}, 10 MB each`}</span>
            </div>
          ) : (
            <>
              {choice === 'cannot_provide' && (
                <Field label={`Reason for not providing ${item.name.toLowerCase()}`} required>
                  <Select value={reasonCategory} placeholder="Select a reason" options={item.reasons} onChange={(e) => setReasonCategory(e.target.value)} />
                </Field>
              )}
              <Field label="Please explain" required hint="A short, honest explanation — HR will review it.">
                <Textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
              </Field>
            </>
          )}

          {err && <div className="ta-field__error"><Icon name="AlertCircle" size={12} /> {err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Submit'}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setErr(''); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
