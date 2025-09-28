
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
      if (firebaseUser) {
        setUser(firebaseUser);
        const appUser = users.find(u => u.email === firebaseUser.email);
        setUserInfo(appUser || null);
      } else {
        setUser(null);
        setUserInfo(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // This effect handles redirection logic once authentication state is resolved.
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname);
      
      if (!user && !isPublicRoute) {
        // If no user is logged in and the route is not public, redirect to login.
        router.push('/login');
      } else if (user && isPublicRoute) {
        // If a user is logged in and tries to access a public route, redirect to the dashboard.
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  // While loading, we might want to show a global spinner for protected routes.
  if (loading && !publicRoutes.includes(pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  // If loading is finished, and we are on a route that requires authentication,
  // but we don't have a user, we can render a spinner while the redirect effect kicks in.
  if (!loading && !user && !publicRoutes.includes(pathname)) {
     return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="large" />
        </div>
      );
  }

  // Render children if:
  // 1. Loading is complete and a user is present.
  // 2. We are on a public route.
  if (!loading && (user || publicRoutes.includes(pathname))) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Fallback for any edge cases, though ideally this shouldn't be reached.
  return null;
}

export const useAuth = () => useContext(AuthContext);
