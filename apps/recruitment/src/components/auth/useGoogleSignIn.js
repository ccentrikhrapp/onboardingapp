import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { SITE_URL } from '../../lib/supabase.js';
import { SIGN_IN_FAILED } from '../../utils/authFlow.js';

/* Shared "click Google, handle the error" logic for every sign-in button —
   staff and candidate alike. */
// landingPath: where Google should send the browser back to. A staff login
// page passes its own path so an authenticated staff member is routed into
// their portal, not the generic landing page.
// useAuthHook: which identity this button signs into — defaults to the TA
// context (useAuth) so every existing staff call site is unaffected; candidate
// call sites pass useCandidateAuth explicitly. These are never mixed — see
// lib/supabase.js for why TA and candidate sessions must stay separate.
export function useGoogleSignIn(landingPath, useAuthHook = useAuth) {
  const { configured, signInWithGoogle } = useAuthHook();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  const trigger = async () => {
    if (!configured || signing) return;
    setError('');
    setSigning(true);
    const { error: oauthError } = await signInWithGoogle(landingPath ? `${SITE_URL}${landingPath}` : undefined);
    if (oauthError) {
      setError(SIGN_IN_FAILED);
      setSigning(false);
    }
  };

  return { error, signing, trigger };
}
