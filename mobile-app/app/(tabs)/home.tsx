import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Link } from 'expo-router';

const insights = [
  {
    id: 'revenue',
    title: 'Ingresos proyectados',
    value: '$86.4K',
    subtitle: 'Crecimiento del 12% respecto al mes pasado'
  },
  {
    id: 'conversion',
    title: 'Tasa de cierre',
    value: '28%',
    subtitle: 'Necesitas 3 oportunidades para alcanzar la meta'
  },
  {
    id: 'activities',
    title: 'Actividades pendientes',
    value: '9',
    subtitle: 'Llamadas y correos por enviar hoy'
  }
];

const nextActions = [
  {
    id: 'follow-up',
    title: 'Llamar a Inmobiliaria Áurea',
    description: 'Revisión de propuesta plan Enterprise',
    dueAt: 'Hoy 16:00'
  },
  {
    id: 'demo',
    title: 'Demo con Grupo Prisma',
    description: 'Nueva oportunidad asignada por Andrea',
    dueAt: 'Mañana 09:30'
  }
];

export default function HomeScreen() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={nextActions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.greeting}>Hola, {user.name} 👋</Text>
            <Text style={styles.greetingSubtitle}>
              Así se ve tu negocio hoy. Prioricemos las acciones con mayor impacto.
            </Text>
            <View style={styles.insightContainer}>
              {insights.map((insight) => (
                <View key={insight.id} style={styles.insightCard}>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <Text style={styles.insightValue}>{insight.value}</Text>
                  <Text style={styles.insightSubtitle}>{insight.subtitle}</Text>
                </View>
              ))}
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Próximas acciones</Text>
              <Link href="/(tabs)/pipeline" asChild>
                <Pressable>
                  <Text style={styles.linkText}>Ver pipeline completo</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.actionCard}>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionDescription}>{item.description}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.dueAt}</Text>
            </View>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 16
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a'
  },
  greetingSubtitle: {
    fontSize: 15,
    color: '#475569',
    marginTop: 4,
    marginBottom: 16
  },
  insightContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 24
  },
  insightCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginHorizontal: 6,
    marginBottom: 12
  },
  insightTitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12
  },
  insightValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  insightSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginTop: 8
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a'
  },
  linkText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600'
  },
  actionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  actionContent: {
    flexShrink: 1,
    paddingRight: 16
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a'
  },
  actionDescription: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4
  },
  badge: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999
  },
  badgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600'
  }
});
