

'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { getUserProfile, getAreaPermissions } from '@/lib/firebase-service';
import type { User, ScreenName, ScreenPermission } from '@/lib/types';
import { hasManagementPrivileges } from '@/lib/role-utils';

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

const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const [isBoss, setIsBoss] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profile = await getUserProfile(firebaseUser.uid);
        
        if (profile) {
          const areaPermissions = await getAreaPermissions();
          const finalPermissions: Partial<Record<ScreenName, ScreenPermission>> = 
            (profile.area && areaPermissions[profile.area]) 
            ? { ...areaPermissions[profile.area], ...profile.permissions } 
            : { ...profile.permissions };
            
          const finalProfile: User = { 
            id: firebaseUser.uid, 
            ...profile,
            permissions: finalPermissions,
            photoURL: firebaseUser.photoURL || profile.photoURL,
            initials: profile.name?.substring(0, 2).toUpperCase() || 'U'
          };
          setUserInfo(finalProfile);
          setIsBoss(hasManagementPrivileges(finalProfile));
        } else {
            const name = firebaseUser.displayName || 'Usuario';
            const defaultProfile: User = {
                id: firebaseUser.uid,
                name: name,
                email: firebaseUser.email || '',
                role: 'Asesor' as const,
                photoURL: firebaseUser.photoURL,
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
        let storedToken = sessionStorage.getItem('google-access-token');
        
        // This is a simple check. A robust solution would check expiration.
        // For this app's use case, re-authenticating on failure is acceptable.
        if (storedToken) return storedToken;

        if (auth.currentUser) {
            const provider = new GoogleAuthProvider();
            // Re-request all necessary scopes to ensure the token is valid for all operations
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            provider.addScope('https://www.googleapis.com/auth/gmail.send');
            provider.addScope('https://www.googleapis.com/auth/drive.file');
            
            try {
                // Re-authenticate to get a fresh token
                const result = await signInWithPopup(auth, provider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                if (token) {
                    sessionStorage.setItem('google-access-token', token);
                    return token;
                }
            } catch (error) {
                console.error("Error getting Google access token:", error);
                // The user may have closed the popup, which is not a critical error.
                return null;
            }
        }
        return null;
    };


  if (loading && !publicRoutes.includes(pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!loading && (user || publicRoutes.includes(pathname))) {
    return (
      <AuthContext.Provider value={{ user, userInfo, loading, isBoss, getGoogleAccessToken }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
        <Spinner size="large" />
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
