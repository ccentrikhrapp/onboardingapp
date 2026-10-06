import { useMemo, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '../../constants/countries.js';
import { joinPhone, splitPhone } from '../../utils/phone.js';

/* Phone number with a searchable country-code picker. The value stays one
   string ("+91 9876543210") so existing records and forms keep working; the
   country and the national number are only split apart for editing. */

const byIso = Object.fromEntries(COUNTRIES.map((c) => [c.iso, c]));

// Which country a dialling code belongs to (the first listed one for shared codes).
function countryForDial(dial, preferredIso) {
  if (preferredIso && byIso[preferredIso]?.dial === dial) return byIso[preferredIso];
  return COUNTRIES.find((c) => c.dial === dial) || byIso[DEFAULT_COUNTRY_ISO];
}

export default function CountryPhoneInput({ value, onChange, onBlur, error, disabled, id, placeholder = 'Mobile number', ...rest }) {
  const parsed = splitPhone(value || '');
  const [iso, setIso] = useState(() => countryForDial(parsed.dial || '91')?.iso || DEFAULT_COUNTRY_ISO);
  const [query, setQuery] = useState('');

  // Keep the picked country in step when the value changes from outside.
  const current = byIso[iso]?.dial === parsed.dial ? byIso[iso] : countryForDial(parsed.dial || '91', iso);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q.replace(/^\+/, '')) || c.iso.toLowerCase() === q)
      : COUNTRIES;
    // Keep the selected country visible even when the search hides it.
    return list.some((c) => c.iso === current.iso) ? list : [current, ...list];
  }, [query, current]);

  const pickCountry = (nextIso) => {
    setIso(nextIso);
    const c = byIso[nextIso];
    onChange(joinPhone(c.dial, parsed.national));
  };

  const changeNumber = (raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, 15);
    onChange(digits ? joinPhone(current.dial, digits) : '');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) 1fr', gap: 6 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <input
          type="search"
          className="hr-input"
          placeholder="Search country"
          aria-label="Search country"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12 }}
        />
        <select
          className={`hr-input hr-input--select${error ? ' hr-input--error' : ''}`}
          aria-label="Country code"
          value={current.iso}
          disabled={disabled}
          size={1}
          onChange={(e) => pickCountry(e.target.value)}
        >
          {options.map((c) => (
            <option key={c.iso} value={c.iso}>{`${c.name} (+${c.dial})`}</option>
          ))}
        </select>
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
