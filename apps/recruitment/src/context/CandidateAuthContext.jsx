import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { candidateSupabase, isSupabaseConfigured, SITE_URL, markAuthIntent } from '../lib/supabase.js';

/**
 * The Jobs/Candidate Portal's OWN authentication — deliberately a separate
 * Supabase Auth client (`candidateSupabase`, its own storage key) from the one
 * AuthContext uses for Talent Acquisition. A TA signed in on /ta/* must never
 * appear signed in here, and nothing here ever looks at, reuses or creates a
 * `profiles` row from the TA's session. See lib/supabase.js for the full
 * reasoning; see AuthContext.jsx for the (separate) TA session this mirrors.
 */
const CandidateAuthContext = createContext(null);

export function CandidateAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    candidateSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
    const { data: sub } = candidateSupabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      loading,
      // Basic identity only — a candidate is never asked for Gmail/Calendar
      // access, so there is no "unverified app" warning at sign-in.
      signInWithGoogle: (redirectTo = `${SITE_URL}/`) => {
        markAuthIntent('candidate');
        return candidateSupabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, queryParams: { prompt: 'select_account' } },
        });
      },
      // Kept for a manually-created test account only — candidates are meant
      // to use Google (see LoginPage.jsx).
      signInWithPassword: (email, password) => candidateSupabase.auth.signInWithPassword({ email, password }),
      // Silent, no-redirect session for a candidate who hasn't signed in at
      // all — an anonymous Supabase user, not a "real" account. Satisfies every
      // RLS policy / edge-function auth check exactly like a real sign-in
      // would, so the application can be submitted with zero friction. Call
      // right before an action that needs a real row owner (document upload,
      // submit) — never on page load, and never anything but this client, so
      // it can NEVER pick up a TA's existing session by accident.
      ensureSession: async () => {
        const { data } = await candidateSupabase.auth.getSession();
        if (data.session) return data.session;
        const { data: anon, error } = await candidateSupabase.auth.signInAnonymously();
        if (error) throw error;
        return anon.session;
      },
      // Upgrades the CURRENT (candidate) session to a real Google identity
      // instead of starting a fresh one — same auth.users id, so the same
      // profile/candidate/application rows stay attached.
      linkGoogle: (redirectTo = `${SITE_URL}/`) => {
        markAuthIntent('candidate');
        return candidateSupabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } });
      },
      signOut: () => candidateSupabase.auth.signOut(),
    }),
    [session, loading]
  );

  return <CandidateAuthContext.Provider value={value}>{children}</CandidateAuthContext.Provider>;
}

export function useCandidateAuth() {
  const ctx = useContext(CandidateAuthContext);
  if (!ctx) throw new Error('useCandidateAuth must be used within CandidateAuthProvider');
  return ctx;
}
