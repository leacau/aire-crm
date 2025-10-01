
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
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const isBoss = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia';

  const getGoogleAccessToken = useCallback(async (): Promise<string | null> => {
    return sessionStorage.getItem('google-access-token');
  }, []);

  const initiateGoogleSignIn = useCallback(() => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    signInWithRedirect(auth, provider);
  }, []);

  useEffect(() => {
    // This effect runs only once on mount to handle the redirect result.
    const processRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // This means a sign-in redirect has just completed.
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const token = credential?.accessToken;
          if (token) {
            sessionStorage.setItem('google-access-token', token);
          }
          const userProfile = await getUserProfile(result.user.uid);
          if (!userProfile) {
            await createUserProfile(result.user.uid, result.user.displayName || 'Usuario de Google', result.user.email || '');
          }
        }
      } catch (error: any) {
        console.error("Google Sign-In Error:", error);
        toast({
          title: 'Error con Google Sign-In',
          description: `Code: ${error.code}, Message: ${error.message}`,
          variant: 'destructive',
        });
      } finally {
        // Signal that redirect processing is done.
        setIsProcessingRedirect(false);
      }
    };
    processRedirect();
  }, [toast]);

  useEffect(() => {
    // This effect runs after the redirect processing is finished.
    if (isProcessingRedirect) {
      return; // Wait until getRedirectResult is done.
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          setUserInfo({ id: firebaseUser.uid, ...profile, initials });
        }
        if (publicRoutes.includes(pathname)) {
            router.push('/');
        }
      } else {
        setUser(null);
        setUserInfo(null);
        if (!publicRoutes.includes(pathname)) {
            router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isProcessingRedirect, pathname, router]);

  // Show a spinner while initial auth state is loading or redirect is processing
  if (loading || isProcessingRedirect) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  // If we are on a public route, or if we have a user, render children
  // The effect above will handle redirecting unauthenticated users away from private routes.
  if (publicRoutes.includes(pathname) || user) {
     return (
       <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken, initiateGoogleSignIn }}>
         {children}
       </AuthContext.Provider>
     )
  }

  // Fallback spinner for private routes while redirecting
  return (
    <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
