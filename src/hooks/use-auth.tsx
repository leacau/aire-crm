
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
    const processRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const token = credential?.accessToken;
          if (token) {
            sessionStorage.setItem('google-access-token', token);
          }
          const userProfile = await getUserProfile(result.user.uid);
          if (!userProfile) {
            await createUserProfile(result.user.uid, result.user.displayName || 'Usuario de Google', result.user.email || '');
          }
           // On successful redirect, force navigation to home
          router.replace('/');
        }
      } catch (error: any) {
        console.error("Google Sign-In Error:", error);
        toast({
          title: 'Error con Google Sign-In',
          description: `Code: ${error.code}, Message: ${error.message}`,
          variant: 'destructive',
        });
      } finally {
        setIsProcessingRedirect(false);
      }
    };
    processRedirect();
  }, [router, toast]);

  useEffect(() => {
    if (isProcessingRedirect) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          setUserInfo({ id: firebaseUser.uid, ...profile, initials });
        }
        if (publicRoutes.includes(pathname)) {
            router.replace('/');
        }
      } else {
        setUser(null);
        setUserInfo(null);
        if (!publicRoutes.includes(pathname)) {
            router.replace('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isProcessingRedirect, pathname, router]);

  if (loading || isProcessingRedirect) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  return (
    <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken, initiateGoogleSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
