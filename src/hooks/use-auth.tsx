
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { useToast } from './use-toast';

interface AuthContextType {
  user: FirebaseUser | null;
  userInfo: User | null;
  loading: boolean;
  isBoss: boolean;
  getGoogleAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
  isBoss: false,
  getGoogleAccessToken: async () => null,
});

const publicRoutes = ['/login', '/register'];

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
    if (loading) return;

    const isPublicRoute = publicRoutes.includes(pathname);
    
    if (!user && !isPublicRoute) {
      router.push('/login');
    } else if (user && isPublicRoute) {
      router.push('/');
    }
  }, [user, loading, pathname, router]);

  const getGoogleAccessToken = async (): Promise<string | null> => {
      const storedToken = sessionStorage.getItem('google-calendar-token');
      if (storedToken) {
          return storedToken;
      }
      
      if (!user) {
        toast({title: 'Debes iniciar sesión', description: 'Por favor, inicia sesión para conectar con Google.', variant: 'destructive'});
        return null;
      }

      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      try {
          const result = await signInWithPopup(auth, provider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const token = credential?.accessToken;
          if (token) {
              sessionStorage.setItem('google-calendar-token', token);
              return token;
          }
          return null;
      } catch (error: any) {
          if (error.code !== 'auth/popup-closed-by-user') {
            console.error("Error getting Google access token:", error);
            toast({title: 'Error de autenticación con Google', description: 'No se pudo obtener el permiso para acceder a los servicios de Google.', variant: 'destructive'});
          }
          return null;
      }
  };


  if (loading) {
     if (!publicRoutes.includes(pathname)) {
       return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="large" />
        </div>
      );
     }
  }

  return (
    <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
