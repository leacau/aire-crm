import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getClients } from '../lib/api';
import type { Client } from '../lib/types';
import { ClientDetailScreen } from './ClientDetailScreen';
import { LoadingScreen } from './LoadingScreen';

export function ClientsScreen() {
  const { bootstrap, firebaseUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const loadClients = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getClients(firebaseUser);
    setClients(response.clients);
  }, [firebaseUser]);

  useEffect(() => {
    if (bootstrap?.clients) {
      setClients(bootstrap.clients);
      setLoading(false);
      return;
    }

    loadClients().catch(error => {
      Alert.alert('No se pudieron cargar clientes', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [bootstrap?.clients, loadClients]);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter(client => (
      client.denominacion?.toLowerCase().includes(normalized)
      || client.razonSocial?.toLowerCase().includes(normalized)
      || client.ownerName?.toLowerCase().includes(normalized)
    ));
  }, [clients, query]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadClients();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando clientes..." />;

  if (selectedClient) {
    return (
      <ClientDetailScreen
        clientId={selectedClient.id}
        initialClient={selectedClient}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={filteredClients}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={styles.title}>Clientes</Text>
          <Text style={styles.subtitle}>{filteredClients.length} visibles segun permisos.</Text>
          <TextInput
            placeholder="Buscar cliente"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay clientes para mostrar.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => setSelectedClient(item)} style={styles.card}>
          <Text style={styles.name}>{item.denominacion || item.razonSocial}</Text>
          <Text style={styles.meta}>Asesor: {item.ownerName || '-'}</Text>
          <Text style={styles.meta}>{[item.localidad, item.provincia].filter(Boolean).join(', ') || 'Sin ubicacion'}</Text>
          {!!item.phone && <Text style={styles.meta}>Tel: {item.phone}</Text>}
          <Text style={styles.openHint}>Ver detalle</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 18,
    gap: 12,
  },
  header: {
    gap: 10,
    marginBottom: 4,
  },
  title: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
  },
  search: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 36,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 5,
  },
  name: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: '#64748b',
    fontSize: 13,
  },
  openHint: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 5,
  },
});
