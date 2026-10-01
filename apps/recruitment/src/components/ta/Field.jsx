import Icon from '../common/Icon.jsx';

/* Premium form controls — same visual language as the TA screens.
   Used across the candidate application flow. */

export function Field({ label, required, error, hint, extracted, extractedLabel = 'From resume', full, children }) {
  return (
    <div className={`ta-field${full ? ' ta-field--full' : ''}${extracted ? ' ta-field--extracted' : ''}`}>
      {label && (
        <div className="ta-field__labelrow">
          <label className="ta-field__label">
            {label}
            {required && <span className="req">*</span>}
          </label>
          {extracted && <span className="ta-field__tag">{extractedLabel}</span>}
        </div>
      )}
      {children}
      {hint && !error && <span className="ta-field__hint">{hint}</span>}
      {error && (
        <span className="ta-field__error">
          <Icon name="AlertCircle" size={12} /> {error}
        </span>
      )}
    </div>
  );
}

export function Input({ error, ...rest }) {
  return <input className={`ta-input${error ? ' ta-input--error' : ''}`} {...rest} />;
}

export function Textarea({ error, ...rest }) {
  return <textarea className={`ta-textarea${error ? ' ta-input--error' : ''}`} {...rest} />;
}

export function Select({ error, options = [], placeholder, children, ...rest }) {
  return (
    <select className={`ta-input ta-input--select${error ? ' ta-input--error' : ''}`} {...rest}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
      {children}
    </select>
  );
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label className="ta-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

/* Two-column responsive field grid. */
export function FieldGrid({ children }) {
  return <div className="ta-formgrid">{children}</div>;
}
