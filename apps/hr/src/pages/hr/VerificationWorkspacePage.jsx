import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import Icon from '../../components/common/Icon.jsx';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVerificationsForApplication, getVerificationDocumentUrl, getVerificationSummary } from '../../api/verification.js';
import { verifyDocument } from '../../api/verify.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/kit/Skeleton.jsx';

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
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'approved' | 'pending'

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
  const toggleFilter = (value) => setStatusFilter((v) => (v === value ? 'all' : value));
  const visibleDocs = (docs || []).filter((d) => {
    if (statusFilter === 'approved') return d.status === 'approved';
    if (statusFilter === 'pending') return ['pending', 'under_review'].includes(d.status);
    return true;
  });

  return (
    <>
      <HRHeader
        title={first?.candidate_name || 'Candidate verification'}
        subtitle={first ? `${first.job_title} · ${first.application_code}` : ''}
        backTo="/hr/verification"
        backLabel="Verification queue"
      />

      {error && <Card><p className="text-secondary">{error}</p></Card>}
      {docs === null && !error && <SkeletonBlock lines={4} />}

      {summary && (
        <StatBar
          items={[
            { icon: 'FileCheck2', accent: 'blue', label: 'Applicable', value: summary.summary.applicable ?? 0, active: statusFilter === 'all', onClick: () => setStatusFilter('all') },
            { icon: 'CheckCircle2', accent: 'green', label: 'Approved', value: summary.summary.approved ?? 0, active: statusFilter === 'approved', onClick: () => toggleFilter('approved') },
            { icon: 'Clock3', accent: 'amber', label: 'Pending review', value: (summary.summary.pendingReview || 0) + (summary.summary.reasonSubmitted || 0), active: statusFilter === 'pending', onClick: () => toggleFilter('pending') },
          ]}
        />
      )}

      {docs !== null && (
        <Card
          title="Pre-offer documents"
          action={<Tag tone={approved === total ? 'green' : 'amber'}>{approved}/{total} approved</Tag>}
        >
          {visibleDocs.length === 0 ? (
            <p className="hr-cell-mute">No documents match this filter.</p>
          ) : (
          <div className="hr-stack">
            {visibleDocs.map((doc) => {
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
          )}
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
