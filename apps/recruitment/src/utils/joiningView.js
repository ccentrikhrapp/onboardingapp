import { SECTIONS, fieldIsVisible, groupIsVisible, maskValue, getPath } from './joiningSchema.ts';

/* Read-side helpers for the Joining Form — shared (identical copy) by the
   employee's review screen and HR's review screen. Nothing here is asked of
   the employee again: it only re-displays the central profile. */

const val = (data, path) => {
  const v = getPath(data, path);
  return v === undefined || v === null ? '' : String(v);
};

export const fullNameOf = (data) => val(data, 'personal.main.fullName');

export function addressText(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.locality, a.landmark, a.city, a.district, a.state, a.pin, a.country].filter(Boolean).join(', ');
}

export function displayValue(field, value, { mask = true } = {}) {
  const v = value === undefined || value === null ? '' : String(value);
  if (!v) return '—';
  if (field.type === 'consent') return v === 'Yes' ? 'Confirmed' : '—';
  if (mask && field.sensitive) return maskValue(field.sensitive, v);
  return v;
}

/** Sections as label/value tables (lists become one block per row) — for review screens. */
export function summarizeSections(data, { mask = true } = {}) {
  return SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    groups: s.groups.filter((g) => groupIsVisible(g, data)).map((g) => {
      if (g.kind === 'fields') {
        const obj = data?.[s.id]?.[g.id] ?? {};
        return {
          id: g.id, title: g.title,
          rows: g.fields.filter((f) => fieldIsVisible(f, data)).map((f) => ({ label: f.label, value: displayValue(f, obj[f.key], { mask }) })),
        };
      }
      const rows = data?.[s.id]?.[g.id] ?? [];
      return {
        id: g.id, title: g.title,
        items: rows.map((row, i) => ({
          title: `${g.itemTitle} ${i + 1}`,
          rows: g.fields.filter((f) => fieldIsVisible(f, data, row)).map((f) => ({ label: f.label, value: displayValue(f, row[f.key], { mask }) })),
        })),
      };
    }),
  }));
}

const COMPANY = { name: 'Ccentrik', address: 'Noida' };

/** Values pulled from the central profile / HR and shown read-only at the top of a step. */
export function contextItems(sectionId, data, hr = {}, caseInfo = {}, { mask = true } = {}) {
  const m = (kind, path) => { const v = val(data, path); return mask && v ? maskValue(kind, v) : v; };
  const name = fullNameOf(data) || caseInfo.name || '';
  const spouse = (data?.family?.members ?? []).find((r) => r?.relationship === 'Spouse')?.fullName;
  const cur = addressText(data?.address?.current);
  const perm = addressText(data?.address?.permanent);
  const bank = val(data, 'bank.main.accountNumber');
  const base = {
    pf: [
      ['Name', name], ["Father's / spouse's name", val(data, 'personal.main.fatherName') || spouse], ['Date of birth', val(data, 'personal.main.dob')],
      ['Gender', val(data, 'personal.main.gender')], ['Marital status', val(data, 'personal.main.maritalStatus')],
      ['Email', val(data, 'contact.main.personalEmail')], ['Mobile', val(data, 'contact.main.mobile')],
      ['Aadhaar', m('aadhaar', 'identity.aadhaar.number')], ['PAN', m('pan', 'identity.pan.number')], ['UAN', m('uan', 'identity.uan.number')],
      ['Bank account', bank && mask ? maskValue('bank', bank) : bank], ['IFSC', val(data, 'bank.main.ifsc')],
    ],
    nomination: [
      ['Name', name], ["Father's / husband's name", val(data, 'personal.main.fatherName') || spouse], ['Date of birth', val(data, 'personal.main.dob')],
      ['Gender', val(data, 'personal.main.gender')], ['Marital status', val(data, 'personal.main.maritalStatus')], ['Permanent address', perm || cur],
    ],
    gratuity: [
      ['Company', `${COMPANY.name}, ${COMPANY.address}`], ['Employee name', name], ['Gender', val(data, 'personal.main.gender')],
      ['Marital status', val(data, 'personal.main.maritalStatus')], ['Department', hr.department || ''], ['Post held', hr.designation || caseInfo.designation || ''],
      ['Date of appointment', hr.dateOfJoining || caseInfo.joiningDate || ''], ['Permanent address', perm || cur],
    ],
    bgv: [
      ['Applicant name', name], ["Father's name", val(data, 'personal.main.fatherName')], ['Current address', cur],
      ['Phone', val(data, 'contact.main.mobile')], ['Email', val(data, 'contact.main.personalEmail')],
      ['PAN', m('pan', 'identity.pan.number')], ['Aadhaar', m('aadhaar', 'identity.aadhaar.number')],
      ['Highest qualification', [val(data, 'education.highest.qualification'), val(data, 'education.highest.institution')].filter(Boolean).join(' — ')],
      ['Employers declared', String((data?.employment?.previous ?? []).length)],
    ],
    authorization: [['Employee', name], ['Employee ID', hr.employeeCode || ''], ['Date', new Date().toLocaleDateString('en-IN')]],
    travel: [['Employee', name], ['Employee ID', hr.employeeCode || ''], ['Designation', hr.designation || caseInfo.designation || ''], ['Date', new Date().toLocaleDateString('en-IN')]],
  };
  return (base[sectionId] ?? []).map(([label, value]) => ({ label, value: value || 'Will be filled in by HR' }));
}
