import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { validateSession } from '../lib/api';
import type { AuthSession } from '../lib/types';
import { signInExternalUser, signInWithGoogle, signOutMobileUser } from './mobile-auth';

type AuthContextValue = {
  initializing: boolean;
  firebaseUser: FirebaseUser | null;
  session: AuthSession | null;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (user: FirebaseUser | null) => {
    setError(null);
    if (!user) {
      setSession(null);
      return;
    }

    try {
      setSession(await validateSession(user));
    } catch (sessionError) {
      setSession(null);
      setError(sessionError instanceof Error ? sessionError.message : 'No se pudo validar la sesion.');
      await signOutMobileUser();
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await loadSession(user);
      setInitializing(false);
    });

    return unsubscribe;
  }, [loadSession]);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    await signInWithGoogle();
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    await signInExternalUser(email, password);
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    setFirebaseUser(null);
    await signOutMobileUser();
  }, []);

  const refreshSession = useCallback(async () => {
    await loadSession(auth.currentUser);
  }, [loadSession]);

  const value = useMemo<AuthContextValue>(() => ({
    initializing,
    firebaseUser,
    session,
    error,
    loginWithGoogle,
    loginWithEmail,
    logout,
    refreshSession,
  }), [error, firebaseUser, initializing, loginWithEmail, loginWithGoogle, logout, refreshSession, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return value;
}
