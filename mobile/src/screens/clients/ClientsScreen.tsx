import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { getClientsForUser } from '../../services/firebaseService';
import type { Client } from '../../types';

const ClientItem = ({ client }: { client: Client }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{client.denominacion}</Text>
    {client.localidad && client.provincia ? (
      <Text style={styles.cardSubtitle}>
        {client.localidad}, {client.provincia}
      </Text>
    ) : null}
    {client.email ? <Text style={styles.cardMeta}>{client.email}</Text> : null}
    {client.phone ? <Text style={styles.cardMeta}>{client.phone}</Text> : null}
  </View>
);

const ClientsScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const data = await getClientsForUser(user.uid);
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const term = search.toLowerCase();
    return clients.filter(client => client.denominacion.toLowerCase().includes(term));
  }, [clients, search]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Clientes</Text>
        <TextInput
          placeholder="Buscar cliente"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <ClientItem client={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No se encontraron clientes.</Text>}
          contentContainerStyle={filteredClients.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6'
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 16
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937'
  },
  cardSubtitle: {
    marginTop: 4,
    color: '#6b7280'
  },
  cardMeta: {
    marginTop: 4,
    color: '#9ca3af'
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16
  }
});

export default ClientsScreen;
