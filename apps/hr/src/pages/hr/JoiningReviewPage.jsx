import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import Icon from '../../components/common/Icon.jsx';
import DocumentPreviewModal from '../../components/common/DocumentPreviewModal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getOnboardingCase, getEmployeeForCase } from '../../api/onboarding.js';
import {
  getJoiningForCase, listJoiningEvents, listJoiningSnapshots, listJoiningItems, listDocConfigRows, requestCorrection,
  listJoiningPdfs, getJoiningPdfUrl, docApprove, docClarify, docReject, docMarkNa, docMarkApplicable, approveDocumentation, getJoiningFileUrl,
} from '../../api/joining.js';
import { DOC_REFERENCE, SECTIONS, STATUS_LABEL, deriveRequirements, docLabel, docSummary, docUnits, validateAll } from '../../utils/joiningSchema.ts';
import { summarizeSections } from '../../utils/joiningView.js';
import { FORMS, buildForm, openPrint } from '../../utils/joiningDocs.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/kit/Skeleton.jsx';

const STATUS_TONE = { approved_with_remarks: 'amber', rejected: 'red', not_started: 'grey', in_progress: 'blue', submitted: 'amber', under_review: 'amber', correction_required: 'red', resubmitted: 'amber', verified: 'green', completed: 'green' };
const CLASS_LABEL = { critical: 'Mandatory', conditional: 'Conditional', optional: 'Optional' };

function Remark({ label, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div className="cx-docreason" style={{ marginTop: 6 }}>
      <textarea className="cx-docreason__input" rows={2} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="cx-docreason__btns">
        <button className="hr-btn hr-btn--sm" onClick={() => onSubmit(text.trim())} disabled={!text.trim()}>Submit</button>
        <button className="hr-btn hr-btn--ghost hr-btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// The reference list with HR's overrides applied, same as the server does.
function mergeConfig(rows) {
  const by = new Map((rows || []).map((r) => [r.ref_key, r]));
  return DOC_REFERENCE.map((d) => {
    const c = by.get(d.key);
    return c ? { ...d, classification: c.classification, cannotProvide: c.cannot_provide_allowed, naAllowed: c.na_allowed, hrApproval: c.hr_approval_required, maxFiles: c.max_files, active: c.active } : d;
  });
}

export default function JoiningReviewPage() {
  const { candidateId: caseId } = useParams(); // the onboarding case id
  const toast = useToast();
  const [caseRow, setCaseRow] = useState(null);
  const [employee, setEmployee] = useState(null); // set once HR has created the employee record
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = employee hasn't opened it
  const [events, setEvents] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [itemRows, setItemRows] = useState([]);
  const [cfgRows, setCfgRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [remarkFor, setRemarkFor] = useState(null); // { key, action }
  const [reveal, setReveal] = useState(false);
  const [queue, setQueue] = useState([]); // pending form corrections
  const [corrFor, setCorrFor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pdfs, setPdfs] = useState([]);

  const load = async () => {
    try {
      const [c, p, emp] = await Promise.all([getOnboardingCase(caseId), getJoiningForCase(caseId), getEmployeeForCase(caseId).catch(() => null)]);
      setCaseRow(c);
      setEmployee(emp);
      setProfile(p);
      if (p) {
        listJoiningPdfs(p.id).then((r) => setPdfs(r.versions || [])).catch(() => setPdfs([]));
        const [ev, snaps, items, cfg] = await Promise.all([listJoiningEvents(p.id), listJoiningSnapshots(p.id), listJoiningItems(p.id), listDocConfigRows().catch(() => [])]);
        setEvents(ev); setSnapshots(snaps); setItemRows(items);
        setCfgRows(cfg);
      }
    } catch (e) {
      toast.error(e.message || 'Could not load the joining form.');
      setProfile(null);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const data = profile?.data || {};
  const cfg = useMemo(() => mergeConfig(cfgRows), [cfgRows]);
  const reqs = useMemo(() => deriveRequirements(data, cfg), [data, cfg]);
  const states = useMemo(() => {
    const m = {};
    for (const r of itemRows) m[r.item_key] = { status: r.status, choice: r.choice, files: r.files, reasonText: r.reason_text, hrRemarks: r.hr_remarks };
    return m;
  }, [itemRows]);
  const rowByKey = useMemo(() => Object.fromEntries(itemRows.map((r) => [r.item_key, r])), [itemRows]);
  const summary = useMemo(() => docSummary(reqs, states, cfg.filter((c) => c.active !== false).length), [reqs, states, cfg]);
  const units = useMemo(() => docUnits(reqs, states), [reqs, states]);
  const identityUnit = units.find((u) => u.key === 'identity_proof');
  const progress = useMemo(() => validateAll(data), [data]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (okMsg) toast.success(okMsg);
      load(); // refresh in the background so the button is free straight away
      return res;
    } catch (e) {
      toast.error(e.message || 'Could not complete that.');
    } finally {
      setBusy(false);
      setRemarkFor(null);
    }
    return null;
  };

  if (profile === undefined) return (<><HRHeader title="Joining form" backTo={`/hr/candidates/${caseId}`} backLabel="Candidate" /><SkeletonPage /></>);
  if (profile === null) {
    return (
      <>
        <HRHeader title={caseRow?.candidate_name || 'Joining form'} subtitle="Employee joining form" backTo={`/hr/candidates/${caseId}`} backLabel="Candidate" />
        <Card><p className="hr-cell-sub">The employee hasn't opened the joining form yet. It becomes available in the candidate portal once onboarding starts.</p></Card>
      </>
    );
  }

  const st = profile.status;
  const pid = profile.id;
  const latestSnap = snapshots[0];
  const printData = latestSnap?.data || data;
  const printHr = {
    designation: caseRow?.designation || '', department: caseRow?.department || '', dateOfJoining: String(caseRow?.joining_date || '').slice(0, 10),
    ...(latestSnap?.hr_fields || {}), ...(profile.hr_fields || {}),
    ...(employee?.employee_code ? { employeeCode: employee.employee_code } : {}),
  };
  const caseInfo = { name: caseRow?.candidate_name, designation: caseRow?.designation, joiningDate: caseRow?.joining_date };
  const docRows = units.flatMap((u) => u.members.map((m) => ({ ...m, unit: u }))).filter((m) => m.req.applicability !== 'not_applicable' || (m.req.dataOnly));
  const naRows = reqs.filter((r) => r.applicability === 'not_applicable' && !r.dataOnly);
  const openCorr = (profile.corrections || []).filter((c) => !c.resolved_at);

  const submitted = !['not_started', 'in_progress', 'correction_required'].includes(st);

  const downloadLatestPdf = async () => {
    const r = await getJoiningPdfUrl(pid);
    const link = document.createElement('a');
    link.href = r.url; link.download = r.fileName;
    document.body.appendChild(link); link.click(); link.remove();
  };

  const approveAndDownload = async () => {
    if (!window.confirm('Approve the joining documentation? This creates the employee ID and completes the joining form.')) return;
    const res = await run(() => approveDocumentation(pid));
    if (!res) return; // run() has already shown the error
    toast.success(`Approved. Employee ID ${res.employeeCode} created.`);
    if (res.pdfVersion) {
      try { await downloadLatestPdf(); } catch (e) { toast.error(e.message || 'Could not download the joining forms.'); }
    } else {
      toast.error('The employee ID was created, but the joining PDF could not be generated. Try the download below.');
    }
  };

  const openFile = async (key, name) => {
    setPreview({ url: null, fileName: null, title: name });
    try {
      const r = await getJoiningFileUrl(pid, key, 0);
      setPreview({ url: r.url, fileName: r.fileName, title: name });
    } catch (e) { setPreview(null); toast.error(e.message || 'Could not open this file.'); }
  };

  const fieldOptions = (sec) => sec.groups.flatMap((g) => (g.kind === 'list'
    ? [{ value: `${sec.id}.${g.id}`, label: g.title || `${g.itemTitle}s` }]
    : g.fields.map((f) => ({ value: `${sec.id}.${g.id}.${f.key}`, label: `${g.title ? `${g.title} — ` : ''}${f.label}` }))));

  return (
    <>
      <HRHeader title={caseRow?.candidate_name || 'Joining form'} subtitle={`Employee joining form · ${caseRow?.designation || caseRow?.job_title || ''}`} backTo={`/hr/candidates/${caseId}`} backLabel="Candidate" />

      <Card
        title="Joining form"
        action={<Tag tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Tag>}
      >
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="hr-cell-sub">Completion <strong>{progress.percent}%</strong></span>
          <span className="hr-cell-sub">Submitted <strong>{profile.submitted_at ? formatDateTime(profile.submitted_at) : '—'}</strong></span>
          <span className="hr-cell-sub">Signed by <strong>{profile.signature?.name || '—'}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {employee?.employee_code
            ? <Tag tone="green">Employee ID {employee.employee_code}</Tag>
            : <span className="hr-cell-sub">The employee ID is created when you approve the joining documentation below.</span>}
        </div>
        {openCorr.length > 0 && (
          <div className="hr-note hr-note--warn" style={{ marginTop: 10 }}>
            <strong>Waiting for the employee to correct:</strong>
            {openCorr.map((c) => <div key={c.id} className="hr-cell-sub">{SECTIONS.find((s) => s.id === c.section)?.title}: {c.remark}</div>)}
          </div>
        )}
      </Card>

      <div style={{ height: 14 }} />

      <Card
        title="Joining documentation"
        action={profile.documents_approved_at ? <Tag tone="green">Approved {formatDate(profile.documents_approved_at)}</Tag> : <Tag tone={summary.ready ? 'green' : 'amber'}>{summary.ready ? 'Ready to approve' : `${summary.unresolved.length} to resolve`}</Tag>}
      >
        <p className="hr-cell-sub" style={{ marginBottom: 8 }}>
          Employee: <strong>{caseRow?.candidate_name}</strong> · Employment type: <strong>{data?.employment?.summary?.isFresher === 'Yes' ? 'Fresher' : data?.employment?.summary?.isFresher === 'No' ? 'Experienced' : 'Not answered yet'}</strong>
          {' '}· Previous employers: <strong>{(data?.employment?.previous || []).length}</strong>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
          {[['Applicable requirements', summary.applicable], ['Approved', summary.approved], ['Approved with reason', summary.approvedWithReason], ['Pending review', summary.pendingReview + summary.reasonSubmitted],
            ['Not applicable', summary.notApplicable], ['Rejected', summary.rejected], ['Clarification required', summary.clarification], ['Not yet submitted', summary.missing]].map(([l, n]) => (
            <div key={l} style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div><div className="hr-cell-sub">{l}</div>
            </div>
          ))}
        </div>
        <div className={`hr-note hr-note--${identityUnit?.resolved ? 'ok' : 'info'}`} style={{ marginBottom: 10 }}>
          <Icon name={identityUnit?.resolved ? 'CheckCircle2' : 'ShieldCheck'} size={14} /> <span>{identityUnit?.resolved ? <strong>Identity Proof – Satisfied</strong> : <>Identity proof: PAN <em>or</em> Aadhaar — one approved is enough.</>}</span>
        </div>

        <div className="hr-table-scroll">
          <table className="hr-table">
            <thead><tr><th>Requirement</th><th>Employee status</th><th>What was provided</th><th>HR action</th></tr></thead>
            <tbody>
              {docRows.map(({ req, state }) => {
                const row = rowByKey[req.itemKey];
                const lab = docLabel(req, state);
                const s = state.status || 'awaiting';
                return (
                  <tr key={req.itemKey}>
                    <td>
                      <span className="hr-cell-strong">{req.name}</span><br />
                      <span className="hr-cell-sub">{CLASS_LABEL[req.classification]}{req.anyOf ? ' · PAN or Aadhaar' : ''}</span>
                    </td>
                    <td><Tag tone={lab.tone}>{lab.label}</Tag></td>
                    <td className="hr-cell-sub" style={{ maxWidth: 320 }}>
                      {(row?.files || []).length > 0 && <div>{row.files.map((f) => f.name).join(', ')} <button className="hr-link" onClick={() => openFile(req.itemKey, req.name)}>View</button></div>}
                      {row?.choice && row.choice !== 'upload' && row.reason_text && <div>Reason{row.reason_category ? ` (${row.reason_category})` : ''}: {row.reason_text}</div>}
                      {req.dataOnly && s !== 'awaiting' && <div>From the Employment step</div>}
                      {row?.hr_remarks && ['clarification_required', 'rejected'].includes(s) && <div>Your note: {row.hr_remarks}</div>}
                      {remarkFor?.key === req.itemKey && (
                        <Remark label={remarkFor.action === 'doc_reject' ? 'Why is this not acceptable?' : 'What do you need from the employee?'}
                          onSubmit={(t) => run(() => (remarkFor.action === 'doc_reject' ? docReject(pid, req.itemKey, t) : docClarify(pid, req.itemKey, t)), 'Sent to the employee.')}
                          onCancel={() => setRemarkFor(null)} />
                      )}
                    </td>
                    <td>
                      <span className="hr-rowactions" style={{ opacity: 1, flexWrap: 'wrap' }}>
                        {['submitted', 'reason_submitted'].includes(s) && <Button variant="ghost" disabled={busy} onClick={() => run(() => docApprove(pid, req.itemKey), 'Approved.')}>{s === 'reason_submitted' ? 'Approve reason' : 'Approve'}</Button>}
                        {s === 'awaiting' && req.applicability === 'not_applicable' && req.dataOnly && <Button variant="ghost" disabled={busy} onClick={() => run(() => docApprove(pid, req.itemKey), 'Accepted.')}>Approve fresher status</Button>}
                        {['submitted', 'reason_submitted', 'approved', 'approved_with_reason', 'na_accepted'].includes(s) && <Button variant="ghost" disabled={busy} onClick={() => setRemarkFor({ key: req.itemKey, action: 'doc_clarify' })}>{['approved', 'approved_with_reason', 'na_accepted'].includes(s) ? 'Reopen' : 'Request clarification'}</Button>}
                        {['submitted', 'reason_submitted'].includes(s) && <Button variant="danger" disabled={busy} onClick={() => setRemarkFor({ key: req.itemKey, action: 'doc_reject' })}>Reject</Button>}
                        {['awaiting', 'clarification_required', 'rejected'].includes(s) && req.applicability !== 'not_applicable' && <Button variant="ghost" disabled={busy} onClick={() => run(() => docMarkNa(pid, req.itemKey, ''), 'Marked not applicable.')}>Mark not applicable</Button>}
                        {s === 'na_accepted' && <Button variant="ghost" disabled={busy} onClick={() => run(() => docMarkApplicable(pid, req.itemKey), 'Made applicable again.')}>Make applicable</Button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {naRows.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="hr-cell-sub" style={{ cursor: 'pointer' }}>Not applicable to this employee ({naRows.length})</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {naRows.map((r) => <li key={r.itemKey} className="hr-cell-sub">{r.name} — {r.naReason}</li>)}
            </ul>
          </details>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button icon="CheckCircle2" disabled={busy || !summary.ready || !submitted || openCorr.length > 0 || (!!profile.documents_approved_at && !!employee)} onClick={approveAndDownload}>
            {profile.documents_approved_at && !employee ? 'Create employee ID and download joining forms' : 'Approve joining documentation'}
          </Button>
          {!submitted && <span className="hr-cell-sub">The employee hasn't submitted the joining form yet.</span>}
          {submitted && openCorr.length > 0 && <span className="hr-cell-sub">Waiting for the employee to resubmit the corrected sections.</span>}
          {profile.documents_approved_at && employee && <span className="hr-cell-sub">Approved. Employee ID {employee.employee_code} created — download the joining forms below.</span>}
          {!summary.ready && <span className="hr-cell-sub">Still to resolve: {summary.unresolved.join(', ')}</span>}
          {summary.ready && !profile.documents_approved_at && <span className="hr-cell-sub">Every applicable requirement is resolved — the rest of the reference checklist isn't needed.</span>}
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Onboarding document (PDF)" action={pdfs[0] ? <Tag tone="green">Version {pdfs[0].version}.0 · {pdfs[0].label}</Tag> : <Tag tone="grey">Not generated</Tag>}>
        {pdfs.length === 0 ? <p className="hr-cell-sub">Generated automatically when the employee submits.</p> : (
          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead><tr><th>Version</th><th>Event</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {pdfs.map((v) => (
                  <tr key={v.id}>
                    <td>{v.version}.0</td><td>{v.label}</td><td>{v.status_at_creation}</td>
                    <td>{formatDateTime(v.created_at)}</td>
                    <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" icon="Eye" onClick={async () => { try { const r = await getJoiningPdfUrl(pid, v.version); window.open(r.url, '_blank', 'noopener'); } catch (e) { toast.error(e.message || 'Could not open this document.'); } }}>View</Button>
                      <Button variant="ghost" icon="Download" onClick={async () => { try { const r = await getJoiningPdfUrl(pid, v.version); const a = document.createElement('a'); a.href = r.url; a.download = r.fileName; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { toast.error(e.message || 'Could not download this document.'); } }}>Download</Button>
                      <Button variant="ghost" icon="Printer" onClick={async () => { try { const r = await getJoiningPdfUrl(pid, v.version); const w = window.open(r.url, '_blank', 'noopener'); w?.addEventListener?.('load', () => w.print()); } catch (e) { toast.error(e.message || 'Could not print this document.'); } }}>Print</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 14 }} />

      <Card
        title="Employee's answers"
        action={<span style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => setReveal((r) => !r)}>{reveal ? 'Mask sensitive numbers' : 'Reveal sensitive numbers'}</Button>
          {queue.length > 0 && <Button disabled={busy} onClick={async () => { const r = await run(() => requestCorrection(pid, queue), 'Corrections sent to the employee.'); if (r) setQueue([]); }}>Send {queue.length} correction{queue.length === 1 ? '' : 's'}</Button>}
        </span>}
      >
        {queue.length > 0 && (
          <div className="hr-note hr-note--info" style={{ marginBottom: 10 }}>
            <strong>Queued corrections</strong>
            {queue.map((q, i) => <div key={i} className="hr-cell-sub">{SECTIONS.find((s) => s.id === q.section)?.title}{q.field ? ` › ${q.field.split('.').slice(1).join(' › ')}` : ''}: {q.remark} <button className="hr-link" onClick={() => setQueue((x) => x.filter((_, j) => j !== i))}>remove</button></div>)}
          </div>
        )}
        {summarizeSections(data, { mask: !reveal }).map((sec) => (
          <details key={sec.id} style={{ border: '1px solid var(--hr-line, #e5e7eb)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
              <span>{sec.title}</span>
              {['submitted', 'resubmitted', 'under_review'].includes(st) && (
                <button className="hr-link" onClick={(e) => { e.preventDefault(); setCorrFor(corrFor === sec.id ? null : sec.id); }}>Request correction</button>
              )}
            </summary>
            {corrFor === sec.id && <CorrectionBox options={fieldOptions(SECTIONS.find((s) => s.id === sec.id))} onAdd={(field, remark) => { setQueue((q) => [...q, { section: sec.id, field: field || null, remark }]); setCorrFor(null); }} onCancel={() => setCorrFor(null)} />}
            <div style={{ marginTop: 8 }}>
              {sec.groups.map((g) => (
                <div key={g.id} style={{ marginBottom: 8 }}>
                  {g.title && <div className="hr-cell-strong">{g.title}</div>}
                  {g.rows && <InfoGrid rows={g.rows} />}
                  {g.items?.map((it) => <div key={it.title} style={{ marginTop: 6 }}><div className="hr-cell-sub">{it.title}</div><InfoGrid rows={it.rows} /></div>)}
                </div>
              ))}
            </div>
          </details>
        ))}
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Joining forms (generated from the profile)" action={latestSnap ? <span className="hr-cell-sub">Printing the version signed {formatDateTime(latestSnap.created_at)}</span> : <span className="hr-cell-sub">Not signed yet — printing the current draft</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {FORMS.map((f) => (
            <Button key={f.id} variant="ghost" icon="Download" onClick={() => {
              const html = buildForm(f.id, printData, printHr, latestSnap?.signature || null, caseInfo, { reqs, states });
              if (!openPrint(f.title, html)) toast.error('Allow pop-ups to print this form.');
            }}>{f.title}</Button>
          ))}
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Activity">
        <div className="hr-stack" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {events.filter((e) => e.kind !== 'field_change').slice(0, 60).map((e) => (
            <div key={e.id} className="hr-cell-sub"><strong>{formatDateTime(e.created_at)}</strong> · {e.actor_label || 'System'} · {e.kind}{e.field ? ` (${e.field})` : ''}{e.remark ? ` — ${e.remark}` : ''}</div>
          ))}
          <div className="hr-cell-sub">{events.filter((e) => e.kind === 'field_change').length} field-level changes are also recorded (sensitive numbers stored masked).</div>
        </div>
      </Card>

      <DocumentPreviewModal open={!!preview} onClose={() => setPreview(null)} url={preview?.url} fileName={preview?.fileName} title={preview?.title} parts={[]} activePart={0} />
    </>
  );
}

function InfoGrid({ rows }) {
  return (
    <div className="hr-info" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {rows.map((r) => <div className="hr-info__item" key={r.label}><span className="hr-info__label">{r.label}</span><span className="hr-info__value">{r.value}</span></div>)}
    </div>
  );
}

function CorrectionBox({ options, onAdd, onCancel }) {
  const [field, setField] = useState('');
  const [text, setText] = useState('');
  return (
    <div className="cx-docreason" style={{ marginTop: 8 }}>
      <select className="hr-input" value={field} onChange={(e) => setField(e.target.value)}>
        <option value="">Whole step</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <textarea className="cx-docreason__input" rows={2} style={{ marginTop: 6 }} placeholder="What needs to be corrected?" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="cx-docreason__btns">
        <button className="hr-btn hr-btn--sm" disabled={!text.trim()} onClick={() => onAdd(field, text.trim())}>Add to corrections</button>
        <button className="hr-btn hr-btn--ghost hr-btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
