import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AppShell } from './src/screens/AppShell';
import { LoginScreen } from './src/screens/LoginScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';

function Root() {
  const { initializing, session } = useAuth();

  if (initializing) return <LoadingScreen label="Validando sesion..." />;
  return session ? <AppShell /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
