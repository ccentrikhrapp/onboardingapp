import { useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '../../constants/countries.js';
import { joinPhone, splitPhone } from '../../utils/phone.js';

/* Phone number with a country-code picker. The value stays one
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

  // Keep the picked country in step when the value changes from outside.
  const current = byIso[iso]?.dial === parsed.dial ? byIso[iso] : countryForDial(parsed.dial || '91', iso);

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
    <div style={{ display: 'grid', gridTemplateColumns: "68px minmax(0, 1fr)", gap: 6, alignItems: 'center' }}>
      <select
        className={`hr-input hr-input--select${error ? ' hr-input--error' : ''}`}
        aria-label="Country code"
        title={`${current.name} (+${current.dial})`}
        value={current.iso}
        disabled={disabled}
        onChange={(e) => pickCountry(e.target.value)}
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso} title={`${c.name} (+${c.dial})`}>{`+${c.dial}`}</option>
        ))}
      </select>
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
