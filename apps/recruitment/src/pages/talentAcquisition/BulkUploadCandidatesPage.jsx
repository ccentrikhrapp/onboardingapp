import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createTaCandidate, listCandidateIdentities } from '../../api/applications.js';
import { parseCsv, toCsv, downloadCsv } from '../../utils/csv.js';
import { validateFormFields } from '../../utils/candidateForm.js';
import { emailError, phoneError } from '../../utils/validation.js';

const TEMPLATE_HEADERS = [
  'First Name', 'Last Name', 'Email', 'Phone', 'Current Location', 'Experience (Years)',
  'Notice Period', 'Current Company', 'Current Job Title', 'Highest Qualification',
  'Expected Salary', 'Portfolio/LinkedIn URL', 'Job Title',
];
const TEMPLATE_EXAMPLE = {
  'First Name': 'Asha', 'Last Name': 'Verma', 'Email': 'asha.verma@example.com', 'Phone': '9876543210',
  'Current Location': 'Bengaluru', 'Experience (Years)': '3', 'Notice Period': '30 Days',
  'Current Company': 'Acme Pvt Ltd', 'Current Job Title': 'Software Engineer',
  'Highest Qualification': 'B.Tech', 'Expected Salary': '1200000',
  'Portfolio/LinkedIn URL': '', 'Job Title': '',
};
const MAX_ROWS = 500;

function expBucketFromYears(y) {
  const n = Number(y) || 0;
  if (n <= 0) return 'Fresher';
  if (n <= 2) return '0–2 years';
  if (n <= 5) return '2–5 years';
  if (n <= 8) return '5–8 years';
  return '8+ years';
}
const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const normName = (f, l) => `${f} ${l}`.trim().toLowerCase().replace(/\s+/g, ' ');

function rowToForm(r) {
  return {
    firstName: r['First Name'] || '', lastName: r['Last Name'] || '', email: r['Email'] || '',
    phone: r['Phone'] || '', currentLocation: r['Current Location'] || '',
    experience: expBucketFromYears(r['Experience (Years)']),
    noticePeriod: r['Notice Period'] || '', currentCompany: r['Current Company'] || '',
    currentJobTitle: r['Current Job Title'] || '', highestQualification: r['Highest Qualification'] || '',
    expectedSalary: r['Expected Salary'] || '', portfolio: r['Portfolio/LinkedIn URL'] || '',
    coverNote: '', source: '',
  };
}

const STATUS_TONE = {
  Pending: 'grey', Uploading: 'amber', Created: 'green', Failed: 'red', Duplicate: 'amber', Invalid: 'red',
};

/* CSV bulk candidate creation — parses/validates client-side with the same
   field rules as the Add Candidate form (candidateForm.js), flags duplicates
   by email/phone/name before anything is sent, then creates each surviving
   row through the existing create-ta-candidate function one at a time (same
   validation, duplicate handling and verification email as a single manual
   "Add Candidate" — just resume is optional here and additional.createdVia
   is tagged 'csv' so TACandidatesPage can label it "TA bulk upload"). */
export default function BulkUploadCandidatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { jobs } = useApp();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null); // [{ n, data, form, errors, status, reason }]
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const downloadTemplate = () => {
    downloadCsv('candidate-bulk-upload-template.csv', toCsv(TEMPLATE_HEADERS, [TEMPLATE_EXAMPLE]));
  };

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setDone(false);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      toast.error('This file has no data rows.');
      setRows([]);
      return;
    }
    const missingHeaders = ['First Name', 'Last Name', 'Email', 'Phone', 'Current Location', 'Experience (Years)']
      .filter((h) => !(h in parsed[0]));
    if (missingHeaders.length) {
      toast.error(`Missing required column(s): ${missingHeaders.join(', ')}. Use the template.`);
      setRows([]);
      return;
    }
    const capped = parsed.slice(0, MAX_ROWS);
    if (parsed.length > MAX_ROWS) toast.info(`Only the first ${MAX_ROWS} rows were loaded (file had ${parsed.length}).`);

    let existing = [];
    try {
      existing = await listCandidateIdentities();
    } catch {
      existing = [];
    }
    const existingByEmail = new Set(existing.map((c) => (c.email || '').toLowerCase()));
    const existingByPhone = new Set(existing.map((c) => normPhone(c.phone)).filter(Boolean));
    const existingByName = new Set(existing.map((c) => normName(c.first_name, c.last_name)).filter((n) => n.length > 1));

    const seenEmail = new Set();
    const seenPhone = new Set();
    const seenName = new Set();

    const built = capped.map((data, i) => {
      const form = rowToForm(data);
      const errors = validateFormFields(form);
      // The shared validator treats these as optional; a bulk row still needs a usable identity.
      if (!errors.email && form.email && emailError(form.email, { required: true })) errors.email = emailError(form.email, { required: true });
      if (!errors.phone && form.phone && phoneError(form.phone, { required: true })) errors.phone = phoneError(form.phone, { required: true });

      const email = form.email.trim().toLowerCase();
      const phone = normPhone(form.phone);
      const name = normName(form.firstName, form.lastName);

      let status = 'Pending';
      let reason = '';
      if (Object.keys(errors).length) {
        status = 'Invalid';
        reason = Object.values(errors).join(' ');
      } else if ((email && seenEmail.has(email)) || (phone && seenPhone.has(phone)) || (name && seenName.has(name))) {
        status = 'Duplicate';
        reason = 'Duplicate row within this file.';
      } else if ((email && existingByEmail.has(email)) || (phone && existingByPhone.has(phone)) || (name && existingByName.has(name))) {
        status = 'Duplicate';
        reason = 'A candidate with this email, phone or name already exists.';
      }
      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);
      if (name) seenName.add(name);

      const job = data['Job Title']
        ? jobs.find((j) => j.title.toLowerCase() === data['Job Title'].trim().toLowerCase())
        : null;
      if (data['Job Title'] && !job && status === 'Pending') reason = `Job "${data['Job Title']}" not found — will be created as a general application.`;

      return { n: i + 2, data, form, errors, status, reason, jobId: job?.id || null };
    });
    setRows(built);
  };

  const summary = (rows || []).reduce(
    (s, r) => {
      s.total++;
      if (r.status === 'Created') s.successful++;
      else if (r.status === 'Invalid' || r.status === 'Failed') s.failed++;
      else if (r.status === 'Duplicate') s.duplicate++;
      return s;
    },
    { total: 0, successful: 0, failed: 0, duplicate: 0 }
  );

  const upload = async () => {
    if (!rows?.length) return;
    setUploading(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status !== 'Pending') continue;
      next[i] = { ...next[i], status: 'Uploading' };
      setRows([...next]);
      const f = next[i].form;
      try {
        const result = await createTaCandidate({
          jobId: next[i].jobId || undefined,
          candidateSource: 'TA Sourced',
          personal: {
            firstName: f.firstName, lastName: f.lastName, email: f.email, mobile: f.phone,
            currentLocation: f.currentLocation, preferredLocation: f.currentLocation,
            middleName: '', dob: '', gender: '', nationality: '',
            address: { line1: '', line2: '', city: f.currentLocation, state: '', country: 'India', postalCode: '' },
          },
          professional: {
            currentJobTitle: f.currentJobTitle, currentCompany: f.currentCompany,
            totalExperience: String(next[i].data['Experience (Years)'] || '0'), relevantExperience: '',
            employmentStatus: f.currentCompany ? 'Employed' : '', currentCTC: '',
            expectedCTC: f.expectedSalary, noticePeriod: f.noticePeriod, preferredJobLocation: f.currentLocation,
            skills: [], certifications: [], languages: [],
          },
          education: [{ qualification: f.highestQualification, university: '', specialization: '', year: '', grade: '' }],
          additional: { portfolio: f.portfolio, createdVia: 'csv' },
          skipResume: true,
          createdVia: 'csv',
        });
        if (result.duplicate) {
          next[i] = { ...next[i], status: 'Duplicate', reason: 'A candidate with this email already exists.' };
        } else {
          next[i] = { ...next[i], status: 'Created', reason: `Created — ${result.candidateCode}`, applicationId: result.applicationId };
        }
      } catch (e) {
        next[i] = { ...next[i], status: 'Failed', reason: e.message || 'Could not create this candidate.' };
      }
      setRows([...next]);
    }
    setUploading(false);
    setDone(true);
  };

  const downloadErrorReport = () => {
    const failedRows = (rows || []).filter((r) => r.status !== 'Created');
    const out = failedRows.map((r) => ({ ...r.data, 'Row': r.n, 'Status': r.status, 'Reason': r.reason }));
    downloadCsv('candidate-bulk-upload-errors.csv', toCsv([...TEMPLATE_HEADERS, 'Row', 'Status', 'Reason'], out));
  };

  const reset = () => { setRows(null); setFileName(''); setDone(false); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <div className="cx-page cx-page--form">
      <button className="ta-link" onClick={() => navigate('/ta/candidates')} style={{ marginBottom: 14 }}>
        <Icon name="ArrowLeft" size={14} /> Back to candidates
      </button>

      <div className="cx-page__head">
        <h1 className="cx-page__title">Bulk Upload Candidates</h1>
        <p className="cx-page__sub">
          Upload a CSV of candidates — each row is validated and checked for duplicates (by email, phone or name)
          before anything is created. Resume upload is optional for bulk-created candidates; they'll still get a
          verification link by email, same as adding one candidate at a time.
        </p>
      </div>

      <Card title="1. Get the template">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="ta-cell-sub">Fill this in (Excel: "Save As" → CSV) and upload it below.</span>
          <Button variant="ghost" icon="Download" onClick={downloadTemplate}>Download CSV template</Button>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="2. Upload your file">
        <div className="cx-upload">
          <span className="cx-upload__icon"><Icon name="UploadCloud" size={17} /></span>
          <div className="ta-cell-mute" style={{ flex: 1 }}>
            <div className="cx-upload__title">{fileName || 'Choose a CSV file'}</div>
            <div className="cx-upload__sub">{rows ? `${rows.length} row(s) loaded` : 'Up to 500 rows per file'}</div>
          </div>
          <Button variant="ghost" icon="Upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {rows ? 'Replace file' : 'Choose file'}
          </Button>
          {rows && <button className="ta-iconbtn" onClick={reset} aria-label="Remove file" disabled={uploading}><Icon name="X" size={15} /></button>}
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { handleFile(e.target.files); e.target.value = ''; }} />
        </div>
      </Card>

      {rows && rows.length > 0 && (
        <>
          <div style={{ height: 14 }} />
          <Card
            title="3. Review and upload"
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag tone="grey">{summary.total} Total</Tag>
                <Tag tone="green">{summary.successful} Successful</Tag>
                <Tag tone="red">{summary.failed} Failed</Tag>
                <Tag tone="amber">{summary.duplicate} Duplicate</Tag>
              </div>
            }
          >
            <div className="ta-table-scroll">
              <table className="ta-table">
                <thead>
                  <tr>
                    <th>Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Job</th><th>Status</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n}>
                      <td className="ta-cell-mute">{r.n}</td>
                      <td>{r.form.firstName} {r.form.lastName}</td>
                      <td className="ta-cell-mute">{r.form.email || '—'}</td>
                      <td className="ta-cell-mute">{r.form.phone || '—'}</td>
                      <td className="ta-cell-mute">{r.data['Job Title'] || 'General'}</td>
                      <td><Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag></td>
                      <td className="ta-cell-sub" style={{ maxWidth: 320 }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cx-formbar" style={{ marginTop: 16 }}>
              <span className="cx-formbar__note">
                {done
                  ? 'Upload complete — review the results above.'
                  : `${rows.filter((r) => r.status === 'Pending').length} of ${rows.length} row(s) are ready to create.`}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                {(done || summary.failed + summary.duplicate > 0) && (
                  <Button variant="ghost" icon="Download" onClick={downloadErrorReport}>Download error report</Button>
                )}
                {!done && (
                  <Button
                    iconRight="ArrowRight"
                    onClick={upload}
                    disabled={uploading || rows.every((r) => r.status !== 'Pending')}
                  >
                    {uploading ? 'Uploading…' : `Upload ${rows.filter((r) => r.status === 'Pending').length} candidate(s)`}
                  </Button>
                )}
                {done && <Button onClick={() => navigate('/ta/candidates')}>Go to candidates</Button>}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
