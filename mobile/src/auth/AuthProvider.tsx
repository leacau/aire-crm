import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { hasMobileRuntimeConfig, missingMobileEnvNames } from '../config/env';
import { auth } from '../lib/firebase';
import { getMobileBootstrap, validateSession } from '../lib/api';
import { unregisterMobileNotificationToken, useMobileNotifications } from '../lib/notifications';
import type { AuthSession, MobileBootstrap } from '../lib/types';
import { signInExternalUser, signInWithGoogle, signOutMobileUser } from './mobile-auth';

type AuthContextValue = {
  initializing: boolean;
  firebaseUser: FirebaseUser | null;
  session: AuthSession | null;
  bootstrap: MobileBootstrap | null;
  error: string | null;
  canUseAuth: boolean;
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
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configError = hasMobileRuntimeConfig
    ? null
    : `Faltan variables de entorno en el build mobile: ${missingMobileEnvNames.join(', ')}.`;

  useMobileNotifications(firebaseUser, Boolean(session));

  const loadSession = useCallback(async (user: FirebaseUser | null, options?: { throwOnError?: boolean }) => {
    if (!user) {
      setSession(null);
      setBootstrap(null);
      return;
    }

    setError(null);
    try {
      let nextBootstrap: MobileBootstrap;
      try {
        nextBootstrap = await getMobileBootstrap(user);
      } catch (bootstrapError) {
        const fallbackSession = await validateSession(user);
        nextBootstrap = {
          session: fallbackSession,
          tasks: [],
          clients: [],
          opportunities: [],
          stats: {
            pendingTasks: 0,
            visibleClients: 0,
            activeOpportunities: 0,
          },
        };
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'No se pudo cargar el inicio mobile completo.');
      }
      setSession(nextBootstrap.session);
      setBootstrap(nextBootstrap);
    } catch (sessionError) {
      const message = sessionError instanceof Error ? sessionError.message : 'No se pudo validar la sesion.';
      setSession(null);
      setBootstrap(null);
      setError(message);
      await signOutMobileUser();
      if (options?.throwOnError) {
        throw new Error(message);
      }
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setError(configError || 'La app mobile no esta configurada.');
      setInitializing(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await loadSession(user);
      setInitializing(false);
    });

    return unsubscribe;
  }, [configError, loadSession]);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    const signedInUser = await signInWithGoogle();
    setFirebaseUser(signedInUser);
    await loadSession(signedInUser, { throwOnError: true });
  }, [loadSession]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    const signedInUser = await signInExternalUser(email, password);
    setFirebaseUser(signedInUser);
    await loadSession(signedInUser, { throwOnError: true });
  }, [loadSession]);

  const logout = useCallback(async () => {
    const currentUser = auth?.currentUser || firebaseUser;
    setError(null);
    setSession(null);
    setBootstrap(null);
    setFirebaseUser(null);
    if (currentUser) {
      await unregisterMobileNotificationToken(currentUser);
    }
    await signOutMobileUser();
  }, [firebaseUser]);

  const refreshSession = useCallback(async () => {
    await loadSession(auth?.currentUser || null);
  }, [loadSession]);

  const value = useMemo<AuthContextValue>(() => ({
    initializing,
    firebaseUser,
    session,
    bootstrap,
    error,
    canUseAuth: Boolean(auth),
    loginWithGoogle,
    loginWithEmail,
    logout,
    refreshSession,
  }), [bootstrap, error, firebaseUser, initializing, loginWithEmail, loginWithGoogle, logout, refreshSession, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return value;
}
