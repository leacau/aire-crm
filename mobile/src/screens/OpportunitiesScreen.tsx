import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getOpportunities } from '../lib/api';
import type { Client, Opportunity } from '../lib/types';
import { ClientDetailScreen } from './ClientDetailScreen';
import { LoadingScreen } from './LoadingScreen';
import { OpportunityDetailScreen } from './OpportunityDetailScreen';

type OpportunityFilter = 'all' | 'active' | 'high' | 'proposal' | 'negotiation' | 'review' | 'won' | 'lost';

const opportunityFilters: Array<{ id: OpportunityFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'active', label: 'Activas' },
  { id: 'high', label: 'Alta' },
  { id: 'proposal', label: 'Propuesta' },
  { id: 'negotiation', label: 'Negociacion' },
  { id: 'review', label: 'A aprobar' },
  { id: 'won', label: 'Ganadas' },
  { id: 'lost', label: 'Perdidas' },
];

function formatCurrency(value?: number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('es-AR');
}

function getStageStyle(stage: string) {
  if (stage.includes('Ganado')) return styles.stageWon;
  if (stage.includes('Perdido')) return styles.stageLost;
  if (stage.includes('Aprobar')) return styles.stageReview;
  if (stage.includes('Propuesta') || stage.includes('Negoci')) return styles.stageActive;
  return styles.stageNeutral;
}

function matchesStageFilter(opportunity: Opportunity, filter: OpportunityFilter) {
  const stage = opportunity.stage || '';

  if (filter === 'all') return true;
  if (filter === 'high') return Boolean(opportunity.highCloseProbability);
  if (filter === 'active') return !stage.includes('Cerrado') && !stage.includes('Perdido');
  if (filter === 'proposal') return stage.includes('Propuesta');
  if (filter === 'negotiation') return stage.includes('Negoci') && !stage.includes('Aprobar');
  if (filter === 'review') return stage.includes('Aprobar');
  if (filter === 'won') return stage.includes('Ganado');
  if (filter === 'lost') return stage.includes('Perdido');

  return true;
}

export function OpportunitiesScreen() {
  const { bootstrap, firebaseUser } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<OpportunityFilter>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const loadOpportunities = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getOpportunities(firebaseUser);
    setOpportunities(response.opportunities);
  }, [firebaseUser]);

  useEffect(() => {
    if (bootstrap?.opportunities) {
      setOpportunities(bootstrap.opportunities);
      setLoading(false);
      return;
    }

    loadOpportunities().catch(error => {
      Alert.alert('No se pudieron cargar oportunidades', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [bootstrap?.opportunities, loadOpportunities]);

  const filteredOpportunities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return opportunities
      .filter(opportunity => matchesStageFilter(opportunity, stageFilter))
      .filter(opportunity => (
        !normalized
        || opportunity.title?.toLowerCase().includes(normalized)
        || opportunity.clientName?.toLowerCase().includes(normalized)
        || opportunity.stage?.toLowerCase().includes(normalized)
      ));
  }, [opportunities, query, stageFilter]);

  const filterTotals = useMemo(() => {
    return opportunityFilters.reduce((acc, item) => {
      acc[item.id] = opportunities.filter(opportunity => matchesStageFilter(opportunity, item.id)).length;
      return acc;
    }, {} as Record<OpportunityFilter, number>);
  }, [opportunities]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadOpportunities();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando oportunidades..." />;

  if (selectedClient) {
    return (
      <ClientDetailScreen
        clientId={selectedClient.id}
        initialClient={selectedClient}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  if (selectedOpportunity) {
    return (
      <OpportunityDetailScreen
        opportunityId={selectedOpportunity.id}
        initialOpportunity={selectedOpportunity}
        onBack={() => setSelectedOpportunity(null)}
        onOpenClient={setSelectedClient}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={filteredOpportunities}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={styles.title}>Oportunidades</Text>
          <Text style={styles.subtitle}>{filteredOpportunities.length} oportunidades segun filtros y permisos.</Text>
          <TextInput
            placeholder="Buscar oportunidad"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {opportunityFilters.map(filter => (
              <Pressable
                key={filter.id}
                onPress={() => setStageFilter(filter.id)}
                style={[styles.filterChip, stageFilter === filter.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, stageFilter === filter.id && styles.filterChipTextActive]}>
                  {filter.label} {filterTotals[filter.id] ?? 0}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay oportunidades para mostrar.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => setSelectedOpportunity(item)} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.name}>{item.title || 'Oportunidad'}</Text>
            {item.highCloseProbability && <Text style={styles.hotBadge}>Alta</Text>}
          </View>
          <Text style={styles.client}>{item.clientName || 'Cliente sin nombre'}</Text>
          <View style={styles.row}>
            <Text style={[styles.stage, getStageStyle(item.stage)]}>{item.stage}</Text>
            <Text style={styles.amount}>{formatCurrency(item.value)}</Text>
          </View>
          <View style={styles.metaGrid}>
            <Text style={styles.meta}>Cierre: {formatDate(item.closeDate)}</Text>
            {!!item.startDate && <Text style={styles.meta}>Inicio: {formatDate(item.startDate)}</Text>}
            {!!item.endDate && <Text style={styles.meta}>Fin: {formatDate(item.endDate)}</Text>}
          </View>
          {!!item.followUpCurrent && <Text style={styles.note}>Actual: {item.followUpCurrent}</Text>}
          {!!item.followUpNext && <Text style={styles.note}>Proximo: {item.followUpNext}</Text>}
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
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  hotBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  client: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stage: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
  },
  stageNeutral: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
  },
  stageActive: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  stageReview: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  stageWon: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  stageLost: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  amount: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  metaGrid: {
    gap: 3,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
  },
  note: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  openHint: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
});
