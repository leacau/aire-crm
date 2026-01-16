'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { validateGoogleServicesAccess } from '@/lib/google-service-check';
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

// Definimos las rutas que no requieren autenticación
const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service'];

// Claves para LocalStorage
const STORAGE_TOKEN_KEY = 'google_api_token';
const STORAGE_EXPIRY_KEY = 'google_api_token_expiry';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [isBoss, setIsBoss] = useState(false);

  // Helper para guardar token con expiración (1 hora menos un buffer de seguridad)
  const saveTokenToStorage = (token: string, expiresInSeconds: number = 3600) => {
    if (typeof window === 'undefined') return;
    // Buffer de 5 minutos antes de que expire realmente para renovar antes
    const expiryTime = Date.now() + (expiresInSeconds * 1000) - (5 * 60 * 1000); 
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_EXPIRY_KEY, expiryTime.toString());
  };

  // Helper para recuperar el token solo si es válido
  const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const expiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

    if (!token || !expiry) return null;

    if (Date.now() > parseInt(expiry, 10)) {
        // El token ha expirado, lo limpiamos
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_EXPIRY_KEY);
        return null;
    }
    return token;
  };

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
        
        // Limpieza de seguridad al cerrar sesión
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_TOKEN_KEY);
            localStorage.removeItem(STORAGE_EXPIRY_KEY);
            sessionStorage.removeItem('google-access-validated');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Protección de rutas
  useEffect(() => {
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname);
      
      if (!user && !isPublicRoute) {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  // Validación silenciosa en segundo plano
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
        } catch (error) {
          console.warn('Silent validation failed.', error);
        }
      }
    };

    runCheck();
  }, [loading, user]);

    const getGoogleAccessToken = async (options?: { silent?: boolean }): Promise<string | null> => {
        if (typeof window === 'undefined') return null;

        // 1. Intentar recuperar token válido de localStorage (Rápido y persistente)
        const storedToken = getStoredToken();
        if (storedToken) return storedToken;

        // 2. Si se pide silencio y no hay token válido, retornamos null sin molestar
        if (options?.silent) return null;

        // 3. Si no hay token válido y el usuario está logueado, intentamos obtener uno nuevo
        // Esto abrirá el popup si es necesario.
        if (auth.currentUser) {
            const provider = new GoogleAuthProvider();
            // Prompt 'consent' fuerza la renovación del refresh token si es posible, 
            // aunque para access token puro 'select_account' es más fluido.
            provider.setCustomParameters({
                  prompt: 'consent select_account',
                  access_type: 'offline'
              });
            
            // Scopes necesarios para todas las herramientas
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            provider.addScope('https://www.googleapis.com/auth/drive.file');
            provider.addScope('https://www.googleapis.com/auth/chat.messages');
            provider.addScope('https://www.googleapis.com/auth/chat.spaces.readonly');
            
            try {
                const result = await signInWithPopup(auth, provider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                
                // Intentamos leer la expiración de la respuesta de Firebase (no siempre disponible standard, fallback 1h)
                // @ts-ignore - _tokenResponse es una propiedad interna útil
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
        // Primero intenta obtener el token almacenado
        const token = await getGoogleAccessToken({ silent: true });
        if (token) return token;
        
        // Si no hay token válido (expiró o no existe), forzamos la obtención (puede abrir popup)
        return await getGoogleAccessToken({ silent: false });
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
