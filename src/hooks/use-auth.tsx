
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';

interface AuthContextType {
  user: FirebaseUser | null;
  userInfo: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
});

const publicRoutes = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        
        if (profile) {
          const initials = profile.name?.substring(0, 2).toUpperCase() || 'U';
          setUserInfo({ 
            id: firebaseUser.uid, 
            ...profile,
            initials
          });
        } else {
            // This case might happen if the user profile creation fails after registration.
            // We'll create a default one to avoid breaking the app.
            const name = firebaseUser.displayName || 'Usuario';
            setUserInfo({
                id: firebaseUser.uid,
                name: name,
                email: firebaseUser.email || '',
                role: 'Asesor',
                initials: name.substring(0, 2).toUpperCase()
            });
        }
      } else {
        setUser(null);
        setUserInfo(null);
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

  if (loading && !publicRoutes.includes(pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!loading && (user || publicRoutes.includes(pathname))) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // This handles the case where !user and !isPublicRoute after loading,
  // which will trigger the useEffect to redirect. Returning null or a spinner here
  // prevents the old page from rendering during the redirect.
  return (
    <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);

    