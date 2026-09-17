import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Textarea } from '../ta/Field.jsx';

const DECISIONS = [
  { value: 'advance', label: 'Advance', icon: '✓' },
  { value: 'further_review', label: 'Further Review', icon: '•' },
  { value: 'not_progressing', label: 'Not Moving Forward', icon: '✕' },
];

/* Remarks are mandatory for every decision — the backend rejects an empty
   submission too, this is not just a frontend nicety (master prompt §41).
   Sharing with the candidate is likewise not optional here: every recorded
   decision is shared, so remarks should be written with the candidate as
   the audience, not just internal shorthand. */
export default function InterviewFeedbackModal({ open, onClose, round, onSubmit, busy }) {
  const [decision, setDecision] = useState('');
  const [remarks, setRemarks] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const submit = () => {
    const fe = {};
    if (!decision) fe.decision = 'Choose a decision.';
    if (!remarks.trim()) fe.remarks = 'Please provide interview remarks before submitting.';
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;
    onSubmit({ decision, remarks: remarks.trim(), shareWithCandidate: true });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={round ? `Feedback — ${round.name}` : 'Interview feedback'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save feedback'}</Button>
        </>
      }
    >
      <Field label="Decision" required error={fieldErrors.decision}>
        <div className="ta-btnrow">
          {DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`ta-btn ta-btn--sm${decision === d.value ? '' : ' ta-btn--ghost'}`}
              onClick={() => setDecision(d.value)}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Remarks" required error={fieldErrors.remarks} hint="Shared with the candidate once you save — write for that audience.">
        <Textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What stood out — strengths, gaps, overall impression…" />
      </Field>
    </Modal>
  );
}
