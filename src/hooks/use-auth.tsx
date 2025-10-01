
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          setUserInfo({ id: firebaseUser.uid, ...profile, initials });
        } else {
          // If no profile exists, create one (e.g., for Google Sign-In first time)
          await createUserProfile(firebaseUser.uid, firebaseUser.displayName || 'Usuario de Google', firebaseUser.email || '');
          const newProfile = await getUserProfile(firebaseUser.uid);
          if (newProfile) {
            const initials = newProfile.name?.substring(0, 2).toUpperCase() || 'U';
            setUserInfo({ id: firebaseUser.uid, ...newProfile, initials });
          }
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
  }, [pathname, router]);
  
  if (loading && !publicRoutes.includes(pathname)) {
     return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // This prevents showing a protected page for a split second before redirecting
  if (!loading && !user && !publicRoutes.includes(pathname)) {
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
