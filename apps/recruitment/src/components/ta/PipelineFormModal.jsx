import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import Button from './Button.jsx';
import { Field, FieldGrid, Input, Select } from './Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createPipelineCandidate, updatePipelineCandidate } from '../../api/pipeline.js';
import { blankPipelineForm, formFromPipeline, validatePipelineForm } from '../../utils/pipelineForm.js';

/* Add / edit one Pipeline Candidate. System fields (ID, availability date,
   status, created by/on) are never asked for — the database fills them in. */
export default function PipelineFormModal({ open, candidate, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!candidate;
  const [form, setForm] = useState(() => (candidate ? formFromPipeline(candidate) : blankPipelineForm()));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async () => {
    const e = validatePipelineForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const saved = editing ? await updatePipelineCandidate(candidate.id, form) : await createPipelineCandidate(form);
      toast.success(editing ? 'Pipeline candidate updated.' : 'Candidate added to the pipeline.');
      onSaved(saved);
    } catch (err) {
      toast.error(err.message || 'Could not save this candidate.');
    } finally {
      setSaving(false);
    }
  };

  const text = (k, label, props = {}) => (
    <Field label={label} required error={errors[k]}>
      <Input value={form[k]} error={errors[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${candidate.name}` : 'Add Pipeline Candidate'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to pipeline'}</Button>
        </>
      }
    >
      <FieldGrid>
        {text('name', 'Name')}
        {text('phone', 'Number', { inputMode: 'tel' })}
        {text('email', 'Email ID', { type: 'email' })}
        {text('position', 'Position')}
        {text('organisation', 'Organisation')}
        {text('totalExp', 'Total Exp (years)', { type: 'number', min: 0, step: '0.1' })}
        {text('relevantExp', 'Relevant Exp (years)', { type: 'number', min: 0, step: '0.1' })}
        {text('currentCtc', 'Current CTC', { type: 'number', min: 0 })}
        <Field label="Offer in Hand" required error={errors.offerInHand}>
          <Select value={form.offerInHand} error={errors.offerInHand} placeholder="Select" options={['Yes', 'No']} onChange={(e) => set('offerInHand', e.target.value)} />
        </Field>
        {text('expectedCtc', 'Expected CTC', { type: 'number', min: 0 })}
        <Field label="Notice (days)" required error={errors.noticeDays} hint="Expected availability is calculated from this automatically.">
          <Input type="number" min="0" step="1" value={form.noticeDays} error={errors.noticeDays} onChange={(e) => set('noticeDays', e.target.value)} />
        </Field>
        {text('currentLocation', 'Current Location')}
        {text('hiringLocation', 'Hiring Location')}
      </FieldGrid>
    </Modal>
  );
}
