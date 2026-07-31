import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { env, requireEnv } from '../config/env';
import { getApprovals } from '../lib/api';
import type { ApprovalItem, ApprovalStatus } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'returned';

const approvalFilters: Array<{ id: ApprovalFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'returned', label: 'Devueltas' },
];

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isPending(status: ApprovalStatus) {
  return status === 'Pendiente' || status === 'Pendiente de Modificación';
}

function matchesFilter(item: ApprovalItem, filter: ApprovalFilter) {
  if (filter === 'all') return true;
  if (filter === 'pending') return isPending(item.status);
  if (filter === 'approved') return item.status === 'Aprobado';
  if (filter === 'returned') return item.status === 'Devuelto' || item.status === 'Borrador';
  return true;
}

function getStatusStyle(status: ApprovalStatus) {
  if (status === 'Aprobado') return styles.statusApproved;
  if (status === 'Devuelto') return styles.statusReturned;
  if (status === 'Borrador') return styles.statusDraft;
  return styles.statusPending;
}

function getTypeIcon(type: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  if (type === 'Orden de Publicidad') return 'radio-tower';
  if (type === 'Pedido de Redes') return 'share-variant-outline';
  if (type === 'Nota Web / Gacetilla') return 'web';
  return 'file-document-outline';
}

function getApprovalWebPath(item: ApprovalItem) {
  if (item.type === 'Orden de Publicidad') return `/publicidad/${encodeURIComponent(item.id)}`;
  if (item.type === 'Pedido de Redes') return `/redes/${encodeURIComponent(item.id)}`;
  if (item.type === 'Nota Comercial') return `/notas/${encodeURIComponent(item.id)}`;
  if (item.type === 'Nota Web / Gacetilla') return `/notas-web/new?editId=${encodeURIComponent(item.id)}`;
  return '/approvals?tab=pending';
}

async function openWebPath(path: string) {
  try {
    const baseUrl = requireEnv(env.apiBaseUrl, 'EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
    await Linking.openURL(`${baseUrl}${path}`);
  } catch {
    Alert.alert('No se pudo abrir', 'Verifica la URL base de la API.');
  }
}

export function ApprovalsScreen() {
  const { firebaseUser } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [query, setQuery] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadApprovals = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getApprovals(firebaseUser);
    setApprovals(response.approvals || []);
  }, [firebaseUser]);

  useEffect(() => {
    loadApprovals().catch(error => {
      Alert.alert('No se pudieron cargar aprobaciones', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadApprovals]);

  const visibleApprovals = useMemo(() => {
    const normalized = normalizeText(query);
    const sorted = [...approvals].sort((a, b) => {
      const pendingDiff = Number(isPending(b.status)) - Number(isPending(a.status));
      if (pendingDiff !== 0) return pendingDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted
      .filter(item => matchesFilter(item, approvalFilter))
      .filter(item => (
        !normalized
        || normalizeText(item.title).includes(normalized)
        || normalizeText(item.clientName).includes(normalized)
        || normalizeText(item.advisorName).includes(normalized)
        || normalizeText(item.type).includes(normalized)
        || normalizeText(item.status).includes(normalized)
      ));
  }, [approvalFilter, approvals, query]);

  const pendingCount = useMemo(
    () => approvals.filter(item => isPending(item.status)).length,
    [approvals],
  );

  const filterTotals = useMemo(() => {
    return approvalFilters.reduce((acc, filter) => {
      acc[filter.id] = approvals.filter(item => matchesFilter(item, filter.id)).length;
      return acc;
    }, {} as Record<ApprovalFilter, number>);
  }, [approvals]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadApprovals();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando aprobaciones..." />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={visibleApprovals}
      keyExtractor={item => `${item.collectionName}-${item.id}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={styles.title}>Aprobaciones</Text>
          <Text style={styles.subtitle}>{pendingCount} pendientes para revisar.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {approvalFilters.map(filter => (
              <Pressable
                key={filter.id}
                onPress={() => setApprovalFilter(filter.id)}
                style={[styles.filterChip, approvalFilter === filter.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, approvalFilter === filter.id && styles.filterChipTextActive]}>
                  {filter.label} {filterTotals[filter.id] ?? 0}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            placeholder="Buscar por cliente, asesor o tipo"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay aprobaciones para mostrar.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.typeIcon}>
              <MaterialCommunityIcons name={getTypeIcon(item.type)} size={20} color="#0f172a" />
            </View>
            <View style={styles.cardTitleGroup}>
              <Text style={styles.cardTitle}>{item.title || item.type}</Text>
              <Text style={styles.meta}>{item.type} - {formatDate(item.createdAt)}</Text>
            </View>
            <Text style={[styles.status, getStatusStyle(item.status)]}>{item.status}</Text>
          </View>

          <Text style={styles.client}>{item.clientName || 'Cliente'}</Text>
          <Text style={styles.meta}>Asesor: {item.advisorName || '-'}</Text>
          {!!item.adminComments && <Text style={styles.comments}>Comentario: {item.adminComments}</Text>}

          {!!item.approvalHistory?.length && (
            <View style={styles.historyBox}>
              <Text style={styles.historyTitle}>Historial</Text>
              {item.approvalHistory.slice().reverse().slice(0, 3).map((history, index) => (
                <View key={`${history.timestamp}-${index}`} style={styles.historyItem}>
                  <Text style={styles.historyStatus}>{history.status} - {history.userName || 'Usuario'}</Text>
                  <Text style={styles.meta}>{formatDate(history.timestamp)}</Text>
                  {!!history.comments && <Text style={styles.comments}>{history.comments}</Text>}
                </View>
              ))}
            </View>
          )}

          {isPending(item.status) && (
            <Text style={styles.notice}>La aprobacion final envia PDFs y mails desde la web.</Text>
          )}

          <View style={styles.actionsRow}>
            <Pressable onPress={() => openWebPath(getApprovalWebPath(item))} style={styles.secondaryButton}>
              <MaterialCommunityIcons name="file-eye-outline" size={18} color="#0f172a" />
              <Text style={styles.secondaryButtonText}>Ver documento</Text>
            </Pressable>
            {isPending(item.status) && (
              <Pressable onPress={() => openWebPath('/approvals?tab=pending')} style={styles.primaryButton}>
                <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Evaluar</Text>
              </Pressable>
            )}
          </View>
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
    alignItems: 'flex-start',
    gap: 10,
  },
  typeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  cardTitleGroup: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  client: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
  },
  comments: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '800',
  },
  historyBox: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    gap: 6,
  },
  historyTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  historyItem: {
    gap: 2,
  },
  historyStatus: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  status: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusApproved: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusReturned: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  statusDraft: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
  },
});
