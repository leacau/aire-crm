import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getClients } from '../lib/api';
import type { Client } from '../lib/types';
import { ClientDetailScreen } from './ClientDetailScreen';
import { LoadingScreen } from './LoadingScreen';

type ClientFilter = 'all' | 'mine' | 'active' | 'inactive';

const clientFilters: Array<{ id: ClientFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Mis clientes' },
  { id: 'active', label: 'Activos' },
  { id: 'inactive', label: 'Baja' },
];

export function ClientsScreen() {
  const { bootstrap, firebaseUser, session } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all');
  const [rubroFilter, setRubroFilter] = useState('all');
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
    return clients
      .filter(client => {
        if (clientFilter === 'mine') return client.ownerId === session?.user.id;
        if (clientFilter === 'active') return !client.isDeactivated;
        if (clientFilter === 'inactive') return Boolean(client.isDeactivated);
        return true;
      })
      .filter(client => rubroFilter === 'all' || (client.rubro || '').toLowerCase() === rubroFilter)
      .filter(client => (
        !normalized
        || client.denominacion?.toLowerCase().includes(normalized)
        || client.razonSocial?.toLowerCase().includes(normalized)
        || client.ownerName?.toLowerCase().includes(normalized)
        || client.rubro?.toLowerCase().includes(normalized)
        || client.cuit?.toLowerCase().includes(normalized)
      ));
  }, [clients, clientFilter, query, rubroFilter, session?.user.id]);

  const filterTotals = useMemo(() => {
    return clientFilters.reduce((acc, filter) => {
      acc[filter.id] = clients.filter(client => {
        if (filter.id === 'mine') return client.ownerId === session?.user.id;
        if (filter.id === 'active') return !client.isDeactivated;
        if (filter.id === 'inactive') return Boolean(client.isDeactivated);
        return true;
      }).length;
      return acc;
    }, {} as Record<ClientFilter, number>);
  }, [clients, session?.user.id]);

  const rubros = useMemo(() => {
    return Array.from(new Set(clients.map(client => client.rubro?.trim()).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12);
  }, [clients]);

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
          <Text style={styles.subtitle}>{filteredClients.length} visibles segun filtros y permisos.</Text>
          <TextInput
            placeholder="Buscar cliente"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {clientFilters.map(filter => (
              <Pressable
                key={filter.id}
                onPress={() => setClientFilter(filter.id)}
                style={[styles.filterChip, clientFilter === filter.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, clientFilter === filter.id && styles.filterChipTextActive]}>
                  {filter.label} {filterTotals[filter.id] ?? 0}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {!!rubros.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                onPress={() => setRubroFilter('all')}
                style={[styles.rubroChip, rubroFilter === 'all' && styles.rubroChipActive]}
              >
                <Text style={[styles.rubroChipText, rubroFilter === 'all' && styles.rubroChipTextActive]}>Todos los rubros</Text>
              </Pressable>
              {rubros.map(rubro => {
                const normalizedRubro = rubro.toLowerCase();
                return (
                  <Pressable
                    key={rubro}
                    onPress={() => setRubroFilter(normalizedRubro)}
                    style={[styles.rubroChip, rubroFilter === normalizedRubro && styles.rubroChipActive]}
                  >
                    <Text style={[styles.rubroChipText, rubroFilter === normalizedRubro && styles.rubroChipTextActive]}>{rubro}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay clientes para mostrar.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => setSelectedClient(item)} style={styles.card}>
          <Text style={styles.name}>{item.denominacion || item.razonSocial}</Text>
          <Text style={styles.meta}>Asesor: {item.ownerName || '-'}</Text>
          <Text style={styles.meta}>{[item.localidad, item.provincia].filter(Boolean).join(', ') || 'Sin ubicacion'}</Text>
          {!!item.rubro && <Text style={styles.meta}>Rubro: {item.rubro}</Text>}
          {!!item.phone && <Text style={styles.meta}>Tel: {item.phone}</Text>}
          {item.isDeactivated && <Text style={styles.inactiveBadge}>Baja</Text>}
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
  filterRow: {
    gap: 8,
    paddingRight: 18,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  filterChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  rubroChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rubroChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  rubroChipText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
  },
  rubroChipTextActive: {
    color: '#ffffff',
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
  inactiveBadge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openHint: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 5,
  },
});
