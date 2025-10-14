import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

const notificationOptions = [
  'Recordatorios de actividades',
  'Reportes semanales',
  'Alertas de oportunidades críticas'
];

export default function SettingsScreen() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu perfil</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{user.name}</Text>
            <Text style={[styles.label, styles.labelSpacing]}>Correo</Text>
            <Text style={styles.value}>{user.email}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          <View style={styles.card}>
            {notificationOptions.map((option, index) => (
              <Pressable key={option} style={[styles.optionRow, index === notificationOptions.length - 1 && styles.optionRowLast]}>
                <View>
                  <Text style={styles.value}>{option}</Text>
                  <Text style={styles.helperText}>
                    Recibe alertas vía push y correo electrónico.
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 16
  },
  scrollContent: {
    paddingBottom: 32
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  label: {
    fontSize: 13,
    color: '#64748b'
  },
  labelSpacing: {
    marginTop: 16
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a'
  },
  optionRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  optionRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0
  },
  helperText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4
  }
});
