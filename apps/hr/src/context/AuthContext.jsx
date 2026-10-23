import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured, SITE_URL } from '../lib/supabase.js';
import { recordLogin } from '../api/team.js';
import { ROLES } from '../constants/roles.js';

// Scoped to one browser tab and to the session that earned it (see
// otpRequired below) — a fresh login, a new tab, or closing the browser all
// require verifying again. Cleared on sign-out.
const OTP_VERIFIED_KEY = 'ccx_otp_verified_session';

// These two accounts may only sign in with a password — never Google, even
// though Google sign-in is otherwise open to everyone else. Enforced here
// (not just by omitting a button) since Google can independently establish
// a session for any email once it's an allowed account.
const PASSWORD_ONLY_EMAILS = ['sarthak.tyagi@ccentrik.com', 'sachin.chaudhary@ccentrik.com'];

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
  const [otpVerifiedSessionId, setOtpVerifiedSessionId] = useState(() => {
    try { return sessionStorage.getItem(OTP_VERIFIED_KEY) || null; } catch { return null; }
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (!data.session) setLoading(false);
    }).catch(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Emailed password-reset link: supabase-js has just turned it into a
      // temporary session — take the person to the set-password screen.
      if (_e === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password');
        return;
      }
      // Google-established session for a password-only account: kill it
      // before it's ever treated as signed in.
      if (s?.access_token && s.user?.email && PASSWORD_ONLY_EMAILS.includes(s.user.email.toLowerCase())) {
        try {
          const payload = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.amr?.[0]?.method === 'oauth') {
            try { sessionStorage.setItem('ccx_auth_notice', 'This account can only sign in with a password.'); } catch { /* private mode */ }
            supabase.auth.signOut();
            return;
          }
        } catch { /* malformed token — fall through to normal handling */ }
      }
      setSession(s ?? null);
      if (!s) {
        setProfile(null);
        setLoading(false);
        try { sessionStorage.removeItem(OTP_VERIFIED_KEY); } catch { /* private mode */ }
        setOtpVerifiedSessionId(null);
      } else {
        // A session just appeared (fresh sign-in, or a token refresh). The
        // profile for it hasn't loaded yet — force `loading` back on so
        // consumers (e.g. the login page's "signed in but no profile" check)
        // can't read this in-between moment as a failed/roleless sign-in and
        // sign the person right back out before the profile effect runs.
        setLoading(true);
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
          try { sessionStorage.removeItem(OTP_VERIFIED_KEY); } catch { /* private mode */ }
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

  // Super Admin only: after valid primary auth (password OR Google), a
  // second email-OTP step must be completed before any role-gated route is
  // reachable (see AppRoutes). "Verified" is scoped to this JWT's own
  // session id (from the token, not something the client can invent) and is
  // only ever set by markOtpVerified after the server accepts a code — so a
  // fresh login, a different tab, or a closed browser always re-prompts.
  // Every other role is entirely unaffected.
  const sessionId = useMemo(() => {
    if (!session?.access_token) return null;
    try {
      return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id ?? null;
    } catch {
      return null;
    }
  }, [session]);

  const otpRequired = profile?.role === ROLES.ADMIN && !!sessionId && otpVerifiedSessionId !== sessionId;

  const markOtpVerified = () => {
    if (!sessionId) return;
    try { sessionStorage.setItem(OTP_VERIFIED_KEY, sessionId); } catch { /* private mode */ }
    setOtpVerifiedSessionId(sessionId);
  };

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      mustChangePassword,
      otpRequired,
      markOtpVerified,
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
      signOut: () => {
        try { sessionStorage.removeItem(OTP_VERIFIED_KEY); } catch { /* private mode */ }
        return supabase.auth.signOut();
      },
    }),
    [session, profile, loading, mustChangePassword, otpRequired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
