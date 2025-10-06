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
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { getOpportunitiesForUser } from '../../services/firebaseService';
import type { Opportunity } from '../../types';

const currencyFormat = (value: number) => {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(value);
  } catch (error) {
    return `$${value.toLocaleString('es-AR')}`;
  }
};

const OpportunityItem = ({ opportunity }: { opportunity: Opportunity }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{opportunity.title}</Text>
    <Text style={styles.cardSubtitle}>{opportunity.clientName}</Text>
    <View style={styles.row}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{opportunity.stage}</Text>
      </View>
      <Text style={styles.valueText}>{currencyFormat(opportunity.value)}</Text>
    </View>
    {opportunity.closeDate ? (
      <Text style={styles.dateText}>
        Cierre estimado: {format(parseISO(opportunity.closeDate), "d 'de' MMMM", { locale: es })}
      </Text>
    ) : null}
  </View>
);

const OpportunitiesScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const data = await getOpportunitiesForUser(user.uid);
      setOpportunities(data);
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

  const filtered = useMemo(() => {
    if (!search.trim()) return opportunities;
    const term = search.toLowerCase();
    return opportunities.filter(
      opportunity =>
        opportunity.title.toLowerCase().includes(term) ||
        opportunity.clientName.toLowerCase().includes(term)
    );
  }, [opportunities, search]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Oportunidades</Text>
        <TextInput
          placeholder="Buscar oportunidad"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <OpportunityItem opportunity={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No se encontraron oportunidades.</Text>}
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
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
  row: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  badge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: {
    color: '#1d4ed8',
    fontWeight: '600'
  },
  valueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937'
  },
  dateText: {
    marginTop: 8,
    color: '#6b7280'
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16
  }
});

export default OpportunitiesScreen;
