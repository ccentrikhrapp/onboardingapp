import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

/* Shared "click Google, handle the error" logic for the HR login page —
   ported from the recruitment app's identical hook. */
export function useGoogleSignIn() {
  const { configured, signInWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  const trigger = async () => {
    if (!configured || signing) return;
    setError('');
    setSigning(true);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message);
      setSigning(false);
    }
  };

  return { error, signing, trigger };
}
