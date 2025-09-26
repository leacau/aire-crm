
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { users } from '@/lib/data';
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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const appUser = users.find(u => u.email === firebaseUser.email);
        setUserInfo(appUser || null);
      } else {
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

  if (loading) {
    const isPublicRoute = publicRoutes.includes(pathname);
    if (!isPublicRoute) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="large" />
        </div>
      );
    }
  }

  const isPublicRoute = publicRoutes.includes(pathname);
  if (!loading && !user && !isPublicRoute) {
     return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="large" />
        </div>
      );
  }

  if (user || isPublicRoute) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return null;
}

export const useAuth = () => useContext(AuthContext);
