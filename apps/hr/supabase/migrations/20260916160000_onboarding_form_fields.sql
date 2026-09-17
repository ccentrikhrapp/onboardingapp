-- Structured data-entry forms for onboarding items that are genuinely forms
-- (bank details, nominations, declarations) rather than a file to upload.
-- field_schema null/empty = file-upload item (unchanged behavior);
-- non-null = the candidate fills these fields instead of choosing a file,
-- and the answers land in onboarding_documents.form_data.
alter table onboarding_document_requirements add column if not exists field_schema jsonb;
alter table onboarding_documents add column if not exists form_data jsonb;

-- Name is "Bank Account Details / Cancelled Cheque" — the structured fields
-- are the primary data HR actually needs, with an optional cheque photo as
-- supporting proof (the "file" field type renders a file input alongside
-- the other fields rather than replacing them).
update onboarding_document_requirements set field_schema = '[
  {"key":"accountHolderName","label":"Account Holder Name","type":"text","required":true},
  {"key":"bankName","label":"Bank Name","type":"text","required":true},
  {"key":"accountNumber","label":"Account Number","type":"text","required":true},
  {"key":"ifscCode","label":"IFSC Code","type":"text","required":true},
  {"key":"branch","label":"Branch","type":"text","required":false},
  {"key":"supportingFile","label":"Cancelled Cheque Photo (optional)","type":"file","required":false}
]'::jsonb where key = 'bank_details';

update onboarding_document_requirements set field_schema = '[
  {"key":"nomineeName","label":"Nominee Name","type":"text","required":true},
  {"key":"relationship","label":"Relationship with Nominee","type":"text","required":true},
  {"key":"nomineeDob","label":"Nominee Date of Birth","type":"date","required":true},
  {"key":"sharePercentage","label":"Share Percentage","type":"number","required":true}
]'::jsonb where key = 'pf_nomination';

update onboarding_document_requirements set field_schema = '[
  {"key":"hasDependents","label":"Do you have dependents to declare?","type":"select","options":["Yes","No"],"required":true},
  {"key":"dependentDetails","label":"Dependent Details","type":"textarea","required":false}
]'::jsonb where key = 'esi_declaration';

update onboarding_document_requirements set field_schema = '[
  {"key":"bloodGroup","label":"Blood Group","type":"text","required":false},
  {"key":"aadhaarNumber","label":"Aadhaar Number","type":"text","required":true},
  {"key":"panNumber","label":"PAN Number","type":"text","required":true},
  {"key":"maritalStatus","label":"Marital Status","type":"select","options":["Single","Married"],"required":false}
]'::jsonb where key = 'joining_form';

update onboarding_document_requirements set field_schema = '[
  {"key":"contactName","label":"Contact Name","type":"text","required":true},
  {"key":"relationship","label":"Relationship","type":"text","required":true},
  {"key":"phone","label":"Phone Number","type":"phone","required":true},
  {"key":"address","label":"Address","type":"textarea","required":false}
]'::jsonb where key = 'emergency_contact';

update onboarding_document_requirements set field_schema = '[
  {"key":"isFit","label":"I declare that I am medically fit to join","type":"select","options":["Yes","No"],"required":true},
  {"key":"conditions","label":"Any medical conditions to declare (optional)","type":"textarea","required":false}
]'::jsonb where key = 'medical_declaration';

-- offer_acknowledgement and id_photo stay null (genuine file uploads: a
-- signed letter and a photograph aren't data anyone should retype).
