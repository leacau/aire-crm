import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

export default function LoginScreen() {
  const { signIn, isLoading, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');

  if (user) {
    return <Redirect href="/(tabs)/home" />;
  }

  const handleSignIn = async () => {
    try {
      await signIn(email, password);
      router.replace('/(tabs)/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      Alert.alert('No pudimos iniciar sesión', message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Bienvenido a Aire CRM</Text>
        <Text style={styles.subtitle}>
          Ingresa tus credenciales para continuar con el seguimiento de oportunidades.
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            accessibilityLabel="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tu-correo@airecrm.com"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            accessibilityLabel="Contraseña"
            autoCapitalize="none"
            secureTextEntry
            placeholder="Ingresa tu contraseña"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={handleSignIn}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.9 },
            isLoading && { opacity: 0.6 }
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? 'Ingresando...' : 'Entrar'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.footerText}>
        © {new Date().getFullYear()} Aire CRM. Gestiona tus clientes desde cualquier lugar.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    padding: 24
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 24
  },
  fieldGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 6
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a'
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  },
  footerText: {
    marginTop: 24,
    fontSize: 12,
    color: '#475569'
  }
});
