'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { validateGoogleServicesAccess } from '@/lib/google-service-check';
import { useToast } from '@/hooks/use-toast';

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

const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [isBoss, setIsBoss] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          const finalProfile = { 
            id: firebaseUser.uid, 
            ...profile,
            photoURL: firebaseUser.photoURL || profile.photoURL,
            initials
          };
          setUserInfo(finalProfile);
          setIsBoss(finalProfile.role === 'Jefe' || finalProfile.role === 'Gerencia');
        } else {
            const name = firebaseUser.displayName || 'Usuario';
            const defaultProfile = {
                id: firebaseUser.uid,
                name: name,
                email: firebaseUser.email || '',
                role: 'Asesor' as const,
                photoURL: firebaseUser.photoURL,
                initials: name.substring(0, 2).toUpperCase()
            };
            setUserInfo(defaultProfile);
            setIsBoss(false);
        }
      } else {
        setUser(null);
        setUserInfo(null);
        setIsBoss(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname);
      
      if (!user && !isPublicRoute) {
        router.push('/login');
      } else if (user && isPublicRoute) {
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;

    const runCheck = async () => {
      const storageKey = 'google-access-validated';
      const hasValidated = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) === 'true' : false;
      const hasFailed = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) === 'failed' : false;
      
      // Si ya validamos o ya fallamos en esta sesión, no volvemos a molestar automáticamente en el flujo global.
      // Dejamos que los componentes individuales (como Chat) pidan re-autenticación si lo necesitan.
      if (hasValidated || hasFailed) return;

      const attemptValidation = async (interactive: boolean) => {
        const token = await getGoogleAccessToken(interactive ? undefined : { silent: true });
        if (!token) return false;

        try {
          await validateGoogleServicesAccess(token);
          if (!cancelled && typeof window !== 'undefined') {
            sessionStorage.setItem(storageKey, 'true');
          }
          return true;
        } catch (error) {
          console.error('Error verifying Google access', error);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('google-access-token');
          }
          return false;
        }
      };

      const silentOk = await attemptValidation(false);
      if (silentOk || cancelled) return;

      // NOTA: Se ha removido el intento interactivo automático al cargar la app
      // para evitar loops. Si se requiere acceso, el componente específico debe solicitarlo.
      
      if (!cancelled && typeof window !== 'undefined') {
          sessionStorage.setItem(storageKey, 'failed');
      }
    };

    runCheck();

    return () => {
      cancelled = true;
    };
  }, [loading, user, pathname, router]); // Se removió toast de deps para evitar loops raros

    const getGoogleAccessToken = async (options?: { silent?: boolean }): Promise<string | null> => {
        if (typeof window === 'undefined') return null;

        let storedToken = null;
        try {
            storedToken = sessionStorage.getItem('google-access-token');
        } catch (error) {
            console.warn('Unable to access sessionStorage for Google token', error);
        }

        // Si tenemos token guardado, lo devolvemos asumiendo validez temporal.
        // Los componentes deben manejar el error 401/403 y pedir re-login.
        if (storedToken) return storedToken;

        // Si es silencioso y no hay token, fallamos rápido.
        if (options?.silent) {
            return null;
        }

        if (auth.currentUser) {
            const provider = new GoogleAuthProvider();
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            provider.addScope('https://www.googleapis.com/auth/drive.file');
            provider.addScope('https://www.googleapis.com/auth/chat.messages');
            provider.addScope('https://www.googleapis.com/auth/chat.messages.readonly');
            provider.addScope('https://www.googleapis.com/auth/chat.spaces.readonly');
            
            try {
                // Re-autenticar para obtener token fresco
                const result = await signInWithPopup(auth, provider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                if (token) {
                    try {
                        sessionStorage.setItem('google-access-token', token);
                        // Resetear estado de validación si conseguimos nuevo token
                        sessionStorage.removeItem('google-access-validated');
                    } catch (error) {
                        console.warn('Unable to persist Google token in sessionStorage', error);
                    }
                    return token;
                }
            } catch (error) {
                console.error("Error getting Google access token:", error);
                return null;
            }
        }
        return null;
    };

    const ensureGoogleAccessToken = async (): Promise<string | null> => {
        const token = await getGoogleAccessToken();
        if (!token) return null;

        try {
            await validateGoogleServicesAccess(token);
            return token;
        } catch (error) {
            console.error('Google services check failed', error);
            try {
                sessionStorage.removeItem('google-access-token');
            } catch (err) {
                console.warn('Unable to clear Google token', err);
            }
            // NO cerramos sesión global (auth.signOut) porque el usuario puede seguir usando la app
            // sin las funciones de Google. Solo limpiamos el token inválido.
            return null;
        }
    };


  if (loading && !publicRoutes.includes(pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!loading && (user || publicRoutes.includes(pathname))) {
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
