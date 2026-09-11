import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import Tag from '../../components/kit/Tag.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import { listOnboardingCases } from '../../api/onboarding.js';
import { statusMeta } from '../../constants/statuses.js';
import { formatDate } from '../../utils/format.js';

export default function OnboardingCasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listOnboardingCases()
      .then((rows) => !cancelled && setCases(rows || []))
      .catch((e) => !cancelled && setError(e.message || 'Could not load onboarding cases.'));
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <HRHeader title="Onboarding" subtitle="Candidates who accepted an offer, from Pre-Employee through to Employee." />

      {error && <Card><p className="text-secondary">{error}</p></Card>}
      {cases === null && !error && <div className="hr-loading">Loading…</div>}

      {cases !== null && cases.length === 0 && (
        <EmptyState
          icon="ClipboardCheck"
          title="No onboarding cases yet"
          message="A case appears here automatically as soon as a candidate accepts an offer in the recruitment application."
        />
      )}

      <div className="hr-stack">
        {(cases || []).map((c) => {
          const meta = statusMeta(c.status);
          return (
            <Card key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="hr-cell-strong">{c.candidate_name || 'Candidate'}</div>
                  <div className="hr-cell-sub">
                    {c.job_title}{c.department ? ` · ${c.department}` : ''}
                    {c.joining_date ? ` · joining ${formatDate(c.joining_date)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                  <button className="hr-link" onClick={() => navigate(`/hr/onboarding/${c.id}`)}>
                    Open
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
