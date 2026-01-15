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
import { initializePermissions } from '@/lib/permissions';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        const [profile] = await Promise.all([
            getUserProfile(firebaseUser.uid),
            initializePermissions()
        ]);
        
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
        // Limpiamos token si se cierra sesión en firebase
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('google-access-token');
            sessionStorage.removeItem('google-access-validated');
        }
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

  // Validación de servicios en segundo plano, pero menos agresiva
  useEffect(() => {
    if (loading || !user) return;

    const runCheck = async () => {
      const storageKey = 'google-access-validated';
      const hasValidated = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) === 'true' : false;
      
      if (hasValidated) return; // Si ya validamos en esta sesión, no molestamos más

      const token = await getGoogleAccessToken({ silent: true });
      if (token) {
        try {
          await validateGoogleServicesAccess(token);
          if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, 'true');
        } catch (error) {
          console.warn('Silent validation failed, but avoiding forced logout to preserve UX', error);
          // No borramos el token aquí para no interrumpir al usuario, 
          // dejaremos que el fallo ocurra solo si intenta usar una herramienta específica.
        }
      }
    };

    runCheck();
  }, [loading, user]);

    const getGoogleAccessToken = async (options?: { silent?: boolean }): Promise<string | null> => {
        if (typeof window === 'undefined') return null;

        let storedToken = null;
        try {
            storedToken = sessionStorage.getItem('google-access-token');
        } catch (error) {
            console.warn('Unable to access sessionStorage', error);
        }

        if (storedToken) return storedToken;

        if (options?.silent) return null;

        if (auth.currentUser) {
            // Si llegamos aquí, es porque no hay token y el usuario pidió una acción que lo requiere.
            // Entonces sí lanzamos el popup.
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({
                  prompt: 'consent select_account',
                  access_type: 'offline'
              });
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            provider.addScope('https://www.googleapis.com/auth/drive.file');
            provider.addScope('https://www.googleapis.com/auth/chat.messages');
            provider.addScope('https://www.googleapis.com/auth/chat.spaces.readonly');
            
            try {
                const result = await signInWithPopup(auth, provider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                if (token) {
                    sessionStorage.setItem('google-access-token', token);
                    sessionStorage.setItem('google-access-validated', 'true');
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
        // Devolvemos el token directamente. La validación ya se hace en segundo plano 
        // o fallará en la llamada específica a la API, no bloqueamos aquí.
        return token;
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
