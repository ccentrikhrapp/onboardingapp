import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from '../common/Button.jsx';
import { Field, Textarea, Checkbox } from '../ta/Field.jsx';

const DECISIONS = [
  { value: 'advance', label: 'Advance', icon: '✓' },
  { value: 'further_review', label: 'Further Review', icon: '•' },
  { value: 'not_progressing', label: 'Not Moving Forward', icon: '✕' },
];

/* Remarks are mandatory for every decision — the backend rejects an empty
   submission too, this is not just a frontend nicety (master prompt §41). */
export default function InterviewFeedbackModal({ open, onClose, round, onSubmit, busy }) {
  const [decision, setDecision] = useState('');
  const [remarks, setRemarks] = useState('');
  const [share, setShare] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    if (!decision) { setError('Choose a decision.'); return; }
    if (!remarks.trim()) { setError('Please provide interview remarks before submitting.'); return; }
    setError('');
    onSubmit({ decision, remarks: remarks.trim(), shareWithCandidate: share });
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
      {error && <p className="ta-field__error" style={{ marginBottom: 10 }}>{error}</p>}
      <Field label="Decision" required>
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
      <Field label="Remarks" required hint="Visible to the recruitment team; optionally shared with the candidate below.">
        <Textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What stood out — strengths, gaps, overall impression…" />
      </Field>
      <Checkbox checked={share} onChange={(e) => setShare(e.target.checked)}>Share these remarks with the candidate</Checkbox>
    </Modal>
  );
}
