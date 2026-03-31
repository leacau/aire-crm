'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile, getEmailWhitelist } from '@/lib/firebase-service'; 
import type { User } from '@/lib/types';
import { validateGoogleServicesAccess } from '@/lib/google-service-check';
import { initializePermissions } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast'; 

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

const STORAGE_TOKEN_KEY = 'google_api_token';
const STORAGE_EXPIRY_KEY = 'google_api_token_expiry';

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
      // 🟢 BARRERA: Permitimos las rutas que empiecen con /public
      const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/public');
      if (!user && !isPublicRoute) {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const saveTokenToStorage = (token: string, expiresInSeconds: number = 3600) => {
    if (typeof window === 'undefined') return;
    const expiryTime = Date.now() + (expiresInSeconds * 1000) - (5 * 60 * 1000); 
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_EXPIRY_KEY, expiryTime.toString());
  };

  const clearStoredToken = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    sessionStorage.removeItem('google-access-validated');
  };

  const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const expiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

    if (!token || !expiry) return null;

    if (Date.now() > parseInt(expiry, 10)) {
        clearStoredToken();
        return null;
    }
    return token;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 🟢 BARRERA DE ACCESO: VALIDACIÓN DE DOMINIO Y LISTA BLANCA
        const email = firebaseUser.email?.toLowerCase() || '';
        const isAuthorizedDomain = email.endsWith('@airedesantafe.com.ar') || email.endsWith('@airedigital.com.ar');
        const isHardcodedException = email === 'leandrochena@gmail.com';

        let isWhitelisted = false;
        if (!isAuthorizedDomain && !isHardcodedException) {
            const whitelist = await getEmailWhitelist();
            isWhitelisted = whitelist.includes(email);
        }

        if (!isAuthorizedDomain && !isHardcodedException && !isWhitelisted) {
            await auth.signOut();
            clearStoredToken();
            setUser(null);
            setUserInfo(null);
            setIsBoss(false);
            setLoading(false);
            toast({ 
                title: 'Acceso Denegado', 
                description: 'Tu correo no pertenece a la organización ni está en la lista de autorizados.', 
                variant: 'destructive' 
            });
            return;
        }

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
            setUserInfo({
                id: firebaseUser.uid,
                name: name,
                email: firebaseUser.email || '',
                role: 'Asesor',
                photoURL: firebaseUser.photoURL,
                initials: name.substring(0, 2).toUpperCase()
            });
            setIsBoss(false);
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
             console.log('Token inválido o sin scopes. Eliminando para forzar re-login.');
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
                // @ts-ignore
                const expiresIn = result._tokenResponse?.oauthExpiresIn ? parseInt(result._tokenResponse.oauthExpiresIn) : 3600;

                if (token) {
                    saveTokenToStorage(token, expiresIn);
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
        const token = await getGoogleAccessToken({ silent: true });
        if (token) return token;
        return await getGoogleAccessToken({ silent: false });
    };

  // 🟢 SI ES RUTA PÚBLICA, DEJAR RENDERIZAR SIN CORTAR POR CARGA
  if (loading && !publicRoutes.includes(pathname) && !pathname.startsWith('/public')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!loading && (user || publicRoutes.includes(pathname) || pathname.startsWith('/public'))) {
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
