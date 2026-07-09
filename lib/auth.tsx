import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Employee } from '../types/db';

interface AuthState {
  session: Session | null;
  employee: Employee | null;
  loading: boolean;
  signInWithPin: (email: string, pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setEmployee(null); return; }
    supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single()
      .then(({ data }) => setEmployee(data));
  }, [session]);

  const signInWithPin = async (email: string, pin: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
    return { error: error?.message ?? null };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ session, employee, loading, signInWithPin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
