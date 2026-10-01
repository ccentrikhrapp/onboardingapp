import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Card from '../../components/ta/Card.jsx';
import Button from '../../components/ta/Button.jsx';
import Tag from '../../components/ta/Tag.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listCandidateIdentities } from '../../api/applications.js';
import { listPipelineCandidates, createPipelineCandidate } from '../../api/pipeline.js';
import { parseCsv, toCsv, downloadCsv } from '../../utils/csv.js';
import {
  PIPELINE_CSV_HEADERS, PIPELINE_FIELD_COLUMN, pipelineFormFromCsvRow, validatePipelineForm, normPhone10,
} from '../../utils/pipelineForm.js';

const MAX_ROWS = 500;
// One illustrative row in the downloaded template. example.com is a reserved
// domain no real person has, so the importer ignores any row using it.
const SAMPLE_ROW = {
  'Name': 'Sample Candidate', 'Number': '9876543210', 'Email id': 'sample.candidate@example.com', 'Position': 'SAP Consultant',
  'Organisation': 'ABC Technologies', 'Total Exp': '6', 'Relevant Exp': '4', 'Current CTC': '12', 'Offer in hand': 'No',
  'Expected CTC': '18', 'Notice': '60', 'Current Location': 'Pune', 'Hiring Location': 'Noida',
};
const isSampleRow = (r) => /@example\.com$/i.test(String(r['Email id'] || '').trim());
const TONE = { Valid: 'green', Invalid: 'red', Duplicate: 'amber', Importing: 'amber', Imported: 'green', Failed: 'red' };

/* Pipeline CSV import: template → upload → validate → preview → confirm.
   Nothing is written until the TA confirms, invalid rows are listed with the
   row/column/reason (never silently skipped), and duplicates (same email or
   phone, in the file or already in the pipeline) are flagged and not imported. */
export default function PipelineBulkUploadPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null); // [{ n, form, status, errors:[{field,message}], note, jobCandidateWarning }]
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const downloadTemplate = () => downloadCsv('pipeline-candidates-template.csv', toCsv(PIPELINE_CSV_HEADERS, [SAMPLE_ROW]));

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setDone(false);
    setFileName(file.name);
    const text = await file.text();
    const all = parseCsv(text);
    const parsed = all.filter((r) => !isSampleRow(r));
    if (all.length && !parsed.length) {
      toast.error('Only the sample row was found. Replace it with your candidates (one per row), then upload again.');
      setRows(null);
      setFileName('');
      return;
    }
    if (all.length > parsed.length) toast.info('The sample row was ignored.');
    if (!parsed.length) {
      toast.error(text.trim()
        ? 'This file only has the header row. Add your candidates below it (one per row), then upload it again.'
        : 'This file is empty. Download the template, fill it in, then upload it.');
      setRows(null);
      setFileName('');
      return;
    }
    const missing = PIPELINE_CSV_HEADERS.filter((h) => !(h in parsed[0]));
    if (missing.length) { toast.error(`Missing column(s): ${missing.join(', ')}. Please use the template.`); setRows([]); return; }
    if (parsed.length > MAX_ROWS) toast.info(`Only the first ${MAX_ROWS} rows were loaded (file had ${parsed.length}).`);

    let existingPipeline = [];
    let existingCandidates = [];
    try { existingPipeline = (await listPipelineCandidates()).filter((c) => c.status !== 'archived'); } catch { /* checked again by the database on import */ }
    try { existingCandidates = await listCandidateIdentities(); } catch { /* warning only */ }
    const pipeEmails = new Set(existingPipeline.map((c) => c.email.toLowerCase()));
    const pipePhones = new Set(existingPipeline.map((c) => normPhone10(c.phone)));
    const candEmails = new Set(existingCandidates.map((c) => (c.email || '').toLowerCase()));
    const candPhones = new Set(existingCandidates.map((c) => normPhone10(c.phone)).filter(Boolean));
    const seenEmail = new Set();
    const seenPhone = new Set();

    setRows(parsed.slice(0, MAX_ROWS).map((data, i) => {
      const form = pipelineFormFromCsvRow(data);
      const errs = validatePipelineForm(form);
      const errors = Object.entries(errs).map(([field, message]) => ({ field: PIPELINE_FIELD_COLUMN[field], message }));
      const email = form.email.trim().toLowerCase();
      const phone = normPhone10(form.phone);
      let status = 'Valid';
      let note = '';
      if (errors.length) status = 'Invalid';
      else if ((email && seenEmail.has(email)) || (phone && seenPhone.has(phone))) { status = 'Duplicate'; note = 'Duplicate of an earlier row in this file.'; }
      else if (pipeEmails.has(email) || pipePhones.has(phone)) { status = 'Duplicate'; note = 'Already in Pipeline Candidates (same email or phone).'; }
      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);
      const jobCandidateWarning = status === 'Valid' && (candEmails.has(email) || candPhones.has(phone));
      if (jobCandidateWarning) note = 'Note: this person already exists as a Job Candidate.';
      return { n: i + 2, form, status, errors, note };
    }));
  };

  const counts = (rows || []).reduce((c, r) => {
    c.total++;
    if (r.status === 'Valid' || r.status === 'Imported') c.valid++;
    else if (r.status === 'Invalid' || r.status === 'Failed') c.invalid++;
    else if (r.status === 'Duplicate') c.duplicate++;
    return c;
  }, { total: 0, valid: 0, invalid: 0, duplicate: 0 });
  const importable = (rows || []).filter((r) => r.status === 'Valid').length;

  const runImport = async () => {
    setImporting(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status !== 'Valid') continue;
      next[i] = { ...next[i], status: 'Importing' };
      setRows([...next]);
      try {
        await createPipelineCandidate(next[i].form, 'csv');
        next[i] = { ...next[i], status: 'Imported', note: 'Imported.' };
      } catch (err) {
        next[i] = { ...next[i], status: err.code === 'DUPLICATE' ? 'Duplicate' : 'Failed', note: err.message || 'Could not import this row.' };
      }
      setRows([...next]);
    }
    setImporting(false);
    setDone(true);
  };

  const downloadErrors = () => {
    const headers = ['Row', 'Field', 'Error'];
    const out = [];
    (rows || []).forEach((r) => {
      if (r.errors.length) r.errors.forEach((e) => out.push({ Row: r.n, Field: e.field, Error: e.message }));
      else if (r.status === 'Duplicate' || r.status === 'Failed') out.push({ Row: r.n, Field: '', Error: r.note });
    });
    downloadCsv('pipeline-import-errors.csv', toCsv(headers, out));
  };

  const reset = () => { setRows(null); setFileName(''); setDone(false); };

  return (
    <div className="cx-page cx-page--form">
      <button className="ta-link" onClick={() => navigate('/ta/pipeline')} style={{ marginBottom: 14 }}>
        <Icon name="ArrowLeft" size={14} /> Back to Pipeline Candidates
      </button>
      <div className="cx-page__head">
        <h1 className="cx-page__title">Bulk Upload Pipeline Candidates</h1>
        <p className="cx-page__sub">Download the template, fill it in, upload it, review the preview, then confirm the import. Every row is validated and checked for duplicates first.</p>
      </div>

      <Card title="1. Download the template">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="ta-cell-sub">Columns: {PIPELINE_CSV_HEADERS.join(', ')}. “Offer in hand” is Yes or No; “Notice” is a number of days. The template includes one sample row (ignored on upload) — replace it with your own candidates.</span>
          <Button variant="ghost" icon="Download" onClick={downloadTemplate}>Download CSV Template</Button>
        </div>
      </Card>
      <div style={{ height: 14 }} />

      <Card title="2. Upload your file">
        <div className="cx-upload">
          <span className="cx-upload__icon"><Icon name="UploadCloud" size={17} /></span>
          <div className="ta-cell-mute" style={{ flex: 1 }}>
            <div className="cx-upload__title">{fileName || 'Choose a CSV file'}</div>
            <div className="cx-upload__sub">{rows ? `${rows.length} row(s) found` : `Up to ${MAX_ROWS} rows`}</div>
          </div>
          <Button variant="ghost" icon="Upload" onClick={() => fileRef.current?.click()} disabled={importing}>{rows ? 'Replace file' : 'Choose file'}</Button>
          {rows && <button className="ta-iconbtn" onClick={reset} aria-label="Remove file" disabled={importing}><Icon name="X" size={15} /></button>}
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { handleFile(e.target.files); e.target.value = ''; }} />
        </div>
      </Card>

      {rows && rows.length > 0 && (
        <>
          <div style={{ height: 14 }} />
          <Card
            title="3. Preview and confirm"
            action={(
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag tone="grey">{counts.total} records found</Tag>
                <Tag tone="green">{counts.valid} Valid</Tag>
                <Tag tone="red">{counts.invalid} Invalid</Tag>
                {counts.duplicate > 0 && <Tag tone="amber">{counts.duplicate} Duplicate</Tag>}
              </div>
            )}
          >
            <div className="ta-table-scroll">
              <table className="ta-table">
                <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Position</th><th>Notice</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n}>
                      <td className="ta-cell-mute">{r.n}</td>
                      <td>{r.form.name}</td>
                      <td className="ta-cell-mute">{r.form.email || '—'}</td>
                      <td className="ta-cell-mute">{r.form.position || '—'}</td>
                      <td className="ta-cell-mute">{r.form.noticeDays || '—'}</td>
                      <td><Tag tone={TONE[r.status]}>{r.status}</Tag></td>
                      <td className="ta-cell-sub" style={{ maxWidth: 380 }}>
                        {r.errors.length
                          ? r.errors.map((e) => <div key={e.field}><strong>{e.field}:</strong> {e.message}</div>)
                          : r.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cx-formbar" style={{ marginTop: 16 }}>
              <span className="cx-formbar__note">
                {done ? 'Import finished — review the results above.' : `${importable} of ${rows.length} row(s) will be imported. Invalid and duplicate rows are skipped.`}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                {(counts.invalid > 0 || counts.duplicate > 0) && <Button variant="ghost" icon="Download" onClick={downloadErrors}>Download error report</Button>}
                {!done && <Button iconRight="ArrowRight" onClick={runImport} disabled={importing || importable === 0}>{importing ? 'Importing…' : `Confirm Import (${importable})`}</Button>}
                {done && <Button onClick={() => navigate('/ta/pipeline')}>Go to Pipeline Candidates</Button>}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
