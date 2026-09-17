import { Field, Input, Textarea, Select, FieldGrid } from '../ta/Field.jsx';
import { phoneError } from '../../utils/validation.js';

/** Renders a document requirement's field_schema as an actual form — used
    for onboarding items that are genuinely data to collect (bank details,
    nominations, declarations) rather than a file to upload. Controlled:
    `values` + `onChange(key, value)` from the parent, which owns
    submission/validation-on-submit (see validateOnboardingForm below). A
    'file' field type (e.g. an optional supporting cheque photo) stores a
    real File object in values — the parent uploads it separately from the
    JSON-safe form_data on submit. */
export default function OnboardingFormFields({ schema, values, errors, onChange }) {
  return (
    <FieldGrid>
      {schema.map((f) => {
        const value = values[f.key] ?? '';
        const err = errors?.[f.key];
        return (
          <Field key={f.key} label={f.label} required={f.required} error={err} full={f.type === 'textarea'}>
            {f.type === 'textarea' ? (
              <Textarea rows={3} value={value} error={err} onChange={(e) => onChange(f.key, e.target.value)} />
            ) : f.type === 'select' ? (
              <Select
                placeholder="Select" options={f.options || []} value={value} error={err}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : f.type === 'file' ? (
              <input
                type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => onChange(f.key, e.target.files?.[0] || null)}
              />
            ) : (
              <Input
                type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'phone' ? 'tel' : 'text'}
                value={value} error={err}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </FieldGrid>
  );
}

/** Required-field + phone-format checks, matching this app's standard
    validators rather than inventing new rules per onboarding form. */
export function validateOnboardingForm(schema, values) {
  const errors = {};
  for (const f of schema) {
    const v = values[f.key];
    if (f.type === 'file') continue; // every current file-type field is optional (supporting doc)
    if (f.required && !String(v ?? '').trim()) {
      errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.type === 'phone' && v) {
      const msg = phoneError(v, { required: false });
      if (msg) errors[f.key] = msg;
    }
  }
  return errors;
}
