import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { SkeletonPage } from '../../components/common/States.jsx';

const ACTIONS = [
  { value: 'approve', label: 'Approve', needsRemark: false },
  { value: 'reupload_required', label: 'Return for correction', needsRemark: true },
  { value: 'reject', label: 'Reject', needsRemark: true },
];
const GROUPS = [
  ['Identity proof', ['pan_card', 'aadhaar', 'passport']],
  ['Education', ['tenth_cert', 'twelfth_cert', 'degree_marksheets']],
  ['Address proof', ['address_proof', 'address_proof_permanent']],
  ['Employment', ['prev_offer_letter', 'prev_appointment_letter', 'prev_relieving_letter', 'payslips_3m', 'increment_letter', 'employment_history']],
  ['Other joining documents', ['passport_photos', 'cancelled_cheque', 'current_offer_letter', 'name_change_proof']],
];
const isImage = (name = '') => /\.(png|jpe?g|gif|webp)$/i.test(name);

/* Dedicated, full-page document verification — the candidate's whole
   checklist on the left (so TA can move through every document without
   losing context or going back to the candidate page each time), a large
   preview in the middle sized to the viewport, and the decision panel on
   the right so it never competes with the document itself for space. Same
   verify-application-document endpoint every path already used — no new
   statuses, no new permissions, nothing on the backend changed. */
export default function TADocumentVerifyPage() {
  const { candidateId, documentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [app, setApp] = useState(null);
  const [docs, setDocs] = useState([]);
  const [fileIdx, setFileIdx] = useState(0);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('approve');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [listOpen, setListOpen] = useState(false); // mobile: document list drawer

  const load = async (keepFileIdx = false) => {
    if (!keepFileIdx) setLoading(true);
    try {
      const [a, d] = await Promise.all([getApplication(candidateId), listApplicationDocuments(candidateId)]);
      setApp(a);
      setDocs(d || []);
    } catch (e) {
      toast.error(e.message || 'Could not load this document.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); setFileIdx(0); /* eslint-disable-next-line */ }, [candidateId, documentId]);

  const doc = docs.find((d) => d.id === documentId) || null;
  const req = doc?.document_requirements || {};
  const slots = doc ? requiredSlots(req) : [];
  const files = (doc?.document_files || []).filter((f) => f.is_current);

  // Deep-link from the candidate page's "View" on a specific slot/file.
  useEffect(() => {
    const slot = searchParams.get('slot');
    if (!slot || !files.length) return;
    const i = files.findIndex((f) => f.slot === slot);
    if (i >= 0) setFileIdx(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, files.length]);

  const current = files[fileIdx] || null;
  useEffect(() => {
    setUrl(null);
    if (!current) return;
    documentFileUrl(current.storage_path).then(setUrl).catch(() => toast.error('Could not open this file.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.storage_path]);

  const back = () => navigate(`/ta/candidates/${candidateId}`);
  const openDoc = (id) => { navigate(`/ta/candidates/${candidateId}/documents/${id}/verify`); setListOpen(false); };

  const grouped = useMemo(() => {
    const out = [];
    for (const [title, keys] of GROUPS) {
      const rows = docs.filter((d) => keys.includes(d.document_requirements?.key) && d.status !== 'not_applicable')
        .sort((a, b) => (a.document_requirements?.display_order || 0) - (b.document_requirements?.display_order || 0));
      if (rows.length) out.push([title, rows]);
    }
    return out;
  }, [docs]);

  if (loading) return <div className="ta-page"><SkeletonPage /></div>;
  if (!doc) return (
    <div className="ta-page">
      <button className="ta-link" onClick={back}><Icon name="ArrowLeft" size={14} /> Back to candidate</button>
      <Card><p className="ta-cell-sub">This document isn't on this application.</p></Card>
    </div>
  );

  const meta = docStatusMeta(doc);
  const reviewable = ['uploaded', 'cannot_provide'].includes(doc.status);
  const chosen = ACTIONS.find((a) => a.value === action);
  const canSubmit = reviewable && !busy && (!chosen.needsRemark || remarks.trim().length > 0);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await reviewDocument(doc.id, action, chosen.needsRemark ? remarks.trim() : undefined);
      toast.success(action === 'approve' ? 'Approved — sent to HR for final sign-off.' : action === 'reject' ? 'Document rejected.' : 'Sent back to the candidate for correction.');
      await load(true);
      setRemarks('');
    } catch (e) {
      setErr(e.message || 'Could not save that decision.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <TAHeader title="Document verification" subtitle={app ? `${app.candidateName || 'Candidate'} · ${app.code || ''}${app.jobTitle ? ` · ${app.jobTitle}` : ''}` : ''} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="ta-link" onClick={back}><Icon name="ArrowLeft" size={14} /> Back to candidate</button>
        <button type="button" className="ta-btn ta-btn--ghost ta-btn--sm tadv-listtoggle" onClick={() => setListOpen((v) => !v)}>
          <Icon name="Files" size={14} /> Documents
        </button>
      </div>

      <div className="tadv-layout">
        {/* ---------- document list ---------- */}
        <div className={`tadv-list${listOpen ? ' is-open' : ''}`}>
          <Card title="Checklist" bodyStyle={{ padding: 10, maxHeight: '78vh', overflowY: 'auto' }}>
            {grouped.map(([title, rows]) => (
              <div key={title} style={{ marginBottom: 10 }}>
                <div className="ta-cell-sub" style={{ fontWeight: 700, padding: '4px 6px', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.03em' }}>{title}</div>
                {rows.map((d) => {
                  const m = docStatusMeta(d);
                  const active = d.id === documentId;
                  return (
                    <button
                      key={d.id} type="button" onClick={() => openDoc(d.id)}
                      className={`tadv-docitem${active ? ' is-active' : ''}`}
                    >
                      <Icon name="FileText" size={14} />
                      <span className="tadv-docitem__label">{d.document_requirements?.name}{d.employer_label ? ` — ${d.employer_label}` : ''}</span>
                      <Tag tone={m.tone}>{m.label}</Tag>
                    </button>
                  );
                })}
              </div>
            ))}
          </Card>
        </div>

        {/* ---------- preview ---------- */}
        <Card
          title={req.name || 'Document'}
          action={files.length > 1 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            <div className="tadv-preview">
              <img src={url} alt={current.file_name || 'Document'} />
            </div>
          ) : (
            <iframe className="tadv-preview-frame" src={url} title={current.file_name || 'Document'} />
          )}
          {url && <div style={{ marginTop: 8 }}><a className="ta-link" href={url} target="_blank" rel="noopener noreferrer"><Icon name="ArrowRight" size={12} /> Open in a new tab</a></div>}
        </Card>

        {/* ---------- decision panel ---------- */}
        <div className="tadv-side">
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
      {listOpen && <div className="overlay tadv-list-overlay" onClick={() => setListOpen(false)} />}
    </>
  );
}
