import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon.jsx';
import Button from '../../components/ta/Button.jsx';
import Card from '../../components/ta/Card.jsx';
import { useCandidateAuth } from '../../context/CandidateAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const NEXT_STEPS = [
  'Application received',
  'Talent Acquisition review',
  'Interview',
  'Document verification',
  'Offer',
  'Joining',
];

export default function ApplicationSuccessPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, linkGoogle } = useCandidateAuth();
  const toast = useToast();
  const [linking, setLinking] = useState(false);

  if (!state?.candidateId && !state?.applicationId) return <Navigate to="/candidate" replace />;

  // The application was already created (anonymously, if the candidate chose
  // not to sign in) — this is a pure convenience offer, never a gate. Only
  // shown while the current session is still anonymous; skipped entirely for
  // a candidate who was already signed in with a real account.
  const offerAccount = user?.is_anonymous === true;
  const linkAccount = async () => {
    setLinking(true);
    try {
      // Not window.location.href: this page's confirmation only exists via
      // React Router navigation state, which a real OAuth round-trip (full
      // page reload) always wipes — landing back here would just bounce to
      // /candidate via the empty-state redirect above. My Application loads
      // fresh from the API by the now-authenticated session instead, so it
      // survives the reload correctly.
      const { error } = await linkGoogle(`${window.location.origin}/candidate/application`);
      if (error) throw error;
    } catch (err) {
      setLinking(false);
      toast.error(err.message || 'Could not start Google sign-in. You can try again anytime from My Application.');
    }
  };

  return (
    <div className="cx-page cx-page--narrow">
      <div className="cx-success">
        <span className="cx-success__check"><Icon name="CheckCircle2" size={26} /></span>
        <h1 className="cx-page__title">Application submitted</h1>
        <p className="cx-page__sub" style={{ marginBottom: 20 }}>
          Thank you for applying to Ccentrik{state.jobTitle ? ` for ${state.jobTitle}` : ''}. Our team will review it and get back to you.
        </p>
      </div>

      <Card>
        <div className="ta-info" style={{ marginBottom: 4 }}>
          <div className="ta-info__item">
            <span className="ta-info__label">Application reference</span>
            <span className="ta-info__value">{state.applicationCode || state.applicationId}</span>
          </div>
          {state.candidateId && (
            <div className="ta-info__item"><span className="ta-info__label">Candidate ID</span><span className="ta-info__value">{state.candidateId}</span></div>
          )}
        </div>
      </Card>

      <div style={{ height: 16 }} />

      {offerAccount && (
        <>
          <Card title="Want easier access to your application?">
            <p className="ta-cell-sub" style={{ marginBottom: 14 }}>
              Sign in with Google to check your status anytime without saving a link — completely optional, your application is already submitted either way.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button icon="CircleUserRound" onClick={linkAccount} disabled={linking}>
                {linking ? 'Opening Google…' : 'Sign in with Google'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/candidate/application')}>Continue without account</Button>
            </div>
          </Card>
          <div style={{ height: 16 }} />
        </>
      )}

      <Card title="What happens next">
        <ol className="ta-timeline">
          {NEXT_STEPS.map((label, i) => (
            <li key={label}>
              <span className="ta-timeline__dot" style={{ background: i === 0 ? 'var(--tag-green-fg)' : 'var(--ta-line)' }} />
              <div>
                <div className="ta-cell-strong" style={{ color: i === 0 ? undefined : 'var(--ta-text-mute)' }}>{label}</div>
                <div className="ta-cell-sub">{i === 0 ? 'Completed' : 'Upcoming'}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
        <Button icon="ClipboardList" onClick={() => navigate('/candidate/application')}>Track application</Button>
        <Button variant="ghost" icon="Briefcase" onClick={() => navigate('/candidate')}>Back to careers</Button>
      </div>
    </div>
  );
}
