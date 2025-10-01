
'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

const publicRoutes = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
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
      <AuthContext.Provider value={{ user, loading }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return null;
}

export const useAuth = () => useContext(AuthContext);
