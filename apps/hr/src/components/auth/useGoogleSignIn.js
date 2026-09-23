import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { SITE_URL } from '../../lib/supabase.js';

/* Shared "click Google, handle the error" logic for the HR login page —
   ported from the recruitment app's identical hook. */
// landingPath: where Google should send the browser back to (the HR login
// page routes an authenticated user straight into their portal).
export function useGoogleSignIn(landingPath) {
  const { configured, signInWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  const trigger = async () => {
    if (!configured || signing) return;
    setError('');
    setSigning(true);
    const { error: oauthError } = await signInWithGoogle(landingPath ? `${SITE_URL}${landingPath}` : undefined);
    if (oauthError) {
      setError(oauthError.message);
      setSigning(false);
    }
  };

  return { error, signing, trigger };
}
