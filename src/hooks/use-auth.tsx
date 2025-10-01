
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
  const [isLoading, setIsLoading] = useState(true);
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
    // This effect runs only once on mount to handle the redirect and set up the listener.
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

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // First, handle the redirect result if it exists.
      // This is crucial to ensure the user session is established before any routing decisions.
      if (!auth.currentUser) {
        await processRedirect();
      }
      
      // Now, onAuthStateChanged will fire again with the user object if the sign-in was successful.
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          setUserInfo({ id: firebaseUser.uid, ...profile, initials });
        }
      } else {
        setUser(null);
        setUserInfo(null);
      }
      
      // Only set loading to false after all auth state processing is done.
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);


  useEffect(() => {
    // This effect handles routing after the loading state is resolved.
    if (isLoading) return;

    const isPublic = publicRoutes.includes(pathname);

    if (user && isPublic) {
      router.push('/');
    } else if (!user && !isPublic) {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // If we are on a public route, we can render the children without a logged-in user.
  const isPublicRoute = publicRoutes.includes(pathname);
  if (isPublicRoute) {
     return (
       <AuthContext.Provider value={{ user, userInfo, loading: isLoading, isBoss, getGoogleAccessToken, initiateGoogleSignIn }}>
         {children}
       </AuthContext.Provider>
     )
  }

  // For private routes, only render children if the user is logged in.
  // Otherwise, the effect above will handle the redirect.
  return (
    <AuthContext.Provider value={{ user, userInfo, loading: isLoading, isBoss, getGoogleAccessToken, initiateGoogleSignIn }}>
      {user ? children :  <div className="flex h-screen items-center justify-center"><Spinner size="large" /></div>}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
