

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
  hasGoogleAccessToken: () => Promise<boolean>;
  initiateGoogleSignIn: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
  isBoss: false,
  getGoogleAccessToken: async () => null,
  hasGoogleAccessToken: async () => false,
  initiateGoogleSignIn: () => {},
});

const publicRoutes = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(true);
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
                
                const intendedUrl = sessionStorage.getItem('redirect_url') || '/';
                sessionStorage.removeItem('redirect_url');
                // No redirect here, let the onAuthStateChanged handle it
            }
        } catch (error: any) {
            toast({
                title: 'Error con Google Sign-In',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsProcessingRedirect(false);
        }
    };
    
    handleRedirectResult();

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
  }, [router, toast]);

  useEffect(() => {
    const isPublicRoute = publicRoutes.includes(pathname);
    // Wait until redirect processing is done and auth state is loaded
    if (!loading && !isProcessingRedirect) {
      if (!user && !isPublicRoute) {
        router.push('/login');
      } else if (user && isPublicRoute) {
        router.push('/');
      }
    }
  }, [user, loading, isProcessingRedirect, pathname, router]);

    const getGoogleAccessToken = async (): Promise<string | null> => {
        const storedToken = sessionStorage.getItem('google-access-token');
        if (storedToken) {
            return storedToken;
        }
        return null;
    };
    
    const hasGoogleAccessToken = async (): Promise<boolean> => {
        return !!sessionStorage.getItem('google-access-token');
    };

    const initiateGoogleSignIn = useCallback(() => {
        if (user) {
            const provider = new GoogleAuthProvider();
            provider.addScope('https://www.googleapis.com/auth/calendar');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            sessionStorage.setItem('redirect_url', window.location.pathname);
            signInWithRedirect(auth, provider);
        } else {
            // Handle case where user is not logged in when initiating sign-in
            const provider = new GoogleAuthProvider();
            provider.addScope('https://www.googleapis.com/auth/calendar');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            signInWithRedirect(auth, provider);
        }
    }, [user]);


  const isLoading = loading || isProcessingRedirect;
  const isPublicRoute = publicRoutes.includes(pathname);

  if (isLoading && !isPublicRoute) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!isLoading && (user || isPublicRoute)) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading: isLoading, isBoss, getGoogleAccessToken, hasGoogleAccessToken, initiateGoogleSignIn }}>
        {children}
      </AuthContext.Provider>
    );
  }
  
  if(isPublicRoute){
       return (
         <AuthContext.Provider value={{ user, userInfo, loading: isLoading, isBoss, getGoogleAccessToken, hasGoogleAccessToken, initiateGoogleSignIn }}>
            {children}
         </AuthContext.Provider>
       )
  }

  return (
    <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);

