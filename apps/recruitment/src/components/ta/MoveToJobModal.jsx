import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal.jsx';
import Icon from '../common/Icon.jsx';
import Button from './Button.jsx';
import { Field, FieldGrid, Input, Select } from './Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { movePipelineCandidate } from '../../api/pipeline.js';

/* Converts a Pipeline Candidate into a Job Candidate for a chosen active job.
   The server does the real work (and the duplicate check) — this only collects
   the job + hiring location and reports the outcome. */
export default function MoveToJobModal({ open, candidate, onClose, onMoved }) {
  const navigate = useNavigate();
  const { jobs } = useApp();
  const activeJobs = jobs.filter((j) => j.status === 'published');
  const [jobId, setJobId] = useState('');
  const [hiringLocation, setHiringLocation] = useState(candidate.hiringLocation || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { moved | alreadyAssociated, applicationId, ... }

  const submit = async () => {
    if (!jobId) { setError('Select the job to move this candidate to.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await movePipelineCandidate({ pipelineCandidateId: candidate.id, jobId, hiringLocation });
      setResult(r);
      if (r.moved) onMoved?.(jobId);
    } catch (err) {
      setError(err.message || 'Could not move this candidate.');
      if (err.fields?.applicationId) setResult({ duplicateElsewhere: true, applicationId: err.fields.applicationId });
    } finally {
      setBusy(false);
    }
  };

  const viewJobCandidate = () => navigate(`/ta/candidates/${result.applicationId}`);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move Candidate to Job Candidate"
      footer={
        result?.moved || result?.alreadyAssociated ? (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button icon="ArrowRight" onClick={viewJobCandidate}>View Job Candidate</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !activeJobs.length}>{busy ? 'Moving…' : 'Move to Job Candidate'}</Button>
          </>
        )
      }
    >
      {result?.moved ? (
        <div className="ta-note ta-note--ok">
          <Icon name="CheckCircle2" size={15} />
          <span>Candidate successfully moved to Job Candidates ({result.applicationCode}). They've been emailed a link to confirm their details.</span>
        </div>
      ) : result?.alreadyAssociated ? (
        <div className="ta-note ta-note--warn">
          <Icon name="AlertTriangle" size={15} />
          <span>This candidate is already associated with the selected job ({result.applicationCode}). Nothing new was created.</span>
        </div>
      ) : (
        <>
          <FieldGrid>
            <Field label="Candidate"><Input value={candidate.name} readOnly /></Field>
            <Field label="Position"><Input value={candidate.position} readOnly /></Field>
            <Field label="Select Job" required>
              <Select
                value={jobId} placeholder={activeJobs.length ? 'Select an active job' : 'No active jobs'}
                options={activeJobs.map((j) => ({ value: j.id, label: `${j.title} (${j.code})` }))}
                onChange={(e) => { setJobId(e.target.value); setError(''); }}
              />
            </Field>
            <Field label="Hiring Location">
              <Input value={hiringLocation} onChange={(e) => setHiringLocation(e.target.value)} />
            </Field>
          </FieldGrid>
          <p className="ta-cell-sub" style={{ marginTop: 10 }}>
            Their details carry over as they are. The candidate gets an email link to confirm them, then follows the normal Job Candidate workflow. The pipeline record is kept for history.
          </p>
          {error && (
            <div className="ta-field__error" style={{ marginTop: 10 }}>
              <Icon name="AlertCircle" size={12} /> {error}
              {result?.duplicateElsewhere && <> <button className="ta-link" onClick={viewJobCandidate}>View Job Candidate</button></>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
