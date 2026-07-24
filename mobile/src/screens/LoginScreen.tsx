import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { error, loginWithEmail, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const runLogin = async (mode: 'google' | 'email') => {
    setLoading(true);
    try {
      if (mode === 'google') {
        await loginWithGoogle();
      } else {
        await loginWithEmail(email, password);
      }
    } catch (loginError) {
      Alert.alert('No se pudo iniciar sesion', loginError instanceof Error ? loginError.message : 'Revisa tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Aire CRM</Text>
        <Text style={styles.title}>Tu CRM comercial, ahora mobile.</Text>
        <Text style={styles.subtitle}>Acceso privado para cuentas autorizadas de Aire.</Text>
      </View>

      <View style={styles.card}>
        <Pressable disabled={loading} style={styles.primaryButton} onPress={() => runLogin('google')}>
          <Text style={styles.primaryButtonText}>{loading ? 'Ingresando...' : 'Ingresar con Google'}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.label}>Usuario externo</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="email"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder="password"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable disabled={loading || !email || !password} style={styles.secondaryButton} onPress={() => runLogin('email')}>
          <Text style={styles.secondaryButtonText}>Ingresar con email</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    backgroundColor: '#f8fafc',
  },
  hero: {
    gap: 10,
    paddingTop: 32,
  },
  kicker: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 23,
  },
  card: {
    gap: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: '#0f172a',
    fontSize: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f172a',
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
  },
});
