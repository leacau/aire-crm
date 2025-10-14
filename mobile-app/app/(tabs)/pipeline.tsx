import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

const stages = [
  {
    id: 'prospecting',
    title: 'Prospección',
    description: 'Leads cualificados listos para primer contacto',
    amount: '$32.1K',
    deals: 8
  },
  {
    id: 'negotiation',
    title: 'Negociación',
    description: 'Propuestas enviadas en seguimiento activo',
    amount: '$44.3K',
    deals: 5
  },
  {
    id: 'closing',
    title: 'Cierre',
    description: 'Pendiente firma y facturación',
    amount: '$10K',
    deals: 2
  }
];

export default function PipelineScreen() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={stages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.stageCard}>
            <View style={styles.stageHeader}>
              <Text style={styles.stageTitle}>{item.title}</Text>
              <Text style={styles.stageAmount}>{item.amount}</Text>
            </View>
            <Text style={styles.stageDescription}>{item.description}</Text>
            <Text style={styles.stageDeals}>{item.deals} oportunidades activas</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Pipeline comercial</Text>
            <Text style={styles.headerSubtitle}>
              Analiza tus etapas para detectar bloqueos y acelerar cierres.
            </Text>
          </View>
        }
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
  header: {
    marginBottom: 16
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a'
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 15,
    color: '#475569'
  },
  stageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 16
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a'
  },
  stageAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  stageDescription: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 12
  },
  stageDeals: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600'
  }
});
