/* Employee Joining Form — the ONE definition of the form: steps, fields,
   conditions, validation, completion maths and masking.

   This exact file is copied to three places and must stay identical:
     apps/recruitment/src/utils/joiningSchema.ts   (candidate/employee wizard)
     apps/hr/src/utils/joiningSchema.ts            (HR review screen)
     apps/hr/supabase/functions/_shared/joiningSchema.ts   (server: completion + submit checks)
   No imports, so it runs unchanged in the browser and in Deno.

   Data shape (the central employee profile):  data[sectionId][groupId]
     - a "fields" group is an object  { fieldKey: value }
     - a "list" group is an array of such objects (family members, employers…)
   Values are strings ('Yes' / 'No' for yes-no fields). */

export type Cond = {
  path?: string; eq?: string; notEq?: string; in?: string[]; notIn?: string[]; filled?: boolean;
  all?: Cond[]; any?: Cond[];
};

export type Field = {
  key: string; label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'month' | 'select' | 'yesno' | 'textarea' | 'number' | 'consent';
  required?: boolean; requiredIf?: Cond; showIf?: Cond;
  options?: string[]; validate?: string; sensitive?: 'aadhaar' | 'pan' | 'bank' | 'uan' | 'passport';
  hint?: string; full?: boolean; readOnly?: boolean;
  notFuture?: boolean; notBefore?: string; minAge?: number; maxAge?: number; min?: number; max?: number;
  defaultValue?: string; group?: string;
};

export type Group = {
  id: string; title?: string; kind: 'fields' | 'list'; fields: Field[]; showIf?: Cond;
  min?: number; minIf?: Cond; itemTitle?: string; addLabel?: string; hint?: string;
};

export type Rule = { id: string; message: string; applies?: Cond; test: (data: any) => boolean };

export type Section = { id: string; title: string; icon: string; blurb?: string; groups: Group[]; rules?: Rule[] };

const YESNO = ['Yes', 'No'];
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];
const MARRIED: Cond = { path: 'personal.main.maritalStatus', eq: 'Married' };
const PREV_PF: Cond = { any: [{ path: 'pf.previous.previousEpfMember', eq: 'Yes' }, { path: 'pf.previous.previousEpsMember', eq: 'Yes' }] };
const INTL: Cond = { path: 'pf.international.internationalWorker', eq: 'Yes' };
const INTL_NO_PASSPORT: Cond = { all: [INTL, { path: 'personal.main.passportAvailable', notEq: 'Yes' }] };
const MINOR_ROW: Cond = { path: '$.minor', eq: 'Yes' };
const OTHER_OFFER: Cond = { path: 'employment.otherOffer.holdingOtherOffer', eq: 'Yes' };

const addressFields = (withResidence: boolean): Field[] => [
  { key: 'line1', label: 'Address line 1', type: 'text', required: true, full: true },
  { key: 'line2', label: 'Address line 2', type: 'text', full: true },
  { key: 'locality', label: 'Locality', type: 'text' },
  { key: 'landmark', label: 'Landmark', type: 'text' },
  { key: 'city', label: 'City', type: 'text', required: true },
  { key: 'district', label: 'District', type: 'text' },
  { key: 'state', label: 'State', type: 'select', required: true, options: STATES },
  { key: 'country', label: 'Country', type: 'text', required: true, defaultValue: 'India' },
  { key: 'pin', label: 'PIN code', type: 'text', required: true, validate: 'pin' },
  ...(withResidence ? [
    { key: 'residenceFrom', label: 'Residing here from', type: 'date' as const, notFuture: true },
    { key: 'residenceTo', label: 'Residing here till', type: 'date' as const, notBefore: 'residenceFrom', hint: 'Leave blank if you still live here.' },
    { key: 'residencePhone', label: 'Residence telephone', type: 'tel' as const, validate: 'phoneAny' },
    { key: 'residenceMobile', label: 'Residence mobile', type: 'tel' as const, validate: 'phone10' },
  ] : []),
];

export const SECTIONS: Section[] = [
  {
    id: 'personal', title: 'Personal', icon: 'UserRound', blurb: 'Your details as they appear on government documents.',
    groups: [
      {
        id: 'main', kind: 'fields', fields: [
          { key: 'firstName', label: 'First name', type: 'text', required: true, validate: 'name' },
          { key: 'middleName', label: 'Middle name', type: 'text', validate: 'name' },
          { key: 'lastName', label: 'Last name', type: 'text', required: true, validate: 'name' },
          { key: 'nameAsPerGovt', label: 'Name as per government document', type: 'text', required: true, validate: 'name', hint: 'Exactly as on PAN / Aadhaar.' },
          { key: 'dob', label: 'Date of birth', type: 'date', required: true, notFuture: true, minAge: 18, maxAge: 75 },
          { key: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female', 'Other'] },
          { key: 'maritalStatus', label: 'Marital status', type: 'select', required: true, options: ['Single/Unmarried', 'Married', 'Widow', 'Widower', 'Divorcee'] },
          { key: 'dateOfMarriage', label: 'Date of marriage', type: 'date', showIf: MARRIED, requiredIf: MARRIED, notFuture: true, notBefore: 'dob' },
          { key: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
          { key: 'fatherName', label: "Father's name", type: 'text', required: true, validate: 'name' },
          { key: 'physicalDisability', label: 'Physical disability', type: 'yesno', required: true },
          {
            key: 'disabilityCategory', label: 'Disability category', type: 'select', options: ['Locomotive Disability', 'Visual Disability', 'Hearing Disability', 'Other'],
            showIf: { path: 'personal.main.physicalDisability', eq: 'Yes' }, requiredIf: { path: 'personal.main.physicalDisability', eq: 'Yes' },
          },
          { key: 'nameChanged', label: 'Has your name changed since your documents were issued?', type: 'yesno', required: true, full: true, hint: 'A name-change proof is asked for only if Yes.' },
          { key: 'passportAvailable', label: 'Do you have a passport?', type: 'yesno', required: true },
        ],
      },
      {
        id: 'passport', title: 'Passport', kind: 'fields', showIf: { path: 'personal.main.passportAvailable', eq: 'Yes' }, fields: [
          { key: 'number', label: 'Passport number', type: 'text', required: true, validate: 'passport', sensitive: 'passport' },
          { key: 'placeOfIssue', label: 'Place of issue', type: 'text', required: true },
          { key: 'dateOfIssue', label: 'Date of issue', type: 'date', required: true, notFuture: true },
          { key: 'dateOfExpiry', label: 'Date of expiry', type: 'date', required: true, notBefore: 'dateOfIssue' },
        ],
      },
    ],
  },
  {
    id: 'contact', title: 'Contact', icon: 'Phone', blurb: 'How we reach you.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        { key: 'personalEmail', label: 'Personal email', type: 'email', required: true, validate: 'email' },
        { key: 'mobile', label: 'Mobile number', type: 'tel', required: true, validate: 'phone10' },
        { key: 'alternateMobile', label: 'Alternate mobile', type: 'tel', validate: 'phone10' },
      ],
    }],
  },
  {
    id: 'identity', title: 'Identity', icon: 'BadgeCheck', blurb: 'Entered once here — PF, gratuity and background verification all read these.',
    groups: [
      {
        id: 'pan', title: 'PAN', kind: 'fields', fields: [
          { key: 'number', label: 'PAN number', type: 'text', required: true, validate: 'pan', sensitive: 'pan' },
          { key: 'nameAsPerPan', label: 'Name as per PAN', type: 'text', required: true, validate: 'name' },
        ],
      },
      {
        id: 'aadhaar', title: 'Aadhaar', kind: 'fields', fields: [
          { key: 'number', label: 'Aadhaar number', type: 'text', required: true, validate: 'aadhaar', sensitive: 'aadhaar' },
          { key: 'nameAsPerAadhaar', label: 'Name as per Aadhaar', type: 'text', required: true, validate: 'name' },
        ],
      },
      {
        id: 'uan', title: 'UAN (if you already have one)', kind: 'fields', fields: [
          { key: 'number', label: 'UAN', type: 'text', validate: 'uan', sensitive: 'uan' },
        ],
      },
      {
        id: 'other', title: 'Another government ID (optional)', kind: 'fields', fields: [
          { key: 'documentType', label: 'Document type', type: 'select', options: ['Driving Licence', 'Passport', 'Voter ID', 'Other Government ID'] },
          {
            key: 'documentNumber', label: 'Document number', type: 'text',
            requiredIf: { path: 'identity.other.documentType', filled: true },
          },
          {
            key: 'nameAsPerDocument', label: 'Name as per document', type: 'text', validate: 'name',
            requiredIf: { path: 'identity.other.documentType', filled: true },
          },
        ],
      },
    ],
  },
  {
    id: 'family', title: 'Family', icon: 'Users', blurb: 'Add the people who matter for nominations and records — as many as you need.',
    groups: [{
      id: 'members', kind: 'list', itemTitle: 'Family member', addLabel: 'Add family member', fields: [
        { key: 'relationship', label: 'Relationship', type: 'select', required: true, options: ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Other'] },
        { key: 'fullName', label: 'Full name', type: 'text', required: true, validate: 'name' },
        { key: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female', 'Other'] },
        { key: 'dob', label: 'Date of birth', type: 'date', required: true, notFuture: true },
        { key: 'address', label: 'Address', type: 'text', full: true },
        { key: 'mobile', label: 'Mobile number', type: 'tel', validate: 'phone10' },
        { key: 'occupation', label: 'Occupation', type: 'text' },
        { key: 'dependent', label: 'Dependent on you?', type: 'yesno', required: true },
      ],
    }],
    rules: [
      {
        id: 'spouse', message: 'Add your spouse — your marital status is Married.', applies: MARRIED,
        test: (d: any) => (d?.family?.members ?? []).some((m: any) => m?.relationship === 'Spouse'),
      },
    ],
  },
  {
    id: 'address', title: 'Address', icon: 'MapPin', blurb: 'Where you live now and your permanent address.',
    groups: [
      { id: 'current', title: 'Current address', kind: 'fields', fields: addressFields(true) },
      {
        id: 'sameAs', kind: 'fields', fields: [
          { key: 'permanentSameAsCurrent', label: 'Permanent address is the same as current address', type: 'yesno', required: true, full: true },
        ],
      },
      {
        id: 'permanent', title: 'Permanent address', kind: 'fields',
        showIf: { path: 'address.sameAs.permanentSameAsCurrent', eq: 'No' }, fields: addressFields(false),
      },
    ],
  },
  {
    id: 'education', title: 'Education', icon: 'GraduationCap', blurb: 'Your qualifications. Anything from your application is already filled in.',
    groups: [
      {
        id: 'highest', title: 'Highest qualification', kind: 'fields', fields: [
          { key: 'qualification', label: 'Highest qualification', type: 'text', required: true },
          { key: 'course', label: 'Course / degree', type: 'text', required: true },
          { key: 'specialization', label: 'Specialization', type: 'text' },
          { key: 'yearOfPassing', label: 'Year / month of passing', type: 'month', required: true, notFuture: true },
          { key: 'institution', label: 'College / university', type: 'text', required: true, full: true },
        ],
      },
      {
        id: 'others', title: 'Other qualifications & certifications', kind: 'list', itemTitle: 'Qualification', addLabel: 'Add qualification', fields: [
          { key: 'qualification', label: 'Qualification / certification', type: 'text', required: true },
          { key: 'course', label: 'Course', type: 'text' },
          { key: 'specialization', label: 'Specialization', type: 'text' },
          { key: 'yearOfPassing', label: 'Year / month of passing', type: 'month', required: true, notFuture: true },
          { key: 'institution', label: 'College / university / institute', type: 'text', required: true, full: true },
        ],
      },
    ],
  },
  {
    id: 'employment', title: 'Employment', icon: 'Briefcase', blurb: 'Your work history. Experience is worked out from the employers you add.',
    groups: [
      {
        id: 'summary', kind: 'fields', fields: [
          { key: 'isFresher', label: 'Are you a fresher (no previous employment)?', type: 'yesno', required: true, full: true },
          { key: 'totalExperience', label: 'Total experience (years) — calculated', type: 'number', readOnly: true },
          { key: 'relevantExperience', label: 'Relevant experience (years)', type: 'number', min: 0, max: 60, showIf: { path: 'employment.summary.isFresher', eq: 'No' } },
          { key: 'primarySkill', label: 'Primary skill', type: 'text', required: true },
          { key: 'secondarySkill', label: 'Secondary skill', type: 'text' },
        ],
      },
      {
        id: 'previous', title: 'Previous employers', kind: 'list', itemTitle: 'Employer', addLabel: 'Add previous employer',
        showIf: { path: 'employment.summary.isFresher', eq: 'No' },
        minIf: { path: 'employment.summary.isFresher', eq: 'No' }, min: 1,
        fields: [
          { key: 'employerName', label: 'Employer name', type: 'text', required: true },
          { key: 'employerAddress', label: 'Employer address', type: 'text', required: true, full: true },
          { key: 'city', label: 'City', type: 'text', required: true },
          { key: 'state', label: 'State', type: 'select', required: true, options: STATES },
          { key: 'startMonth', label: 'Start (month & year)', type: 'month', required: true, notFuture: true },
          { key: 'endMonth', label: 'End (month & year)', type: 'month', required: true, notBefore: 'startMonth', notFuture: true },
          { key: 'designation', label: 'Designation at the time of leaving', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'employeeCode', label: 'Employee code', type: 'text' },
          { key: 'supervisorName', label: 'Supervisor name', type: 'text' },
          { key: 'supervisorContact', label: 'Supervisor contact number', type: 'tel', validate: 'phoneAny' },
          { key: 'ctc', label: 'CTC (offer letter / last appraisal)', type: 'number', required: true, min: 0 },
          { key: 'lastSalaryDrawn', label: 'Last salary drawn (per month)', type: 'number', required: true, min: 0 },
          { key: 'reasonForLeaving', label: 'Reason for leaving', type: 'text', required: true, full: true },
          { key: 'officeLandline', label: 'Office landline number(s)', type: 'text' },
        ],
      },
      {
        id: 'otherOffer', title: 'Other offer', kind: 'fields', fields: [
          { key: 'holdingOtherOffer', label: 'Are you currently holding any other offer letter?', type: 'yesno', required: true, full: true },
          { key: 'company', label: 'Company name', type: 'text', showIf: OTHER_OFFER, requiredIf: OTHER_OFFER },
          { key: 'designation', label: 'Designation', type: 'text', showIf: OTHER_OFFER, requiredIf: OTHER_OFFER },
          { key: 'offerDate', label: 'Offer date', type: 'date', notFuture: true, showIf: OTHER_OFFER, requiredIf: OTHER_OFFER },
          { key: 'joiningDate', label: 'Joining date', type: 'date', showIf: OTHER_OFFER, requiredIf: OTHER_OFFER },
        ],
      },
    ],
  },
  {
    id: 'emergency', title: 'Emergency contact', icon: 'LifeBuoy', blurb: 'Who we call if something happens.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        { key: 'name', label: 'Contact name', type: 'text', required: true, validate: 'name' },
        { key: 'relationship', label: 'Relationship', type: 'text', required: true },
        { key: 'contactNumber', label: 'Contact number', type: 'tel', required: true, validate: 'phone10' },
        { key: 'alternateNumber', label: 'Alternate number', type: 'tel', validate: 'phone10' },
        { key: 'address', label: 'Address', type: 'text', required: true, full: true },
        { key: 'city', label: 'City', type: 'text', required: true },
        { key: 'state', label: 'State', type: 'select', required: true, options: STATES },
        { key: 'pin', label: 'PIN code', type: 'text', required: true, validate: 'pin' },
      ],
    }],
  },
  {
    id: 'bank', title: 'Bank', icon: 'Wallet', blurb: 'Where your salary is paid. Also used for PF.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        { key: 'accountHolder', label: 'Account holder name', type: 'text', required: true, validate: 'name' },
        { key: 'bankName', label: 'Bank name', type: 'text', required: true },
        { key: 'accountNumber', label: 'Account number', type: 'text', required: true, validate: 'account', sensitive: 'bank' },
        { key: 'ifsc', label: 'IFSC code', type: 'text', required: true, validate: 'ifsc' },
        { key: 'branch', label: 'Branch', type: 'text' },
      ],
    }],
  },
  {
    id: 'pf', title: 'PF & UAN', icon: 'ShieldCheck', blurb: 'Provident fund (Form 11). Your name, DOB, Aadhaar, PAN, UAN and bank details are taken from the earlier steps.',
    groups: [
      {
        id: 'previous', title: 'Previous PF membership', kind: 'fields', fields: [
          { key: 'previousEpfMember', label: 'Were you earlier a member of the EPF Scheme, 1952?', type: 'yesno', required: true, full: true },
          { key: 'previousEpsMember', label: 'Were you earlier a member of the Employees Pension Scheme, 1995?', type: 'yesno', required: true, full: true },
          { key: 'previousPfAccountNumber', label: 'Previous PF account number', type: 'text', showIf: PREV_PF, requiredIf: PREV_PF },
          { key: 'pfEstablishmentCode', label: 'PF establishment code', type: 'text', showIf: PREV_PF },
          { key: 'pfExtension', label: 'PF extension', type: 'text', showIf: PREV_PF },
          { key: 'pfNumber', label: 'PF number', type: 'text', showIf: PREV_PF },
          { key: 'dateOfExit', label: 'Date of exit from previous employment', type: 'date', notFuture: true, showIf: PREV_PF, requiredIf: PREV_PF },
          { key: 'schemeCertificateNumber', label: 'Scheme certificate number (if issued)', type: 'text', showIf: { path: 'pf.previous.previousEpfMember', eq: 'Yes' } },
          { key: 'ppoNumber', label: 'PPO number (if issued)', type: 'text', showIf: { path: 'pf.previous.previousEpsMember', eq: 'Yes' } },
        ],
      },
      {
        id: 'international', title: 'International worker', kind: 'fields', fields: [
          { key: 'internationalWorker', label: 'Are you an international worker?', type: 'yesno', required: true, full: true },
          { key: 'countryOfOrigin', label: 'Country of origin', type: 'text', showIf: INTL, requiredIf: INTL },
          { key: 'passportNumber', label: 'Passport number', type: 'text', validate: 'passport', sensitive: 'passport', showIf: INTL_NO_PASSPORT, requiredIf: INTL_NO_PASSPORT },
          { key: 'passportValidFrom', label: 'Passport valid from', type: 'date', showIf: INTL_NO_PASSPORT, requiredIf: INTL_NO_PASSPORT },
          { key: 'passportValidTo', label: 'Passport valid to', type: 'date', notBefore: 'passportValidFrom', showIf: INTL_NO_PASSPORT, requiredIf: INTL_NO_PASSPORT },
        ],
      },
      {
        id: 'declaration', title: 'PF Form 11 declaration', kind: 'fields', fields: [
          { key: 'declTrue', label: 'The information given is true to the best of my knowledge.', type: 'consent', required: true, full: true },
          { key: 'declAadhaar', label: 'I authorise the use of my Aadhaar for verification / e-KYC where applicable.', type: 'consent', required: true, full: true },
          { key: 'declTransfer', label: 'I authorise transfer of my applicable PF and service details from my previous account.', type: 'consent', required: true, full: true },
          { key: 'declInform', label: 'I will inform my employer if any of this information changes.', type: 'consent', required: true, full: true },
          { key: 'place', label: 'Place', type: 'text', required: true },
        ],
      },
    ],
  },
  {
    id: 'nomination', title: 'PF nomination', icon: 'Users', blurb: 'PF Form 2 - EPF nominees and EPS family. Your name, address and DOB are taken from earlier steps.',
    groups: [
      {
        id: 'epfDecl', title: 'EPF declarations', kind: 'fields', fields: [
          { key: 'hasFamily', label: 'Do you have a family as defined under the EPF rules?', type: 'yesno', required: true, full: true },
          { key: 'parentsDependent', label: 'Are your father / mother dependent on you?', type: 'yesno', required: true, full: true },
        ],
      },
      {
        id: 'epfNominees', title: 'Part A - EPF nominees', kind: 'list', itemTitle: 'Nominee', addLabel: 'Add nominee', min: 1,
        hint: 'Shares of all nominees must add up to 100%.', fields: [
          { key: 'name', label: 'Nominee name', type: 'text', required: true, validate: 'name' },
          { key: 'relationship', label: 'Relationship with you', type: 'select', required: true, options: ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Other'] },
          { key: 'dob', label: 'Date of birth', type: 'date', required: true, notFuture: true },
          { key: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female', 'Other'] },
          { key: 'address', label: 'Complete address', type: 'text', required: true, full: true },
          { key: 'share', label: 'Share of provident fund (%)', type: 'number', required: true, min: 1, max: 100 },
          { key: 'minor', label: 'Minor (under 18)?', type: 'yesno', readOnly: true, hint: 'Worked out from the date of birth.' },
          { key: 'guardianName', label: 'Guardian name', type: 'text', validate: 'name', showIf: MINOR_ROW, requiredIf: MINOR_ROW },
          { key: 'guardianAddress', label: 'Guardian address', type: 'text', full: true, showIf: MINOR_ROW, requiredIf: MINOR_ROW },
          { key: 'preExistingDetails', label: 'Pre-existing disease / illness details (if applicable)', type: 'text', full: true },
        ],
      },
      {
        id: 'epsDecl', title: 'Part B - EPS family', kind: 'fields', fields: [
          { key: 'hasEpsFamily', label: 'Do you have a family entitled under the Employees Pension Scheme?', type: 'yesno', required: true, full: true },
        ],
      },
      {
        id: 'epsFamily', title: 'EPS family members', kind: 'list', itemTitle: 'Family member', addLabel: 'Add family member',
        showIf: { path: 'nomination.epsDecl.hasEpsFamily', eq: 'Yes' }, minIf: { path: 'nomination.epsDecl.hasEpsFamily', eq: 'Yes' }, min: 1, fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, validate: 'name' },
          { key: 'address', label: 'Complete address', type: 'text', required: true, full: true },
          { key: 'age', label: 'Age', type: 'number', required: true, min: 0, max: 120 },
          { key: 'relationship', label: 'Relationship with you', type: 'select', required: true, options: ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Other'] },
        ],
      },
      {
        id: 'epsPension', title: 'Nominee for monthly widow / children pension (if applicable)', kind: 'fields',
        showIf: { path: 'nomination.epsDecl.hasEpsFamily', eq: 'Yes' }, fields: [
          { key: 'name', label: 'Name', type: 'text', validate: 'name' },
          { key: 'address', label: 'Address', type: 'text', full: true, requiredIf: { path: 'nomination.epsPension.name', filled: true } },
          { key: 'dob', label: 'Date of birth', type: 'date', notFuture: true, requiredIf: { path: 'nomination.epsPension.name', filled: true } },
          { key: 'relationship', label: 'Relationship with you', type: 'text', requiredIf: { path: 'nomination.epsPension.name', filled: true } },
        ],
      },
      {
        id: 'confirm', kind: 'fields', fields: [
          { key: 'place', label: 'Place', type: 'text', required: true },
          { key: 'declConfirm', label: 'I confirm these nominations are correct and I have read the declarations above.', type: 'consent', required: true, full: true },
        ],
      },
    ],
    rules: [
      {
        id: 'epfShare', message: 'Nomination share must total 100%.',
        test: (d: any) => {
          const rows: any[] = d?.nomination?.epfNominees ?? [];
          return rows.length > 0 && Math.abs(rows.reduce((t, r) => t + (Number(r?.share) || 0), 0) - 100) < 0.001;
        },
      },
    ],
  },
  {
    id: 'gratuity', title: 'Gratuity nomination', icon: 'FileCheck', blurb: 'Payment of Gratuity - Form F. Your name, gender, marital status, joining date, designation and permanent address come from the profile and HR.',
    groups: [
      {
        id: 'details', kind: 'fields', fields: [
          { key: 'religion', label: 'Religion', type: 'select', required: true, options: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'] },
          { key: 'ticketNumber', label: 'Ticket / serial number (if any)', type: 'text' },
        ],
      },
      {
        id: 'nominees', title: 'Nominees', kind: 'list', itemTitle: 'Nominee', addLabel: 'Add nominee', min: 1, hint: 'Shares of all nominees must add up to 100%.', fields: [
          { key: 'name', label: 'Full name', type: 'text', required: true, validate: 'name' },
          { key: 'relationship', label: 'Relationship with you', type: 'select', required: true, options: ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Other'] },
          { key: 'age', label: 'Age', type: 'number', required: true, min: 0, max: 120 },
          { key: 'share', label: 'Share of gratuity (%)', type: 'number', required: true, min: 1, max: 100 },
          { key: 'address', label: 'Full address', type: 'text', required: true, full: true },
        ],
      },
      {
        id: 'declarations', title: 'Family declarations', kind: 'fields', fields: [
          { key: 'hasFamily', label: 'Do you have a family as defined under the gratuity rules?', type: 'yesno', required: true, full: true },
          { key: 'parentsDependent', label: 'Are your parents dependent on you?', type: 'yesno', required: true, full: true },
          { key: 'priorNominationVoid', label: 'Any earlier gratuity nomination made by me is cancelled by this nomination.', type: 'consent', required: true, full: true },
        ],
      },
      {
        id: 'witnesses', title: 'Witnesses', kind: 'fields', fields: [
          { key: 'w1Name', label: 'Witness 1 - full name', type: 'text', required: true, validate: 'name' },
          { key: 'w1Address', label: 'Witness 1 - full address', type: 'text', required: true },
          { key: 'w2Name', label: 'Witness 2 - full name', type: 'text', required: true, validate: 'name' },
          { key: 'w2Address', label: 'Witness 2 - full address', type: 'text', required: true },
          { key: 'place', label: 'Place', type: 'text', required: true },
        ],
      },
      {
        id: 'ack', title: 'Acknowledgement', kind: 'fields', fields: [
          { key: 'copyReceived', label: 'I acknowledge receipt of a duplicate / certified copy of this nomination.', type: 'consent', full: true, hint: 'Tick this when HR hands you the certified copy - it is not needed to submit.' },
        ],
      },
    ],
    rules: [
      {
        id: 'gratuityShare', message: 'Nomination share must total 100%.',
        test: (d: any) => {
          const rows: any[] = d?.gratuity?.nominees ?? [];
          return rows.length > 0 && Math.abs(rows.reduce((t, r) => t + (Number(r?.share) || 0), 0) - 100) < 0.001;
        },
      },
    ],
  },
  {
    id: 'bgv', title: 'Background verification', icon: 'Eye', blurb: 'Your name, address, phone, email, education and employment are read from the earlier steps.',
    groups: [
      {
        id: 'main', kind: 'fields', fields: [
          { key: 'idType', label: 'ID used for verification', type: 'select', required: true, options: ['Driving Licence', 'Aadhaar', 'PAN Card', 'Passport', 'Other approved ID'] },
          {
            key: 'idNumber', label: 'ID number', type: 'text', hint: 'Aadhaar, PAN and passport numbers are already on your profile.',
            showIf: { path: 'bgv.main.idType', in: ['Driving Licence', 'Other approved ID'] }, requiredIf: { path: 'bgv.main.idType', in: ['Driving Licence', 'Other approved ID'] },
          },
        ],
      },
      {
        id: 'consent', title: 'Consent', kind: 'fields', fields: [
          { key: 'read', label: 'I have read and understood the Background Verification consent.', type: 'consent', required: true, full: true },
          { key: 'authorize', label: 'I authorise the verification process.', type: 'consent', required: true, full: true },
          { key: 'accurate', label: 'I confirm the information and documents I provided are accurate.', type: 'consent', required: true, full: true },
        ],
      },
    ],
  },
  {
    id: 'authorization', title: 'Letter of authorization', icon: 'BadgeCheck', blurb: 'Authorisation for the company to verify what you have told us.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        { key: 'verifyResume', label: 'I authorise the company to verify the information in my resume and application.', type: 'consent', required: true, full: true },
        { key: 'enquiries', label: 'I authorise the company to make the necessary enquiries.', type: 'consent', required: true, full: true },
        { key: 'thirdParties', label: 'I authorise relevant persons and organisations to give information about me for this purpose.', type: 'consent', required: true, full: true },
        { key: 'falseInfo', label: 'I understand that false information can affect my employment or offer, and I accept the company decision.', type: 'consent', required: true, full: true },
      ],
    }],
  },
  {
    id: 'travel', title: 'Travel & mobility', icon: 'Route', blurb: 'Your name, employee ID and designation are filled in from HR.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        {
          key: 'consent', type: 'consent', required: true, full: true,
          label: 'I understand my role may involve domestic or international travel, client locations, branch offices, project sites, temporary or long-term deployment, training, meetings, support activities and relocation or deputation. I will keep my passport, visa, ID and statutory documents ready as needed.',
        },
      ],
    }],
  },
  {
    id: 'declaration', title: 'Final declaration', icon: 'CheckCircle2', blurb: 'The last step before you submit.',
    groups: [{
      id: 'main', kind: 'fields', fields: [
        { key: 'isTrue', label: 'The information I have provided is true and correct.', type: 'consent', required: true, full: true },
        { key: 'genuine', label: 'The documents I upload are genuine.', type: 'consent', required: true, full: true },
        { key: 'verify', label: 'The company may verify this information.', type: 'consent', required: true, full: true },
        { key: 'bgv', label: 'I agree to background verification.', type: 'consent', required: true, full: true },
        { key: 'policies', label: 'I agree to the applicable company policies.', type: 'consent', required: true, full: true },
        { key: 'falseInfo', label: 'I understand that incorrect or false information may affect my employment as per company policy.', type: 'consent', required: true, full: true },
        { key: 'read', label: 'I have read and understood these declarations.', type: 'consent', required: true, full: true },
        { key: 'place', label: 'Place', type: 'text', required: true },
      ],
    }],
  },
];

/* Fields only HR fills in — the employee sees them read-only. */
export const HR_FIELDS: Field[] = [
  { group: 'Assignment', key: 'employeeCode', label: 'Employee code', type: 'text' },
  { group: 'Assignment', key: 'dateOfJoining', label: 'Date of joining', type: 'date' },
  { group: 'Assignment', key: 'grade', label: 'Grade (as per offer letter)', type: 'text' },
  { group: 'Assignment', key: 'designation', label: 'Designation (as per offer letter)', type: 'text' },
  { group: 'Assignment', key: 'ccentrikEmail', label: 'Ccentrik email ID', type: 'email', validate: 'email' },
  { group: 'Assignment', key: 'clientName', label: 'Client name', type: 'text' },
  { group: 'Assignment', key: 'clientWorkLocation', label: 'Client work location', type: 'text' },
  { group: 'Assignment', key: 'clientEmail', label: 'Client email ID', type: 'email', validate: 'email' },
  { group: 'Assignment', key: 'reportingManager', label: 'Reporting manager', type: 'text' },
  { group: 'Assignment', key: 'department', label: 'Department', type: 'text' },
  { group: 'Assignment', key: 'projectName', label: 'Project name', type: 'text' },
  { group: 'Assignment', key: 'branchName', label: 'Branch name', type: 'text', defaultValue: 'Noida' },
  { group: 'Assignment', key: 'zetaCard', label: 'Zeta card', type: 'select', options: ['1100', '2200', 'Opt Out'] },
  { group: 'Assignment', key: 'pfRestrictTo1800', label: "PF: restrict employee's contribution to INR 1800", type: 'select', options: YESNO },
  { group: 'PF employer section', key: 'pfNumber', label: 'PF number', type: 'text' },
  { group: 'PF employer section', key: 'uanAllotted', label: 'UAN allotted', type: 'text', validate: 'uan' },
  { group: 'PF employer section', key: 'pfKycStatus', label: 'PF KYC status', type: 'select', options: ['Not Uploaded', 'Uploaded but Not Approved', 'Uploaded and Approved'] },
  { group: 'PF employer section', key: 'dscApprovalStatus', label: 'DSC approval status', type: 'select', options: ['Pending', 'Approved', 'Not applicable'] },
  { group: 'PF employer section', key: 'transferRequestStatus', label: 'PF transfer request status', type: 'select', options: ['Not applicable', 'Requested', 'Completed'] },
  { group: 'PF employer section', key: 'form13Status', label: 'Form 13 status', type: 'select', options: ['Not applicable', 'Required', 'Submitted'] },
  { group: 'PF employer section', key: 'pfEmployerDate', label: 'Employer date', type: 'date' },
  { group: 'PF employer section', key: 'pfEmployerOfficer', label: 'Authorised officer (name and signature)', type: 'text' },
  { group: 'PF employer certification', key: 'pfEstablishmentName', label: 'Establishment name', type: 'text' },
  { group: 'PF employer certification', key: 'pfEstablishmentAddress', label: 'Establishment address', type: 'text' },
  { group: 'Gratuity employer certification', key: 'gratuityReference', label: 'Employer reference number', type: 'text' },
  { group: 'Gratuity employer certification', key: 'gratuityOfficer', label: 'Authorised officer name', type: 'text' },
  { group: 'Gratuity employer certification', key: 'gratuityOfficerDesignation', label: 'Officer designation', type: 'text' },
  { group: 'Gratuity employer certification', key: 'gratuityDate', label: 'Date', type: 'date' },
];

export const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', under_review: 'Under review',
  correction_required: 'Correction required', resubmitted: 'Resubmitted', verified: 'Verified', completed: 'Completed',
};

// The employee may edit only in these states (correction_required: only the flagged sections).
export const EDITABLE_STATUSES = ['not_started', 'in_progress', 'correction_required'];

/* ---------- paths & conditions ---------- */

export function getPath(data: any, path: string): any {
  return path.split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), data);
}

const filled = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

/** `row` is the list row a field sits in; a path starting with "$." reads from it. */
export function evalCond(c: Cond | undefined, data: any, row?: any): boolean {
  if (!c) return true;
  if (c.all) return c.all.every((x) => evalCond(x, data, row));
  if (c.any) return c.any.some((x) => evalCond(x, data, row));
  const v = c.path ? (c.path.startsWith('$.') ? row?.[c.path.slice(2)] : getPath(data, c.path)) : undefined;
  if (c.filled !== undefined) return filled(v) === c.filled;
  if (c.eq !== undefined) return String(v ?? '') === c.eq;
  if (c.notEq !== undefined) return String(v ?? '') !== c.notEq;
  if (c.in) return c.in.includes(String(v ?? ''));
  if (c.notIn) return !c.notIn.includes(String(v ?? ''));
  return true;
}

/* ---------- validators ---------- */

const NAME_RE = /^[\p{L}][\p{L} .'-]*$/u;
export const VALIDATORS: Record<string, (v: string) => string> = {
  name: (v) => (v.length <= 80 && NAME_RE.test(v) ? '' : 'Enter a valid name (letters only).'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.'),
  phone10: (v) => (/^(?:\+?91[\s-]?|0)?[6-9]\d{9}$/.test(v.trim()) ? '' : 'Enter a valid 10-digit mobile number.'),
  phoneAny: (v) => {
    const d = v.replace(/\D/g, '').length;
    return /^\+?[0-9 ()-]+$/.test(v) && d >= 7 && d <= 15 ? '' : 'Enter a valid phone number.';
  },
  pan: (v) => (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()) ? '' : 'PAN looks like ABCDE1234F.'),
  aadhaar: (v) => (/^[2-9]\d{11}$/.test(v.replace(/\s/g, '')) ? '' : 'Aadhaar must be 12 digits.'),
  uan: (v) => (/^\d{12}$/.test(v.replace(/\s/g, '')) ? '' : 'UAN must be 12 digits.'),
  pin: (v) => (/^[1-9]\d{5}$/.test(v.trim()) ? '' : 'PIN code must be 6 digits.'),
  ifsc: (v) => (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase().trim()) ? '' : 'IFSC looks like HDFC0001234.'),
  account: (v) => (/^\d{9,18}$/.test(v.replace(/\s/g, '')) ? '' : 'Account number must be 9–18 digits.'),
  passport: (v) => (/^[A-Z0-9]{6,9}$/.test(v.toUpperCase().trim()) ? '' : 'Enter a valid passport number.'),
};

const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Error message for one value ('' = fine). `obj` is the group/row the field lives in (for notBefore). */
export function fieldError(f: Field, value: any, obj: any = {}, data: any = {}, required = false): string {
  const v = value === undefined || value === null ? '' : String(value).trim();
  if (f.type === 'consent') return required && v !== 'Yes' ? 'Please confirm to continue.' : '';
  if (!v) return required ? `${f.label} is required.` : '';
  if (f.type === 'date') {
    if (!isoDate(v)) return 'Enter a valid date.';
    if (f.notFuture && v > todayIso()) return "This date can't be in the future.";
    if (f.notBefore && filled(obj?.[f.notBefore]) && isoDate(String(obj[f.notBefore])) && v < String(obj[f.notBefore])) return 'This date is before the one it should follow.';
    if (f.minAge || f.maxAge) {
      const age = (Date.now() - new Date(`${v}T00:00:00Z`).getTime()) / (365.25 * 86400000);
      if (f.minAge && age < f.minAge) return `You must be at least ${f.minAge} years old.`;
      if (f.maxAge && age > f.maxAge) return 'Please check the date of birth.';
    }
  } else if (f.type === 'month') {
    if (!isMonth(v)) return 'Choose a month and year.';
    if (f.notFuture && v > todayIso().slice(0, 7)) return "This can't be in the future.";
    if (f.notBefore && filled(obj?.[f.notBefore]) && isMonth(String(obj[f.notBefore])) && v < String(obj[f.notBefore])) return 'End can’t be before the start.';
  } else if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Enter a number.';
    if (n < (f.min ?? 0)) return 'This can’t be negative.';
    if (f.max !== undefined && n > f.max) return 'This looks too large.';
  } else if (f.type === 'select' && f.options && !f.options.includes(v)) {
    return 'Choose one of the options.';
  } else if (f.type === 'yesno' && !YESNO.includes(v)) {
    return 'Choose Yes or No.';
  }
  if (f.validate) {
    const msg = VALIDATORS[f.validate]?.(v);
    if (msg) return msg;
  }
  if (v.length > 300) return 'This is too long.';
  return '';
}

export function fieldIsVisible(f: Field, data: any, row?: any): boolean { return evalCond(f.showIf, data, row); }
export function fieldIsRequired(f: Field, data: any, row?: any): boolean {
  if (!fieldIsVisible(f, data, row)) return false;
  return !!f.required || (f.requiredIf ? evalCond(f.requiredIf, data, row) : false);
}
export function groupIsVisible(g: Group, data: any): boolean { return evalCond(g.showIf, data); }

/* ---------- derived values ---------- */

/** Whole months between two YYYY-MM values, inclusive of both months. */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
}

export function calcTotalExperience(previous: any[]): number {
  let months = 0;
  for (const e of previous ?? []) {
    if (isMonth(String(e?.startMonth ?? '')) && isMonth(String(e?.endMonth ?? '')) && e.endMonth >= e.startMonth) {
      months += monthsBetween(e.startMonth, e.endMonth);
    }
  }
  return Math.round((months / 12) * 10) / 10;
}

/** Side effects that keep one source of truth: permanent = current when asked, computed experience, tidy IDs. */
export function normalizeData(input: any): any {
  const data = JSON.parse(JSON.stringify(input ?? {}));
  const g = (s: string, id: string) => { data[s] = data[s] ?? {}; data[s][id] = data[s][id] ?? {}; return data[s][id]; };

  const same = getPath(data, 'address.sameAs.permanentSameAsCurrent');
  if (same === 'Yes') {
    const cur = g('address', 'current');
    const perm: any = {};
    for (const k of ['line1', 'line2', 'locality', 'landmark', 'city', 'district', 'state', 'country', 'pin']) if (filled(cur[k])) perm[k] = cur[k];
    data.address.permanent = perm;
  }

  const summary = g('employment', 'summary');
  if (summary.isFresher === 'Yes') {
    summary.totalExperience = '0';
    summary.relevantExperience = '0';
    data.employment.previous = [];
  } else if (summary.isFresher === 'No') {
    summary.totalExperience = String(calcTotalExperience(data.employment.previous ?? []));
  }

  for (const r of data.nomination?.epfNominees ?? []) {
    if (r && filled(r.dob) && isoDate(String(r.dob))) r.minor = (Date.now() - new Date(`${r.dob}T00:00:00Z`).getTime()) / (365.25 * 86400000) < 18 ? 'Yes' : 'No';
  }

  const up = (o: any, k: string) => { if (filled(o?.[k])) o[k] = String(o[k]).toUpperCase().replace(/\s/g, ''); };
  up(data.identity?.pan, 'number');
  up(data.bank?.main, 'ifsc');
  up(data.personal?.passport, 'number');
  for (const [o, k] of [[data.identity?.aadhaar, 'number'], [data.identity?.uan, 'number'], [data.bank?.main, 'accountNumber']] as [any, string][]) {
    if (filled(o?.[k])) o[k] = String(o[k]).replace(/\s/g, '');
  }
  if (data.personal?.main) {
    const m = data.personal.main;
    m.fullName = [m.firstName, m.middleName, m.lastName].filter(filled).join(' ');
  }
  return data;
}

/* ---------- validation & completion ---------- */

export type SectionProgress = { done: number; total: number; percent: number; errors: Record<string, string> };

export function sectionProgress(section: Section, data: any): SectionProgress {
  const errors: Record<string, string> = {};
  let done = 0;
  let total = 0;

  for (const g of section.groups) {
    if (!groupIsVisible(g, data)) continue;
    if (g.kind === 'fields') {
      const obj = data?.[section.id]?.[g.id] ?? {};
      for (const f of g.fields) {
        if (!fieldIsVisible(f, data)) continue;
        const req = fieldIsRequired(f, data);
        const err = fieldError(f, obj[f.key], obj, data, req);
        if (req) { total += 1; if (!err) done += 1; }
        if (err) errors[`${section.id}.${g.id}.${f.key}`] = err;
      }
    } else {
      const rows: any[] = data?.[section.id]?.[g.id] ?? [];
      const need = (g.min ?? 0) > 0 && evalCond(g.minIf, data) ? g.min! : 0;
      if (need) {
        total += 1;
        if (rows.length >= need) done += 1;
        else errors[`${section.id}.${g.id}`] = `Add at least ${need} ${(g.itemTitle ?? 'entry').toLowerCase()}.`;
      }
      rows.forEach((row, i) => {
        for (const f of g.fields) {
          if (!fieldIsVisible(f, data, row)) continue;
          const req = fieldIsRequired(f, data, row);
          const err = fieldError(f, row?.[f.key], row, data, req);
          if (req) { total += 1; if (!err) done += 1; }
          if (err) errors[`${section.id}.${g.id}.${i}.${f.key}`] = err;
        }
      });
    }
  }

  for (const r of section.rules ?? []) {
    if (!evalCond(r.applies, data)) continue;
    total += 1;
    if (r.test(data)) done += 1; else errors[`${section.id}.rule.${r.id}`] = r.message;
  }
  return { done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100), errors };
}

export function validateAll(rawData: any): { percent: number; sections: Record<string, SectionProgress>; errors: Record<string, string>; complete: boolean } {
  const data = normalizeData(rawData);
  const sections: Record<string, SectionProgress> = {};
  const errors: Record<string, string> = {};
  let done = 0;
  let total = 0;
  for (const s of SECTIONS) {
    const p = sectionProgress(s, data);
    sections[s.id] = p;
    done += p.done;
    total += p.total;
    Object.assign(errors, p.errors);
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  // "complete" = every required item satisfied AND no field holds an invalid (even optional) value.
  return { percent, sections, errors, complete: done === total && Object.keys(errors).length === 0 };
}


/* =====================================================================
   Document requirement engine
   ---------------------------------------------------------------------
   DOC_REFERENCE is the master / reference list — NOT a rule that every
   employee must provide every item. For each employee the engine works out,
   from their own answers, which requirements APPLY (fresher vs experienced,
   how many previous employers, other offer, same address…), which are optional,
   and which don't apply at all. Whether joining can proceed depends on HR
   resolving the APPLICABLE requirements — never on 100% of this list.
   HR/Admin can change the classification and switches per requirement
   (stored in joining_document_config); DOC_REFERENCE is the default. */

export type DocClass = 'critical' | 'conditional' | 'optional';
export type DocRef = {
  key: string; name: string; group: string; classification: DocClass;
  cannotProvide: boolean; naAllowed: boolean; hrApproval: boolean;
  perEmployer?: boolean; anyOf?: string; dataOnly?: boolean;
  maxFiles: number; reasons: string[]; hint?: string; sort: number; active?: boolean;
};

const REASONS = ['Document not available', 'Not issued by the employer / institution', 'Lost or misplaced', 'Application in process', 'Not applicable to me', 'Other'];
const ref = (r: Partial<DocRef> & Pick<DocRef, 'key' | 'name' | 'group' | 'classification' | 'sort'>): DocRef => ({
  cannotProvide: true, naAllowed: false, hrApproval: true, maxFiles: 3, reasons: REASONS, active: true, ...r,
});

export const DOC_REFERENCE: DocRef[] = [
  ref({ key: 'pan_card', name: 'PAN card', group: 'Identity proof', classification: 'critical', anyOf: 'identity_proof', maxFiles: 2, sort: 10, hint: 'PAN or Aadhaar — one of the two is enough.' }),
  ref({ key: 'aadhaar_card', name: 'Aadhaar card (front and back)', group: 'Identity proof', classification: 'critical', anyOf: 'identity_proof', maxFiles: 2, sort: 11 }),
  ref({ key: 'passport', name: 'Passport', group: 'Identity proof', classification: 'optional', maxFiles: 4, sort: 12,
    reasons: ['Passport not available', 'Passport application in process', 'Passport expired', 'Passport not applicable', 'Other'], hint: 'Not mandatory — you can choose Cannot provide with a reason.' }),
  ref({ key: 'tenth_certificate', name: '10th certificate', group: 'Education', classification: 'critical', maxFiles: 3, sort: 20 }),
  ref({ key: 'twelfth_certificate', name: '12th certificate', group: 'Education', classification: 'critical', maxFiles: 3, sort: 21 }),
  ref({ key: 'degree_documents', name: 'Degree certificate / semester-wise mark sheets', group: 'Education', classification: 'critical', maxFiles: 12, sort: 22, hint: 'Upload every semester mark sheet here — they are checked together as one requirement.' }),
  ref({ key: 'address_proof_current', name: 'Current address proof', group: 'Address proof', classification: 'critical', maxFiles: 3, sort: 30 }),
  ref({ key: 'address_proof_permanent', name: 'Permanent address proof', group: 'Address proof', classification: 'critical', maxFiles: 3, sort: 31 }),
  ref({ key: 'prev_offer_letter', name: 'Offer letter', group: 'Previous employment', classification: 'conditional', perEmployer: true, sort: 40 }),
  ref({ key: 'prev_appointment_letter', name: 'Appointment letter', group: 'Previous employment', classification: 'conditional', perEmployer: true, sort: 41 }),
  ref({ key: 'prev_relieving_letter', name: 'Relieving letter', group: 'Previous employment', classification: 'conditional', perEmployer: true, sort: 42 }),
  ref({ key: 'payslips', name: 'Latest 3 months payslips', group: 'Previous employment', classification: 'conditional', perEmployer: true, maxFiles: 3, sort: 43 }),
  ref({ key: 'increment_letter', name: 'Increment letter', group: 'Previous employment', classification: 'optional', naAllowed: true, sort: 44, hint: 'Optional — not every employee has one.' }),
  ref({ key: 'employment_details', name: 'Employment details (from your form)', group: 'Employment', classification: 'conditional', dataOnly: true, cannotProvide: false, maxFiles: 0, sort: 45 }),
  ref({ key: 'passport_photos', name: 'Passport-size photographs (2, blue background)', group: 'Other joining documents', classification: 'critical', maxFiles: 2, sort: 50, hint: 'HR can accept one digital photograph if that is enough.' }),
  ref({ key: 'cancelled_cheque', name: 'Cancelled cheque', group: 'Other joining documents', classification: 'conditional', maxFiles: 2, sort: 51 }),
  ref({ key: 'other_offer_letter', name: 'Current / other offer letter', group: 'Other joining documents', classification: 'optional', naAllowed: true, maxFiles: 2, sort: 52 }),
  ref({ key: 'name_change_proof', name: 'Name change proof', group: 'Other joining documents', classification: 'conditional', maxFiles: 2, sort: 53 }),
];

export type DocApplicability = 'applicable' | 'optional' | 'not_applicable';
export type DocReq = {
  itemKey: string; refKey: string; name: string; group: string; classification: DocClass; applicability: DocApplicability;
  naReason?: string; employerIndex?: number; anyOf?: string; cannotProvide: boolean; naAllowed: boolean; hrApproval: boolean;
  dataOnly?: boolean; maxFiles: number; reasons: string[]; hint?: string; sort: number;
};

/** What each requirement looks like for THIS employee. `cfg` is HR's configuration (defaults to DOC_REFERENCE). */
export function deriveRequirements(rawData: any, cfg: DocRef[] = DOC_REFERENCE): DocReq[] {
  const data = normalizeData(rawData);
  const fresher = getPath(data, 'employment.summary.isFresher');
  const employers: any[] = data?.employment?.previous ?? [];
  const qual = String(getPath(data, 'education.highest.qualification') ?? '').toLowerCase();
  const schoolOnly = qual !== '' && /(^|\b)(10th|ssc|12th|hsc|higher secondary|secondary)(\b|$)/.test(qual);
  const sameAddress = getPath(data, 'address.sameAs.permanentSameAsCurrent') === 'Yes';
  const nameChanged = getPath(data, 'personal.main.nameChanged') === 'Yes';
  const otherOffer = getPath(data, 'employment.otherOffer.holdingOtherOffer');
  const out: DocReq[] = [];

  for (const c of cfg.filter((x) => x.active !== false).sort((a, b) => a.sort - b.sort)) {
    const base = (over: Partial<DocReq>): DocReq => ({
      itemKey: c.key, refKey: c.key, name: c.name, group: c.group, classification: c.classification,
      applicability: c.classification === 'optional' ? 'optional' : 'applicable',
      anyOf: c.anyOf, cannotProvide: c.cannotProvide, naAllowed: c.naAllowed, hrApproval: c.hrApproval, dataOnly: c.dataOnly,
      maxFiles: c.maxFiles, reasons: c.reasons, hint: c.hint, sort: c.sort, ...over,
    });
    const na = (reason: string, over: Partial<DocReq> = {}) => base({ applicability: 'not_applicable', naReason: reason, ...over });

    if (c.perEmployer) {
      if (fresher === 'No' && employers.length > 0) {
        employers.forEach((e, i) => out.push(base({ itemKey: `${c.key}:${i}`, employerIndex: i, name: `${c.name} — ${e?.employerName || `Employer ${i + 1}`}` })));
      } else if (fresher === 'Yes') out.push(na('Fresher'));
      else out.push(na(fresher === 'No' ? 'No previous employer added yet' : 'Answer the Employment step first'));
      continue;
    }
    switch (c.key) {
      case 'increment_letter':
        out.push(fresher === 'No' ? base({}) : na(fresher === 'Yes' ? 'Fresher' : 'Answer the Employment step first'));
        break;
      case 'employment_details':
        out.push(fresher === 'Yes' ? na('Fresher') : base({}));
        break;
      case 'degree_documents':
        out.push(schoolOnly ? na('No degree declared') : base({}));
        break;
      case 'address_proof_permanent':
        out.push(sameAddress ? na('Same as current address — one proof covers both') : base({}));
        break;
      case 'other_offer_letter':
        out.push(otherOffer === 'Yes' ? base({}) : na('No other offer held'));
        break;
      case 'name_change_proof':
        out.push(nameChanged ? base({}) : na('Name has not changed'));
        break;
      default:
        out.push(base({}));
    }
  }
  return out;
}

export type DocStatus = 'awaiting' | 'submitted' | 'reason_submitted' | 'approved' | 'approved_with_reason' | 'na_accepted' | 'rejected' | 'clarification_required';
export type DocItemState = { status?: DocStatus; choice?: string | null; files?: any[]; reasonText?: string | null; hrRemarks?: string | null };

export const DOC_STATUS_LABEL: Record<string, string> = {
  submitted: 'Pending HR Review', reason_submitted: 'Cannot Provide – Reason Submitted', approved: 'Approved',
  approved_with_reason: 'Approved with Reason', na_accepted: 'Not Required for This Employee', rejected: 'Rejected', clarification_required: 'Clarification Required',
};
const RESOLVED: string[] = ['approved', 'approved_with_reason', 'na_accepted'];

/** A system "not applicable" needs no HR click — except the employment-details item, where HR confirms the fresher / employer-count answer. */
const needsHrAccept = (r: DocReq) => !!r.dataOnly;

export function docLabel(r: DocReq, s: DocItemState = {}): { label: string; tone: 'green' | 'amber' | 'red' | 'grey' | 'blue' } {
  const st = s.status ?? 'awaiting';
  if (r.applicability === 'not_applicable' && st === 'awaiting') return { label: `Not Applicable${r.naReason ? ` – ${r.naReason}` : ''}`, tone: 'grey' };
  if (st === 'awaiting') return r.classification === 'critical' ? { label: 'Required', tone: 'red' } : r.classification === 'conditional' ? { label: 'Applicable', tone: 'blue' } : { label: 'Optional', tone: 'grey' };
  const tone = RESOLVED.includes(st) ? 'green' : st === 'rejected' ? 'red' : st === 'clarification_required' ? 'red' : 'amber';
  const label = st === 'reason_submitted' && s.choice === 'not_applicable' ? 'Not Applicable – Reason Submitted' : DOC_STATUS_LABEL[st];
  return { label, tone };
}

export function isResolved(r: DocReq, s: DocItemState = {}): boolean {
  const st = s.status ?? 'awaiting';
  if (RESOLVED.includes(st)) return true;
  return r.applicability === 'not_applicable' && !needsHrAccept(r);
}

const rank = (r: DocReq, s: DocItemState = {}) => (isResolved(r, s) ? 3 : ['submitted', 'reason_submitted'].includes(s.status ?? '') ? 2 : ['rejected', 'clarification_required'].includes(s.status ?? '') ? 1 : 0);

export type DocUnit = { key: string; name: string; group: string; req: DocReq; state: DocItemState; members: { req: DocReq; state: DocItemState }[]; resolved: boolean; blocking: boolean; applicable: boolean };

/** One unit per requirement — alternatives (PAN / Aadhaar) collapse into ONE "Identity proof" unit satisfied by any of them. */
export function docUnits(reqs: DocReq[], states: Record<string, DocItemState>): DocUnit[] {
  const units: DocUnit[] = [];
  const grouped = new Map<string, DocUnit>();
  for (const r of reqs) {
    const s = states[r.itemKey] ?? {};
    if (r.anyOf) {
      let u = grouped.get(r.anyOf);
      if (!u) {
        u = { key: r.anyOf, name: 'Identity proof (PAN or Aadhaar)', group: r.group, req: r, state: s, members: [], resolved: false, blocking: true, applicable: true };
        grouped.set(r.anyOf, u); units.push(u);
      }
      u.members.push({ req: r, state: s });
      if (rank(r, s) > rank(u.req, u.state)) { u.req = r; u.state = s; }
      u.resolved = u.members.some((m) => isResolved(m.req, m.state));
      continue;
    }
    units.push({
      key: r.itemKey, name: r.name, group: r.group, req: r, state: s, members: [{ req: r, state: s }], resolved: isResolved(r, s),
      blocking: (r.applicability === 'applicable' && r.classification !== 'optional') || (r.applicability === 'not_applicable' && needsHrAccept(r)),
      applicable: r.applicability !== 'not_applicable',
    });
  }
  return units;
}

export type DocSummary = {
  totalReference: number; applicable: number; submitted: number; approved: number; approvedWithReason: number; notApplicable: number;
  pendingReview: number; reasonSubmitted: number; rejected: number; clarification: number; missing: number; unresolved: string[]; ready: boolean;
};

export function docSummary(reqs: DocReq[], states: Record<string, DocItemState>, totalReference = DOC_REFERENCE.length): DocSummary {
  const units = docUnits(reqs, states);
  const s: DocSummary = { totalReference, applicable: 0, submitted: 0, approved: 0, approvedWithReason: 0, notApplicable: 0, pendingReview: 0, reasonSubmitted: 0, rejected: 0, clarification: 0, missing: 0, unresolved: [], ready: true };
  for (const u of units) {
    const st = u.state.status ?? 'awaiting';
    if (!u.applicable || st === 'na_accepted') {
      s.notApplicable += 1;
    } else {
      s.applicable += 1;
      if (st === 'approved') s.approved += 1;
      else if (st === 'approved_with_reason') s.approvedWithReason += 1;
      else if (st === 'submitted') s.pendingReview += 1;
      else if (st === 'reason_submitted') s.reasonSubmitted += 1;
      else if (st === 'rejected') s.rejected += 1;
      else if (st === 'clarification_required') s.clarification += 1;
      else s.missing += 1;
      if (st !== 'awaiting') s.submitted += 1;
    }
    if (u.blocking && !u.resolved) s.unresolved.push(u.name);
  }
  s.ready = s.unresolved.length === 0;
  return s;
}

/* ---------- masking (sensitive numbers are shown masked wherever they're only being read) ---------- */

export function maskValue(kind: string | undefined, value: any): string {
  const v = String(value ?? '');
  if (!v) return '';
  const last = (n: number) => v.slice(-n);
  if (kind === 'aadhaar') return `XXXX XXXX ${last(4)}`;
  if (kind === 'pan') return `XXXXX${v.slice(5, 9)}X`.length === 10 ? `XXXXX${v.slice(5, 9)}X` : `XXXXXX${last(4)}`;
  if (kind === 'bank') return `${'X'.repeat(Math.max(0, v.length - 4))}${last(4)}`;
  if (kind === 'uan') return `XXXXXXXX${last(4)}`;
  if (kind === 'passport') return `${'X'.repeat(Math.max(0, v.length - 3))}${last(3)}`;
  return v;
}
