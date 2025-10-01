

'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, getRedirectResult, signInWithRedirect } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { createUserProfile, getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { useToast } from './use-toast';

interface AuthContextType {
  user: FirebaseUser | null;
  userInfo: User | null;
  loading: boolean;
  isBoss: boolean;
  getGoogleAccessToken: () => Promise<string | null>;
  initiateGoogleSignIn: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
  isBoss: false,
  getGoogleAccessToken: async () => null,
  initiateGoogleSignIn: () => {},
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
    const handleRedirectResult = async () => {
        try {
            const result = await getRedirectResult(auth);
            if (result) {
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                const user = result.user;

                if (token) {
                    sessionStorage.setItem('google-access-token', token);
                }

                const userProfile = await getUserProfile(user.uid);
                if (!userProfile) {
                    await createUserProfile(user.uid, user.displayName || 'Usuario de Google', user.email || '');
                }
            }
        } catch (error: any) {
            console.error("Google Sign-In Error:", error);
            toast({
                title: 'Error con Google Sign-In',
                description: `Code: ${error.code}, Message: ${error.message}`,
                variant: 'destructive',
            });
        }
    };
    
    handleRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
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
        }
        
        const isPublic = publicRoutes.includes(pathname);
        if (isPublic) {
            router.push('/');
        }

      } else {
        setUser(null);
        setUserInfo(null);
        setIsBoss(false);
        const isPublic = publicRoutes.includes(pathname);
        if (!isPublic) {
            router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, toast, pathname]);

    const getGoogleAccessToken = async (): Promise<string | null> => {
        const storedToken = sessionStorage.getItem('google-access-token');
        if (storedToken) {
            return storedToken;
        }
        return null;
    };

    const initiateGoogleSignIn = useCallback(() => {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar');
        provider.addScope('https://www.googleapis.com/auth/gmail.send');
        signInWithRedirect(auth, provider);
    }, []);


  const isPublicRoute = publicRoutes.includes(pathname);

  if (loading && !isPublicRoute) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  if (!loading && !user && !isPublicRoute) {
      return (
         <div className="flex h-screen items-center justify-center">
            <Spinner size="large" />
         </div>
      )
  }

  return (
    <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken, initiateGoogleSignIn }}>
        {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
