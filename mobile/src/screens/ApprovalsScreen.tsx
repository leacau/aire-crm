import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { env, requireEnv } from '../config/env';
import { getApprovals } from '../lib/api';
import type { ApprovalItem, ApprovalStatus } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

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

function isPending(status: ApprovalStatus) {
  return status === 'Pendiente' || status === 'Pendiente de Modificación';
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

async function openApprovalsWeb() {
  try {
    const baseUrl = requireEnv(env.apiBaseUrl, 'EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
    await Linking.openURL(`${baseUrl}/approvals?tab=pending`);
  } catch {
    Alert.alert('No se pudo abrir', 'Verifica la URL base de la API.');
  }
}

export function ApprovalsScreen() {
  const { firebaseUser } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [query, setQuery] = useState('');
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
    const normalized = query.trim().toLowerCase();
    const sorted = [...approvals].sort((a, b) => {
      const pendingDiff = Number(isPending(b.status)) - Number(isPending(a.status));
      if (pendingDiff !== 0) return pendingDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (!normalized) return sorted;

    return sorted.filter(item => (
      item.title?.toLowerCase().includes(normalized)
      || item.clientName?.toLowerCase().includes(normalized)
      || item.advisorName?.toLowerCase().includes(normalized)
      || item.type?.toLowerCase().includes(normalized)
      || item.status?.toLowerCase().includes(normalized)
    ));
  }, [approvals, query]);

  const pendingCount = useMemo(
    () => approvals.filter(item => isPending(item.status)).length,
    [approvals],
  );

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
          <TextInput
            placeholder="Buscar por cliente, asesor o tipo"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
          <Pressable onPress={openApprovalsWeb} style={styles.webButton}>
            <MaterialCommunityIcons name="open-in-new" size={18} color="#ffffff" />
            <Text style={styles.webButtonText}>Evaluar en web</Text>
          </Pressable>
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
          {isPending(item.status) && (
            <Text style={styles.notice}>Para aprobar/devolver con el circuito completo, abrilo en la web.</Text>
          )}
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
  webButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
  },
  webButtonText: {
    color: '#ffffff',
    fontWeight: '900',
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
