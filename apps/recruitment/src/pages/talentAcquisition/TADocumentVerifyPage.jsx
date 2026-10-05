import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Card from '../../components/ta/Card.jsx';
import Tag from '../../components/ta/Tag.jsx';
import Button from '../../components/ta/Button.jsx';
import { Field, Textarea } from '../../components/ta/Field.jsx';
import TAHeader from '../../components/ta/TAHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getApplication } from '../../api/applications.js';
import { listApplicationDocuments, documentFileUrl, reviewDocument } from '../../api/documents.js';
import { docStatusMeta, requiredSlots, slotLabel } from '../../utils/documentRules.js';
import { formatDateTime } from '../../utils/format.js';

const ACTIONS = [
  { value: 'approve', label: 'Approve', needsRemark: false },
  { value: 'reupload_required', label: 'Return for correction', needsRemark: true },
  { value: 'reject', label: 'Reject', needsRemark: true },
];
const isImage = (name = '') => /\.(png|jpe?g|gif|webp)$/i.test(name);

/* Full-page verification of ONE candidate document. The document gets most of
   the screen; the decision panel sits beside it. Each action calls the same
   verify-application-document endpoint the inline review uses — nothing new on
   the backend, no change to statuses or permissions. */
export default function TADocumentVerifyPage() {
  const { candidateId, documentId } = useParams(); // candidateId = application id (as on the candidate page)
  const navigate = useNavigate();
  const toast = useToast();
  const [app, setApp] = useState(null);
  const [doc, setDoc] = useState(null);
  const [fileIdx, setFileIdx] = useState(0);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('approve');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [a, docs] = await Promise.all([getApplication(candidateId), listApplicationDocuments(candidateId)]);
      setApp(a);
      setDoc(docs.find((d) => d.id === documentId) || null);
    } catch (e) {
      toast.error(e.message || 'Could not load this document.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [candidateId, documentId]);

  const files = (doc?.document_files || []).filter((f) => f.is_current);
  const current = files[fileIdx] || null;
  useEffect(() => {
    setUrl(null);
    if (!current) return;
    documentFileUrl(current.storage_path).then(setUrl).catch(() => toast.error('Could not open this file.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.storage_path]);

  const back = () => navigate(`/ta/candidates/${candidateId}`);

  if (loading) return <div className="ta-page"><div className="ta-cell-sub">Loading document…</div></div>;
  if (!doc) return (
    <div className="ta-page">
      <button className="ta-link" onClick={back}><Icon name="ArrowLeft" size={14} /> Back to candidate</button>
      <Card><p className="ta-cell-sub">This document isn't on this application.</p></Card>
    </div>
  );

  const req = doc.document_requirements || {};
  const meta = docStatusMeta(doc);
  const slots = requiredSlots(req);
  const reviewable = ['uploaded', 'cannot_provide'].includes(doc.status);
  const chosen = ACTIONS.find((a) => a.value === action);
  const canSubmit = reviewable && !busy && (!chosen.needsRemark || remarks.trim().length > 0);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await reviewDocument(doc.id, action, chosen.needsRemark ? remarks.trim() : undefined);
      toast.success(action === 'approve' ? 'Approved — sent to HR for final sign-off.' : action === 'reject' ? 'Document rejected.' : 'Sent back to the candidate for correction.');
      await load();
      setRemarks('');
    } catch (e) {
      setErr(e.message || 'Could not save that decision.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <TAHeader title="Document verification" subtitle={app ? `${app.candidateName || 'Candidate'} · ${app.code || ''}` : ''} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="ta-link" onClick={back}><Icon name="ArrowLeft" size={14} /> Back to candidate documents</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 14, alignItems: 'start' }} className="tadv-layout">
        {/* viewer */}
        <Card
          title={req.name || 'Document'}
          action={files.length > 1 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {files.map((f, i) => (
                <button key={f.id || i} type="button" className={`ta-btn ta-btn--sm${i === fileIdx ? '' : ' ta-btn--ghost'}`} onClick={() => setFileIdx(i)}>
                  {slots.length ? slotLabel(req, f.slot || slots[i]) : (f.file_name || `File ${i + 1}`)}
                </button>
              ))}
            </div>
          ) : null}
        >
          {!current ? (
            <p className="ta-cell-sub">No file uploaded for this requirement{doc.cannot_provide_reason ? ' — the candidate gave a reason instead (see the panel).' : '.'}</p>
          ) : !url ? (
            <div className="ta-cell-sub">Loading file…</div>
          ) : isImage(current.file_name) ? (
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--ta-bg-soft, #f6f7f9)', borderRadius: 10, padding: 8 }}>
              <img src={url} alt={current.file_name || 'Document'} style={{ maxWidth: '100%', maxHeight: '74vh', objectFit: 'contain' }} />
            </div>
          ) : (
            <iframe src={url} title={current.file_name || 'Document'} style={{ width: '100%', height: '74vh', border: 0, borderRadius: 10, background: '#fff' }} />
          )}
          {url && <div style={{ marginTop: 8 }}><a className="ta-link" href={url} target="_blank" rel="noopener noreferrer">Open in a new tab</a></div>}
        </Card>

        {/* decision panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Candidate & document">
            <div className="ta-info">
              <div className="ta-info__item"><span className="ta-info__label">Candidate</span><span className="ta-info__value">{app?.candidateName || '—'}</span></div>
              <div className="ta-info__item"><span className="ta-info__label">Application</span><span className="ta-info__value">{app?.code || '—'}</span></div>
              <div className="ta-info__item"><span className="ta-info__label">Job</span><span className="ta-info__value">{app?.jobTitle || 'General application'}</span></div>
              <div className="ta-info__item"><span className="ta-info__label">Document</span><span className="ta-info__value">{req.name}</span></div>
              <div className="ta-info__item"><span className="ta-info__label">Uploaded</span><span className="ta-info__value">{formatDateTime(current?.uploaded_at || doc.updated_at)}</span></div>
              <div className="ta-info__item"><span className="ta-info__label">Current status</span><span className="ta-info__value"><Tag tone={meta.tone}>{meta.label}</Tag></span></div>
            </div>
            {doc.cannot_provide_reason && (
              <div className="ta-note ta-note--warn" style={{ marginTop: 10 }}><Icon name="AlertTriangle" size={14} /> <span><strong>Candidate's reason:</strong> {doc.cannot_provide_reason}</span></div>
            )}
            {doc.hr_remarks && doc.status === 'revision_required' && (
              <div className="ta-cell-sub" style={{ marginTop: 8 }}>Previously sent back: {doc.hr_remarks}</div>
            )}
          </Card>

          <Card title="Verification">
            {!reviewable ? (
              <p className="ta-cell-sub">{doc.status === 'under_verification' ? 'Already passed on to HR for final sign-off.' : 'Nothing to review here yet.'}</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {ACTIONS.map((a) => (
                    <label key={a.value} className="ta-check">
                      <input type="radio" name="verify-action" checked={action === a.value} onChange={() => { setAction(a.value); setErr(''); }} />
                      <span>{a.label}</span>
                    </label>
                  ))}
                </div>
                {chosen.needsRemark && (
                  <Field label={action === 'reject' ? 'Reason for rejection' : 'What should the candidate correct?'} required hint="The candidate sees this exact text.">
                    <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  </Field>
                )}
                {err && <div className="ta-field__error" style={{ marginBottom: 8 }}><Icon name="AlertCircle" size={12} /> {err}</div>}
                <Button onClick={submit} disabled={!canSubmit}>{busy ? 'Saving…' : `Submit: ${chosen.label}`}</Button>
              </>
            )}
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 960px) { .tadv-layout { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
