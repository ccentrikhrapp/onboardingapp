import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import Button from '../../components/kit/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getOnboardingCase, updateOnboardingStatus, createEmployee } from '../../api/onboarding.js';
import { ONBOARDING_STATUSES, statusMeta } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';

function Info({ label, value }) {
  return (
    <div className="hr-info__item">
      <span className="hr-info__label">{label}</span>
      <span className="hr-info__value">{value || '—'}</span>
    </div>
  );
}

export default function OnboardingCaseDetailPage() {
  const { caseId } = useParams();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    getOnboardingCase(caseId)
      .then(setItem)
      .catch((e) => setError(e.message || 'Could not load this case.'));
  };
  useEffect(load, [caseId]);

  if (error) return <Card><p className="text-secondary">{error}</p></Card>;
  if (!item) return <div className="hr-loading">Loading…</div>;

  const meta = statusMeta(item.status);
  const idx = ONBOARDING_STATUSES.indexOf(item.status);
  const nextStatus = idx >= 0 && idx < ONBOARDING_STATUSES.length - 3 ? ONBOARDING_STATUSES[idx + 1] : null;
  const readyToHire = item.status === 'ready_for_joining' || item.status === 'joining_confirmed';
  const isEmployee = ['employee_created', 'completed'].includes(item.status);

  const advance = async () => {
    if (!nextStatus) return;
    setBusy(true);
    try {
      await updateOnboardingStatus(item.id, nextStatus);
      toast.success(`Marked as "${statusMeta(nextStatus).label}".`);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not update the status.');
    } finally {
      setBusy(false);
    }
  };

  const hire = async () => {
    setBusy(true);
    try {
      const employee = await createEmployee(item);
      toast.success(`Employee record created — ${employee.employee_code}.`);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not create the employee record.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HRHeader
        title={item.candidate_name || 'Onboarding case'}
        subtitle={`${item.job_title || ''}${item.department ? ` · ${item.department}` : ''}`}
        backTo="/hr/onboarding"
        backLabel="Onboarding"
      />

      <Card title="Status" action={<Tag tone={meta.tone}>{meta.label}</Tag>}>
        <p className="hr-cell-sub" style={{ marginBottom: 14 }}>
          This candidate is a <strong>Pre-Employee</strong> until joining is confirmed and an employee
          record is created — see docs/requirements/02-two-application-architecture.md §4.
        </p>
        <div className="hr-btnrow">
          {!isEmployee && nextStatus && (
            <Button icon="ArrowRight" disabled={busy} onClick={advance}>
              Mark as "{statusMeta(nextStatus).label}"
            </Button>
          )}
          {readyToHire && !isEmployee && (
            <Button variant="ghost" icon="UserPlus" disabled={busy} onClick={hire}>
              Create employee record
            </Button>
          )}
          {isEmployee && (
            <span className="hr-cell-sub"><Tag tone="green">Active employee</Tag></span>
          )}
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Candidate & offer details">
        <div className="hr-info">
          <Info label="Candidate email" value={item.candidate_email} />
          <Info label="Candidate phone" value={item.candidate_phone} />
          <Info label="Position" value={item.job_title} />
          <Info label="Department" value={item.department} />
          <Info label="Designation" value={item.designation} />
          <Info label="Location" value={item.location} />
          <Info label="Employment type" value={item.employment_type} />
          <Info label="Offer date" value={formatDate(item.offer_date)} />
          <Info label="Joining date" value={formatDate(item.joining_date)} />
        </div>
      </Card>
    </>
  );
}
