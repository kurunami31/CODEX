import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseReady, signIn, signUp, signOut } from '../lib/supabase';
import { SecurityInitializer } from '../components/SecurityInitializer';

const AuthContext = createContext(null);

// When Supabase requires email confirmation, signUp() returns no session, so
// the profile row can't be inserted until the user confirms and signs in.
// We stash the form details here and complete the profile on first login.
const PENDING_PROFILE_KEY = 'codex_pending_profile';
const PENDING_PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const completePendingProfile = useCallback(async (userId) => {
    let pending;
    try {
      const raw = localStorage.getItem(PENDING_PROFILE_KEY);
      if (!raw) return;
      pending = JSON.parse(raw);
    } catch {
      return;
    }
    if (!pending || typeof pending !== 'object') return;

    // The stash belongs to this user (same id) — or, if they signed up again
    // with a different address before confirming, the same email address.
    let ownerId = userId;
    if (pending.id !== userId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || String(user.email || '').toLowerCase() !== String(pending.email || '').toLowerCase()) return;
        ownerId = user.id;
      } catch {
        return;
      }
    }

    if (Date.now() - (pending.createdAt || 0) > PENDING_PROFILE_TTL_MS) {
      try {
        localStorage.removeItem(PENDING_PROFILE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    // profiles.id is the auth user id and has no default — always set it
    // explicitly, or PostgREST rejects the row.
    const { id, createdAt, email, attempts = 0, ...profileData } = pending;
    const { error } = await supabase.from('profiles').insert({ ...profileData, id: ownerId });
    if (!error) {
      try {
        localStorage.removeItem(PENDING_PROFILE_KEY);
      } catch {
        /* ignore */
      }
    } else if (attempts >= 2) {
      // Give up after a few failures (e.g. student ID already taken) so we
      // don't retry a doomed insert on every login.
      try {
        localStorage.removeItem(PENDING_PROFILE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      try {
        localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify({ ...pending, attempts: attempts + 1 }));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const profileSelect = 'id, full_name, year_level, section, course, role, avatar_url, created_at, membership_paid, membership_paid_at';

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return setProfile(null);
    const { data, error } = await supabase
      .from('profiles')
      .select(profileSelect)
      .eq('id', userId)
      .maybeSingle();
    // A session with no profile row usually means the user signed up while
    // email confirmation was on — finish their profile from the stash.
    if (!error && !data) {
      await completePendingProfile(userId);
      const { data: retry } = await supabase.from('profiles').select(profileSelect).eq('id', userId).maybeSingle();
      if (retry) {
        setProfile(retry);
        return { data: retry, error: null };
      }
    }
    if (!error) setProfile(data || null);
    return { data, error };
  }, [completePendingProfile]);

  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) fetchProfile(s.user.id);
      else setProfile(null);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchProfile]);

  // Supabase rate-limits auth endpoints per IP (signups default to 30/hour/IP).
  // Schools often share one public IP, so several students can collectively
  // trip it — surface a clear, actionable message instead of a raw 429.
  const isRateLimited = (err) =>
    Boolean(err && (err.status === 429 || /rate limit|too many requests/i.test(err.message || '')));

  const login = async (email, password) => {
    const { error } = await signIn(email, password);
    if (isRateLimited(error)) {
      return { error: { message: 'Too many login attempts from this network — the limit resets every hour. Try again later, or use mobile data / a different network.', status: 429 } };
    }
    return { error };
  };

  const register = async ({ email, password, studentId, fullName, yearLevel, section }) => {
    // Server-side validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return { error: { message: 'Please enter a valid email address.' } };
    }
    
    // Restrict to allowed email domains
    const allowedDomains = ['gmail.com', 'dorsu.edu.ph'];
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      return { error: { message: 'Only @gmail.com or @dorsu.edu.ph email addresses are allowed.' } };
    }
    
    const nameRegex = /^[a-zA-Z\s.'-]{2,}$/;
    if (!fullName || !nameRegex.test(fullName)) {
      return { error: { message: 'Please enter a valid full name (letters, spaces, periods, hyphens, apostrophes only).' } };
    }
    
    if (!password || password.length < 6) {
      return { error: { message: 'Password must be at least 6 characters.' } };
    }
    
    const studentIdRegex = /^[0-9]{4}-[0-9]{4}$/;
    if (!studentId || !studentIdRegex.test(studentId)) {
      return { error: { message: 'Student ID must be in format YYYY-NNNN (e.g., 2024-1001).' } };
    }
    
    const sectionRegex = /^[A-Z0-9\s-]+$/i;
    if (!section || !sectionRegex.test(section)) {
      return { error: { message: 'Section can only contain letters, numbers, spaces, and hyphens.' } };
    }

    const { data, error } = await signUp(email, password);
    if (isRateLimited(error)) {
      return { error: { message: 'Too many sign-up attempts from this network — the limit resets every hour. Try again later, or use mobile data / a different network.', status: 429 } };
    }
    if (error) {
      const msg = error.message || '';
      if (/user already registered|already been registered/i.test(msg)) {
        return { error: { message: 'This email already has an account. Try logging in — or check your inbox for a confirmation link if you never confirmed it.' } };
      }
      if (/email rate limit|too many emails/i.test(msg)) {
        return { error: { message: 'Supabase is limiting emails to this address right now — wait about an hour and try again.' } };
      }
      return { error };
    }
    if (!data.user) return { error: { message: 'Sign-up failed — please try again.' } };

    const profileData = {
      id: data.user.id,
      student_id: studentId,
      full_name: fullName,
      year_level: yearLevel,
      section,
      course: 'BSIT',
      role: 'student',
    };

    // Email confirmation is enabled in Supabase: signUp returns no session, so
    // the profile insert below would be rejected by RLS. Stash the details and
    // let the verify screen guide the user — the profile completes on first login.
    if (!data.session) {
      try {
        localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify({ ...profileData, email, createdAt: Date.now() }));
      } catch {
        /* storage unavailable — user can still confirm and retry */
      }
      return { error: { message: 'Account created — confirm your email to finish setup.' } };
    }

    const { error: profileError } = await supabase.from('profiles').insert(profileData);
    if (profileError) {
      const msg = profileError.message || '';
      if (/duplicate key|already exists|unique constraint/i.test(msg) && /student_id/i.test(msg)) {
        return { error: { message: 'That student ID is already registered to another account.' } };
      }
      return { error: profileError };
    }
    return { error: null };
  };

  const logout = async () => {
    await signOut();
    setProfile(null);
    try {
      localStorage.removeItem(PENDING_PROFILE_KEY);
      localStorage.removeItem('codex_registered_device_id');
      localStorage.removeItem('codex_device_registered_at');
    } catch {
      /* ignore */
    }
  };

  const refreshProfile = () => fetchProfile(session?.user?.id);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        user: session?.user || null,
        loading,
        ready: supabaseReady,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      <SecurityInitializer>{children}</SecurityInitializer>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
