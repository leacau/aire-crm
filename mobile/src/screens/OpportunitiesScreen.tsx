import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getOpportunities } from '../lib/api';
import type { Opportunity } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

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

export function OpportunitiesScreen() {
  const { bootstrap, firebaseUser } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    if (!normalized) return opportunities;
    return opportunities.filter(opportunity => (
      opportunity.title?.toLowerCase().includes(normalized)
      || opportunity.clientName?.toLowerCase().includes(normalized)
      || opportunity.stage?.toLowerCase().includes(normalized)
    ));
  }, [opportunities, query]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadOpportunities();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando oportunidades..." />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={filteredOpportunities}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={styles.title}>Oportunidades</Text>
          <Text style={styles.subtitle}>{filteredOpportunities.length} activas segun permisos.</Text>
          <TextInput
            placeholder="Buscar oportunidad"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay oportunidades para mostrar.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
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
        </View>
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
});
