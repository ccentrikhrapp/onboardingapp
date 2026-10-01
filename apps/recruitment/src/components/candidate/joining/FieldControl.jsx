import { useState } from 'react';
import { Field, Input, Select, Textarea } from '../../ta/Field.jsx';
import { maskValue } from '../../../utils/joiningSchema.ts';

const today = () => new Date().toISOString().slice(0, 10);
const INPUT_TYPE = { text: 'text', email: 'email', tel: 'tel', date: 'date', month: 'month', number: 'number' };

/* Aadhaar / PAN / bank / UAN / passport show masked once you leave the box —
   you only see the full number while you're typing it. */
function SensitiveInput({ kind, value, onChange, onBlur, disabled, error }) {
  const [focus, setFocus] = useState(false);
  const masked = !focus && value && !error;
  return (
    <Input
      value={masked ? maskValue(kind, value) : value || ''}
      error={error}
      disabled={disabled}
      autoComplete="off"
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); onBlur?.(); }}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* One schema field → the right control, label, hint, error and "where this
   came from" tag. `source` is 'candidate_application' | 'employee' | 'hr'. */
export default function FieldControl({ field: f, value, onChange, onBlur, error, disabled, source, remark, isRequired }) {
  const v = value ?? '';
  const readOnly = disabled || f.readOnly;
  const tag = source === 'candidate_application' ? 'From your application' : null;

  let control;
  if (f.type === 'consent') {
    control = (
      <label className="ta-check">
        <input type="checkbox" checked={v === 'Yes'} disabled={readOnly} onChange={(e) => { onChange(e.target.checked ? 'Yes' : ''); onBlur?.(); }} />
        <span>{f.label}</span>
      </label>
    );
    return (
      <div className="ta-field ta-field--full">
        {control}
        {f.hint && !error && <span className="ta-field__hint">{f.hint}</span>}
        {error && <span className="ta-field__error">{error}</span>}
        {remark && <span className="ta-field__error">HR: {remark}</span>}
      </div>
    );
  }
  if (f.type === 'select') {
    control = <Select value={v} error={error} disabled={readOnly} placeholder="Select" options={f.options} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
  } else if (f.type === 'yesno') {
    control = <Select value={v} error={error} disabled={readOnly} placeholder="Select" options={['Yes', 'No']} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
  } else if (f.type === 'textarea') {
    control = <Textarea rows={3} value={v} error={error} disabled={readOnly} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
  } else if (f.sensitive) {
    control = <SensitiveInput kind={f.sensitive} value={v} error={error} disabled={readOnly} onChange={onChange} onBlur={onBlur} />;
  } else {
    control = (
      <Input
        type={INPUT_TYPE[f.type] || 'text'} value={v} error={error} disabled={readOnly}
        max={f.type === 'date' && f.notFuture ? today() : f.type === 'month' && f.notFuture ? today().slice(0, 7) : undefined}
        min={f.type === 'number' ? (f.min ?? 0) : undefined} step={f.type === 'number' ? 'any' : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
      />
    );
  }
  return (
    <Field label={f.label} required={isRequired ?? (f.required || !!f.requiredIf)} error={error || (remark ? `HR: ${remark}` : undefined)} hint={f.hint} full={f.full} extracted={!!tag} extractedLabel={tag || undefined}>
      {control}
    </Field>
  );
}
