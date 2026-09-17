import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured, SITE_URL } from '../lib/supabase.js';

/**
 * Real authentication. One Google account -> one profile row -> one role.
 * Everything downstream (route guards, API calls, RLS) keys off `profile.role`,
 * which is set server-side from the staff allowlist and cannot be changed here.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
      // Google only returns a refresh token on fresh consent (we always ask
      // for one via prompt=consent), so this only fires occasionally, not on
      // every silent re-login — store it so workflow emails can later be
      // sent through this person's own Gmail account instead of a shared
      // mailbox. Best-effort: a failure here shouldn't block sign-in.
      if (s?.provider_refresh_token && s.user?.email) {
        supabase.functions
          .invoke('store-google-token', {
            body: { refreshToken: s.provider_refresh_token, googleEmail: s.user.email, scope: 'gmail.send' },
          })
          .catch(() => {});
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the profile whenever the signed-in user changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, phone, active')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        // A deactivated TA/Admin TA/HR account (see TA Management) is signed
        // out immediately rather than left holding a live session — RLS is
        // keyed on role, not on `active`, so this is enforced here instead.
        if (data && data.active === false) {
          supabase.auth.signOut();
          setProfile(null);
          setLoading(false);
          return;
        }
        setProfile(data ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      // access_type/prompt=consent + these scopes let this app, later, send
      // workflow emails through the signed-in person's own Gmail account
      // (see store-google-token) and create real Google Meet links on their
      // own calendar when they schedule an interview — instead of a shared
      // mailbox and a fake meet.google.com link.
      signInWithGoogle: (redirectTo = `${SITE_URL}/`) =>
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events',
            queryParams: { access_type: 'offline', prompt: 'consent' },
          },
        }),
      // Email/password — for staff (Talent Acquisition) accounts an admin has
      // provisioned; candidates only ever use Google.
      signInWithPassword: (email, password) =>
        supabase.auth.signInWithPassword({ email, password }),
      // Silent, no-redirect session for a candidate who hasn't signed in at
      // all — an anonymous Supabase user, not a "real" account. Satisfies
      // every RLS policy / edge-function auth check exactly like a real
      // sign-in would, so the application can be submitted with zero
      // friction. Call right before an action that needs a real row owner
      // (document upload, submit) — never on page load.
      ensureSession: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session;
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        return anon.session;
      },
      // Upgrades the CURRENT session (anonymous or not) to a real Google
      // identity instead of starting a fresh one — same auth.users id, so
      // the same profile/candidate/application rows stay attached. This is
      // the "optional account" step offered after a successful submission.
      linkGoogle: (redirectTo = `${SITE_URL}/`) =>
        supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo,
            scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events',
            queryParams: { access_type: 'offline', prompt: 'consent' },
          },
        }),
      signOut: () => supabase.auth.signOut(),
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
