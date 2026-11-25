import { useState } from 'react';
import Icon from './Icon.jsx';

export default function ChipsInput({ value = [], onChange, placeholder = 'Type and press Enter' }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  const remove = (chip) => onChange(value.filter((c) => c !== chip));

  // Pasting a bulk list (comma- or line-separated, e.g. copied from a JD)
  // becomes one chip per item instead of one giant chip.
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text');
    if (!/[,\n]/.test(text)) return; // a single item: let the default paste behavior fill the input
    e.preventDefault();
    const items = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const merged = [...value];
    items.forEach((v) => { if (!merged.includes(v)) merged.push(v); });
    onChange(merged);
    setDraft('');
  };

  return (
    <div className="chips-input">
      {value.map((chip) => (
        <span className="chip" key={chip}>
          {chip}
          <button type="button" onClick={() => remove(chip)} aria-label={`Remove ${chip}`}>
            <Icon name="X" size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
          if (e.key === 'Backspace' && !draft && value.length) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={add}
        onPaste={handlePaste}
      />
    </div>
  );
}
