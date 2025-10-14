import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const demoUser: User = {
  id: '1',
  name: 'María González',
  email: 'maria@airecrm.com'
};

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 800));

    if (email.trim().length === 0 || password.trim().length === 0) {
      setIsLoading(false);
      throw new Error('Debes completar tus credenciales.');
    }

    setUser({ ...demoUser, email });
    setIsLoading(false);
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, signIn, signOut, isLoading }),
    [user, signIn, signOut, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }

  return context;
}
