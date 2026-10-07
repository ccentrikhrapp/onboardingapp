import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '../../constants/countries.js';
import { joinPhone, splitPhone } from '../../utils/phone.js';

/* Phone number with a country-code picker. The value stays one
   string ("+91 9876543210") so existing records and forms keep working; the
   country and the national number are only split apart for editing.

   A native <select> can't show a short closed state ("+91") with full
   country names in the open list at the same time — it always shows the
   same text for both. This is a small custom dropdown instead: compact
   when closed, full names (searchable) when open. */

const byIso = Object.fromEntries(COUNTRIES.map((c) => [c.iso, c]));

// Which country a dialling code belongs to (the first listed one for shared codes).
function countryForDial(dial, preferredIso) {
  if (preferredIso && byIso[preferredIso]?.dial === dial) return byIso[preferredIso];
  return COUNTRIES.find((c) => c.dial === dial) || byIso[DEFAULT_COUNTRY_ISO];
}

export default function CountryPhoneInput({ value, onChange, onBlur, error, disabled, id, placeholder = 'Mobile number', ...rest }) {
  const parsed = splitPhone(value || '');
  const [iso, setIso] = useState(() => countryForDial(parsed.dial || '91')?.iso || DEFAULT_COUNTRY_ISO);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);
  const searchRef = useRef(null);

  // Keep the picked country in step when the value changes from outside.
  const current = byIso[iso]?.dial === parsed.dial ? byIso[iso] : countryForDial(parsed.dial || '91', iso);

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q.replace(/^\+/, '')) || c.iso.toLowerCase() === q);
  }, [query]);

  const pickCountry = (nextIso) => {
    setIso(nextIso);
    const c = byIso[nextIso];
    onChange(joinPhone(c.dial, parsed.national));
    setOpen(false);
    setQuery('');
  };

  const changeNumber = (raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, 15);
    onChange(digits ? joinPhone(current.dial, digits) : '');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '68px minmax(0, 1fr)', gap: 6, alignItems: 'center' }}>
      <div ref={boxRef} style={{ position: 'relative' }}>
        <button
          type="button"
          className={`hr-input hr-input--select${error ? ' hr-input--error' : ''}`}
          aria-label="Country code"
          aria-haspopup="listbox"
          aria-expanded={open}
          title={`${current.name} (+${current.dial})`}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          style={{ width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {`+${current.dial}`}
        </button>
        {open && (
          <div
            role="listbox"
            className="hr-card"
            style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260, maxHeight: 280, overflowY: 'auto', zIndex: 50, padding: 6 }}
          >
            <input
              ref={searchRef}
              type="search"
              className="hr-input"
              placeholder="Search country or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            {options.length === 0 && <div className="hr-cell-sub" style={{ padding: 8 }}>No matching country.</div>}
            {options.map((c) => (
              <button
                key={c.iso}
                type="button"
                role="option"
                aria-selected={c.iso === current.iso}
                className="hr-searchresult"
                onClick={() => pickCountry(c.iso)}
                style={c.iso === current.iso ? { background: 'var(--hr-blue-wash)' } : undefined}
              >
                <span className="hr-cell-strong">{c.name}</span>
                <span className="hr-cell-sub">+{c.dial}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        className={`hr-input${error ? ' hr-input--error' : ''}`}
        placeholder={placeholder}
        value={parsed.national}
        disabled={disabled}
        onChange={(e) => changeNumber(e.target.value)}
        onBlur={onBlur}
        {...rest}
      />
    </div>
  );
}
