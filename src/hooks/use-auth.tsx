'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import type { User } from '@/lib/types';
import { validateGoogleServicesAccess } from '@/lib/google-service-check';
import { useToast } from '@/hooks/use-toast';
import { getAuthSession } from '@/lib/api/auth';
import { hydratePermissionsCache } from '@/lib/permissions';
import { ApiError } from '@/lib/api-client';

const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service', '/'];

interface AuthContextType {
  user: FirebaseUser | null;
  userInfo: User | null;
  loading: boolean;
  isBoss: boolean;
  getGoogleAccessToken: (options?: { silent?: boolean }) => Promise<string | null>;
  ensureGoogleAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
  isBoss: false,
  getGoogleAccessToken: async () => null,
  ensureGoogleAccessToken: async () => null,
});

let googleAccessTokenMemory: { token: string; expiresAt: number } | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [isBoss, setIsBoss] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/public/');
      if (!user && !isPublicRoute) {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const saveTokenToStorage = (token: string, expiresInSeconds: number = 3600) => {
    googleAccessTokenMemory = {
      token,
      expiresAt: Date.now() + expiresInSeconds * 1000 - 5 * 60 * 1000,
    };
  };

  const clearStoredToken = () => {
    if (typeof window === 'undefined') return;
    googleAccessTokenMemory = null;
    localStorage.removeItem('google_api_token');
    localStorage.removeItem('google_api_token_expiry');
    sessionStorage.removeItem('google-access-validated');
  };

  const getStoredToken = (): string | null => {
    if (!googleAccessTokenMemory) return null;
    if (Date.now() > googleAccessTokenMemory.expiresAt) {
      clearStoredToken();
      return null;
    }
    return googleAccessTokenMemory.token;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        try {
          const session = await getAuthSession(firebaseUser);
          hydratePermissionsCache(session.permissions);
          setUserInfo(session.user);
          setIsBoss(session.user.role === 'Jefe' || session.user.role === 'Gerencia');
        } catch (error) {
          console.error('Error al inicializar el usuario:', error);
          clearStoredToken();
          setUserInfo(null);
          setIsBoss(false);
          setLoading(false);

          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            await auth.signOut();
            setUser(null);
            toast({
              title: 'Acceso Denegado',
              description: error.message || 'No se pudo validar tu acceso.',
              variant: 'destructive',
            });
            return;
          }

          toast({
            title: 'No se pudo iniciar la sesion',
            description: error instanceof Error ? error.message : 'Hubo un error temporal validando tu sesion.',
            variant: 'destructive',
          });
          return;
        }
      } else {
        setUser(null);
        setUserInfo(null);
        setIsBoss(false);
        clearStoredToken();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  useEffect(() => {
    if (loading || !user) return;

    const runCheck = async () => {
      const storageKey = 'google-access-validated';
      const hasValidated = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) === 'true' : false;
      if (hasValidated) return;

      const token = getStoredToken();
      if (token) {
        try {
          await validateGoogleServicesAccess(token);
          if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, 'true');
        } catch (error: any) {
          console.warn('Silent validation failed:', error);
          if (error.message && (error.message.includes('403') || error.message.includes('401'))) {
            console.log('Token invalido o sin scopes. Eliminando para forzar re-login.');
            clearStoredToken();
          }
        }
      }
    };

    runCheck();
  }, [loading, user]);

  const getGoogleAccessToken = async (options?: { silent?: boolean }): Promise<string | null> => {
    if (typeof window === 'undefined') return null;

    const storedToken = getStoredToken();
    if (storedToken) return storedToken;

    if (options?.silent) return null;

    if (auth.currentUser) {
      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        include_granted_scopes: 'true',
      });

      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');

      try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        // @ts-ignore
        const expiresIn = result._tokenResponse?.oauthExpiresIn ? parseInt(result._tokenResponse.oauthExpiresIn) : 3600;

        if (token) {
          saveTokenToStorage(token, expiresIn);
          sessionStorage.setItem('google-access-validated', 'true');
          return token;
        }
      } catch (error) {
        console.error('Error getting Google access token:', error);
        return null;
      }
    }
    return null;
  };

  const ensureGoogleAccessToken = async (): Promise<string | null> => {
    const token = await getGoogleAccessToken({ silent: true });
    if (token) return token;
    return getGoogleAccessToken({ silent: false });
  };

  if (loading && !publicRoutes.includes(pathname) && !pathname.startsWith('/public/')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!loading && (user || publicRoutes.includes(pathname) || pathname.startsWith('/public/'))) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken, ensureGoogleAccessToken }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="large" />
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
