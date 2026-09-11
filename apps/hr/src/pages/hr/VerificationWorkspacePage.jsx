import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import Icon from '../../components/common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVerificationsForApplication } from '../../api/verification.js';
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

  const load = () => {
    listVerificationsForApplication(applicationId)
      .then((rows) => setDocs(rows || []))
      .catch((e) => setError(e.message || 'Could not load these documents.'));
  };
  useEffect(load, [applicationId]);

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

  const first = docs?.[0];
  const approved = (docs || []).filter((d) => d.status === 'approved').length;
  const total = (docs || []).length;

  return (
    <>
      <HRHeader
        title={first?.candidate_name || 'Candidate verification'}
        subtitle={first ? `${first.job_title} · ${first.application_code}` : ''}
        backTo="/hr"
        backLabel="Verification queue"
      />

      {error && <Card><p className="text-secondary">{error}</p></Card>}
      {docs === null && !error && <div className="hr-loading">Loading…</div>}

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
                    <div className="hr-cell-sub">Version {doc.version}</div>
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
                  {canAct && reasonFor?.docId !== doc.id && (
                    <span className="hr-rowactions" style={{ opacity: 1 }}>
                      <Button variant="ghost" icon="Check" disabled={busy === doc.id} onClick={() => act(doc, 'approve')}>Approve</Button>
                      <Button variant="ghost" icon="RotateCcw" disabled={busy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reupload_required' })}>
                        Request correction
                      </Button>
                      <Button variant="danger" icon="X" disabled={busy === doc.id} onClick={() => setReasonFor({ docId: doc.id, action: 'reject' })}>
                        Reject
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
