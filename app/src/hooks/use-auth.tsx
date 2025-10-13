
'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { getUserProfile } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Spinner } from '@/components/ui/spinner';

interface AuthContextType {
  user: FirebaseUser | null;
  userInfo: User | null;
  loading: boolean;
  isBoss: boolean;
  getGoogleAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userInfo: null,
  loading: true,
  isBoss: false,
  getGoogleAccessToken: async () => null,
});

const publicRoutes = ['/login', '/register'];

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const { user, loading } = useAuth();
    const isPublic = publicRoutes.includes(pathname);

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"></div>;
    }

    if (isPublic) {
        return <>{children}</>;
    }

    if (!user) {
        // Redirection is handled in useAuth, but as a fallback, don't render children
        return <div className="flex h-screen w-full items-center justify-center"></div>;
    }

    return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    );
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isBoss = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          const finalProfile = { 
            id: firebaseUser.uid, 
            ...profile,
            photoURL: firebaseUser.photoURL || profile.photoURL,
            initials: profile.name?.substring(0, 2).toUpperCase() || 'U'
          };
          setUserInfo(finalProfile);
        }
        setUser(firebaseUser);
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

  const getGoogleAccessToken = async (): Promise<string | null> => {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    if (auth.currentUser) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar.events');
        provider.addScope('https://www.googleapis.com/auth/gmail.send');
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            return credential?.accessToken || null;
        } catch (error) {
            console.error("Error getting Google access token:", error);
            return null;
        }
    }
    return null;
  };
  
  const value = { user, userInfo, loading, isBoss, getGoogleAccessToken };

  return (
    <AuthContext.Provider value={value}>
        {loading && <div className="flex h-screen w-full items-center justify-center"><Spinner size="large" /></div>}
        {!loading && <AuthLayout>{children}</AuthLayout>}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

