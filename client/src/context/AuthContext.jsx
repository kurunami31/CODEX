import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseReady, signIn, signUp, signOut } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return setProfile(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error) setProfile(data || null);
    return { data, error };
  }, []);

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

  const login = async (email, password) => {
    const { error } = await signIn(email, password);
    return { error };
  };

  const register = async ({ email, password, studentId, fullName, yearLevel, section }) => {
    const { data, error } = await signUp(email, password);
    if (error || !data.user) return { error: error || { message: 'Sign-up failed' } };

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      student_id: studentId,
      full_name: fullName,
      year_level: yearLevel,
      section,
      course: 'BSIT',
      role: 'student',
    });
    return { error: profileError };
  };

  const logout = async () => {
    await signOut();
    setProfile(null);
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
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
