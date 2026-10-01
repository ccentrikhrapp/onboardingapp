import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import Icon from '../../components/common/Icon.jsx';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVerificationsForApplication, getVerificationDocumentUrl, getVerificationSummary } from '../../api/verification.js';
import { verifyDocument } from '../../api/verify.js';

const STATUS_META = {
  pending: { label: 'Pending', tone: 'grey' },
  under_review: { label: 'Under review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  reupload_required: { label: 'Correction required', tone: 'amber' },
};

/* Inline reason box for Reject / Request correction — both require remarks. */
function ReasonBox({ label, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div className="cx-docreason">
      <textarea
        className="cx-docreason__input"
        rows={2}
        placeholder={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="cx-docreason__btns">
        <button className="hr-btn hr-btn--sm" onClick={() => onSubmit(text.trim())} disabled={!text.trim()}>Submit</button>
        <button className="hr-btn hr-btn--ghost hr-btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function VerificationWorkspacePage() {
  const { applicationId } = useParams();
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [reasonFor, setReasonFor] = useState(null); // { docId, action }
  const [busy, setBusy] = useState(null);
  const [summary, setSummary] = useState(null);
  const [preview, setPreview] = useState(null); // { url, fileName, title } for DocumentPreviewModal

  const load = () => {
    listVerificationsForApplication(applicationId)
      .then((rows) => setDocs(rows || []))
      .catch((e) => setError(e.message || 'Could not load these documents.'));
  };
  useEffect(load, [applicationId]);
  useEffect(() => { getVerificationSummary(applicationId).then(setSummary).catch(() => setSummary(null)); }, [applicationId, docs]);

  const act = async (doc, action, remarks) => {
    setBusy(doc.id);
    setReasonFor(null);
    try {
      await verifyDocument(doc.id, action, remarks);
      toast.success(
        action === 'approve' ? `${doc.requirement_name} approved.` : `${doc.requirement_name} sent back to the candidate.`
      );
      load();
    } catch (e) {
      toast.error(e.message || 'Could not save that decision.');
    } finally {
      setBusy(null);
    }
  };

  const viewDoc = async (doc) => {
    setPreview({ url: null, fileName: null, title: doc.requirement_name });
    try {
      const { url, fileName, files } = await getVerificationDocumentUrl(doc.source_document_id);
      const parts = files?.length ? files : [{ url, fileName, label: null }];
      setPreview({ url: parts[0].url, fileName: parts[0].fileName, title: doc.requirement_name, parts, active: 0 });
    } catch (e) {
      setPreview(null);
      toast.error(e.message || 'Could not open this document.');
    }
  };

  const first = docs?.[0];
  const approved = (docs || []).filter((d) => d.status === 'approved').length;
  const total = (docs || []).length;

  return (
    <>
      <HRHeader
        title={first?.candidate_name || 'Candidate verification'}
        subtitle={first ? `${first.job_title} · ${first.application_code}` : ''}
        backTo="/hr/verification"
        backLabel="Verification queue"
      />

      {error && <Card><p className="text-secondary">{error}</p></Card>}
      {docs === null && !error && <div className="hr-loading">Loading…</div>}

      {summary && (
        <Card title="Documentation summary">
          <p className="hr-cell-sub" style={{ marginBottom: 8 }}>
            Employee: <strong>{first?.candidate_name}</strong> · Employment type: <strong>{summary.employment_type === 'fresher' ? 'Fresher' : summary.employment_type === 'experienced' ? 'Experienced' : '—'}</strong> · Previous employers: <strong>{summary.previous_employers ?? 0}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {[['Applicable requirements', summary.summary.applicable], ['Approved', summary.summary.approved], ['Approved with reason', summary.summary.approvedWithReason], ['Pending review', (summary.summary.pendingReview || 0) + (summary.summary.reasonSubmitted || 0)], ['Not applicable', summary.summary.notApplicable], ['Rejected', summary.summary.rejected], ['Clarification required', summary.summary.clarification]].map(([l, n]) => (
              <div key={l} style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: '8px 10px' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{n ?? 0}</div><div className="hr-cell-sub">{l}</div></div>
            ))}
          </div>
          <p className="hr-cell-sub" style={{ marginTop: 8 }}>
            {summary.summary.identityResolved ? <strong>Identity Proof – Satisfied. </strong> : null}
            {summary.summary.ready ? 'Every applicable requirement is resolved.' : `Still to resolve: ${(summary.summary.unresolved || []).join(', ')}.`}
          </p>
        </Card>
      )}

      {docs !== null && (
        <Card
          title="Pre-offer documents"
          action={<Tag tone={approved === total ? 'green' : 'amber'}>{approved}/{total} approved</Tag>}
        >
          <div className="hr-stack">
            {docs.map((doc) => {
              const meta = STATUS_META[doc.status] || STATUS_META.pending;
              const canAct = ['pending', 'under_review'].includes(doc.status);
              return (
                <div className="hr-docrow" key={doc.id}>
                  <span className="hr-docrow__icon"><Icon name="FileText" size={16} /></span>
                  <div className="grow">
                    <div className="hr-cell-strong">{doc.requirement_name}</div>
                    <div className="hr-cell-sub">{doc.kind === 'document' ? `Version ${doc.version}` : doc.kind === 'na' ? 'Candidate says: not applicable' : 'Candidate cannot provide this'}</div>
                    {doc.kind !== 'document' && doc.reason && <div className="hr-cell-sub"><strong>Reason:</strong> {doc.reason}</div>}
                    {doc.hr_remarks && doc.status !== 'approved' && (
                      <div className="hr-cell-sub" style={{ color: 'var(--tag-amber-fg)' }}>Your note: {doc.hr_remarks}</div>
                    )}
                    {reasonFor?.docId === doc.id && (
                      <ReasonBox
                        label={reasonFor.action === 'reject' ? 'Why is this document rejected?' : 'What needs to be corrected?'}
                        onSubmit={(text) => act(doc, reasonFor.action, text)}
                        onCancel={() => setReasonFor(null)}
                      />
                    )}
                  </div>
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                  {reasonFor?.docId !== doc.id && (
                    <span className="hr-rowactions" style={{ opacity: 1 }}>
                      {doc.kind === 'document' && <Button variant="ghost" icon="Eye" onClick={() => viewDoc(doc)}>View</Button>}
                      {canAct && (
                        <>
                          <Button variant="ghost" icon="Check" disabled={busy === doc.id} onClick={() => act(doc, 'approve')}>{doc.kind === 'document' ? 'Approve' : 'Approve reason'}</Button>
                          <Button variant="ghost" icon="RotateCcw" disabled={busy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reupload_required' })}>
                            Request correction
                          </Button>
                          <Button variant="danger" icon="X" disabled={busy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reject' })}>
                            Reject
                          </Button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <DocumentPreviewModal
        open={!!preview} onClose={() => setPreview(null)}
        url={preview?.url} fileName={preview?.fileName} title={preview?.title}
        parts={preview?.parts || []} activePart={preview?.active || 0}
        onPart={(i) => setPreview((p) => ({ ...p, active: i, url: p.parts[i].url, fileName: p.parts[i].fileName }))}
      />
    </>
  );
}
