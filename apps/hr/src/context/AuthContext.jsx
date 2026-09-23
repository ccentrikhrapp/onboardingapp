import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured, SITE_URL } from '../lib/supabase.js';
import { recordLogin } from '../api/team.js';

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
      // Emailed password-reset link: supabase-js has just turned it into a
      // temporary session — take the person to the set-password screen.
      if (_e === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password');
        return;
      }
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
          .then(() => window.dispatchEvent(new Event('ccx-google-connected')))
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
      .select('id, email, full_name, avatar_url, role, active, must_change_password')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        // Disabled accounts are signed straight back out (the database and
        // every edge function also refuse them — this is just the UX).
        if (data && data.active === false) {
          try { sessionStorage.setItem('ccx_auth_notice', 'Your account has been disabled. Please contact your administrator.'); } catch { /* private mode */ }
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

  // One audit row per real sign-in (keyed on last_sign_in_at so tab refocus /
  // token refresh doesn't log again).
  useEffect(() => {
    const stamp = session?.user?.last_sign_in_at;
    if (!profile || !stamp) return;
    const key = `ccx_login_logged_${profile.id}`;
    try {
      if (localStorage.getItem(key) === stamp) return;
      localStorage.setItem(key, stamp);
    } catch { /* storage blocked — logging twice is harmless */ }
    // The JWT's newest "amr" entry says how THIS session was established.
    let method = 'password';
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.amr?.[0]?.method === 'oauth') method = 'google';
    } catch { /* fall back to password */ }
    recordLogin(method);
  }, [profile, session]);

  // Signed in with the emailed temporary password: the server already treats
  // this session as role-less; this flag makes the app show only the
  // "choose your own password" screen. Google sessions are never affected.
  const mustChangePassword = useMemo(() => {
    if (!profile?.must_change_password || !session?.access_token) return false;
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.amr?.[0]?.method === 'password';
    } catch {
      return false;
    }
  }, [profile, session]);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      mustChangePassword,
      loading,
      // Signing in only asks Google for basic identity (name + email), so there
      // is no "unverified app" warning at login. Sending email needs more and is
      // requested once, on purpose, from inside the portal via connectGoogle.
      signInWithGoogle: (redirectTo = `${SITE_URL}/`) =>
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, queryParams: { prompt: 'select_account' } },
        }),
      // One time: lets this app send workflow emails through the signed-in
      // person's own Gmail account (see store-google-token).
      connectGoogle: (redirectTo = `${SITE_URL}/hr`) =>
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            scopes: 'https://www.googleapis.com/auth/gmail.send',
            queryParams: { access_type: 'offline', prompt: 'consent', login_hint: session?.user?.email ?? '' },
          },
        }),
      signInWithPassword: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      // Supabase's own recovery email (single-use, expiring link); the reply
      // is deliberately identical whether or not the address has an account.
      requestPasswordReset: (email) =>
        supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/reset-password` }),
      signOut: () => supabase.auth.signOut(),
    }),
    [session, profile, loading, mustChangePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
