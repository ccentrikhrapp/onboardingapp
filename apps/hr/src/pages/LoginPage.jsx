import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, ROLE_META } from '../constants/roles.js';

export default function LoginPage() {
  const { configured, role, loading, signInWithGoogle, signOut } = useAuth();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  if (configured && !loading && role) {
    if ([ROLES.HR, ROLES.ADMIN].includes(role)) {
      return <Navigate to={ROLE_META[role].home} replace />;
    }
    // A candidate/TA account somehow reached the HR app's Supabase project.
    return (
      <div className="hr-login">
        <div className="hr-login__panel">
          <p>This account does not have HR access. Please use the recruitment application instead.</p>
          <button type="button" className="hr-login__google" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  const googleSignIn = async () => {
    if (!configured) return;
    setError('');
    setSigning(true);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message);
      setSigning(false);
    }
  };

  return (
    <div className="hr-login">
      <div className="hr-login__panel">
        <div className="hr-login__mark">H</div>
        <h1>Ccentrik HR</h1>
        <p>Sign in with your HR Google account.</p>
        {error && (
          <div className="hr-login__alert"><Icon name="AlertCircle" size={15} /> {error}</div>
        )}
        {!configured && (
          <div className="hr-login__alert"><Icon name="AlertCircle" size={15} /> Backend not configured yet — see .env.example.</div>
        )}
        <button type="button" className="hr-login__google" onClick={googleSignIn} disabled={!configured || signing || loading}>
          <Icon name="LogIn" size={16} /> {signing ? 'Signing in…' : 'Sign in with Google'}
        </button>
        <p className="hr-login__foot">Access is granted by your HR administrator. Candidate/TA accounts belong to a separate application.</p>
      </div>
    </div>
  );
}
