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
import { getAdvertisingOrderDetail, getAdvertisingOrders } from '../lib/api';
import type {
  ApprovalHistoryItem,
  ApprovalStatus,
  MobileAdvertisingBillingRequest,
  MobileAdvertisingOrderDetail,
  MobileAdvertisingOrderSummary,
} from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

type AdvertisingOrdersScreenProps = {
  clientId?: string;
  opportunityId?: string;
  title?: string;
  onBack?: () => void;
};

type StatusFilter = 'all' | ApprovalStatus;

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'Pendiente', label: 'Pend.' },
  { id: 'Aprobado', label: 'Aprob.' },
  { id: 'Devuelto', label: 'Dev.' },
  { id: 'Pendiente de Modificación', label: 'Mod.' },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('es-AR');
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusStyle(status: ApprovalStatus) {
  if (status === 'Aprobado') return styles.statusApproved;
  if (status === 'Devuelto') return styles.statusReturned;
  if (status === 'Borrador') return styles.statusDraft;
  if (status === 'Pendiente de Modificación') return styles.statusRevision;
  return styles.statusPending;
}

function billingCompanyLabel(company: 'srl' | 'sas' | 'avion') {
  if (company === 'srl') return 'SRL';
  if (company === 'sas') return 'SAS';
  return 'Avion';
}

async function openUrl(url: string, errorMessage: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('No se pudo abrir', errorMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir', errorMessage);
  }
}

async function openOrderInWeb(orderId: string) {
  try {
    const baseUrl = requireEnv(env.apiBaseUrl, 'EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
    await openUrl(`${baseUrl}/publicidad/${encodeURIComponent(orderId)}`, 'No se pudo abrir la orden en la web.');
  } catch {
    Alert.alert('No se pudo abrir', 'Verifica EXPO_PUBLIC_API_BASE_URL.');
  }
}

export function AdvertisingOrdersScreen({
  clientId,
  opportunityId,
  title = 'Publicidad',
  onBack,
}: AdvertisingOrdersScreenProps) {
  const { firebaseUser } = useAuth();
  const [orders, setOrders] = useState<MobileAdvertisingOrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<MobileAdvertisingOrderSummary | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getAdvertisingOrders(firebaseUser, {
      clientId,
      opportunityId,
      status: statusFilter,
    });
    setOrders(response.orders || []);
  }, [clientId, firebaseUser, opportunityId, statusFilter]);

  useEffect(() => {
    loadOrders().catch(error => {
      Alert.alert('No se pudieron cargar ordenes', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadOrders]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orders;

    return orders.filter(order => (
      order.title?.toLowerCase().includes(normalized)
      || order.clientName?.toLowerCase().includes(normalized)
      || order.opportunityTitle?.toLowerCase().includes(normalized)
      || order.accountExecutive?.toLowerCase().includes(normalized)
      || order.status?.toLowerCase().includes(normalized)
    ));
  }, [orders, query]);

  const approvedCount = useMemo(
    () => orders.filter(order => order.status === 'Aprobado').length,
    [orders],
  );

  if (selectedOrder) {
    return (
      <AdvertisingOrderDetail
        initialOrder={selectedOrder}
        orderId={selectedOrder.id}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  if (loading) return <LoadingScreen label="Cargando publicidad..." />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={visibleOrders}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          {!!onBack && (
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          )}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {orders.length} ordenes visibles. {approvedCount} aprobadas.
          </Text>
          <TextInput
            placeholder="Buscar por cliente, producto o asesor"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {statusFilters.map(filter => (
              <Pressable
                key={filter.id}
                onPress={() => setStatusFilter(filter.id)}
                style={[styles.filterChip, statusFilter === filter.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, statusFilter === filter.id && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay ordenes de publicidad para mostrar.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => setSelectedOrder(item)} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="radio-tower" size={22} color="#0f172a" />
            </View>
            <View style={styles.cardTitleGroup}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.meta}>{item.clientName}</Text>
            </View>
            <Text style={[styles.status, getStatusStyle(item.status)]}>{item.status}</Text>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.meta}>Vigencia: {formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
            <Text style={styles.total}>{formatCurrency(item.totalOrder)}</Text>
          </View>
          <Text style={styles.meta}>Asesor: {item.accountExecutive}</Text>
          {!!item.opportunityTitle && <Text style={styles.meta}>Oportunidad: {item.opportunityTitle}</Text>}
          <View style={styles.badges}>
            <Text style={styles.badge}>SRL {item.srlItemCount}</Text>
            <Text style={styles.badge}>SAS {item.sasItemCount}</Text>
            <Text style={styles.badge}>Fact. {item.billingRequestCount}</Text>
            {item.hasMaterial && <Text style={styles.badge}>Material</Text>}
          </View>
        </Pressable>
      )}
    />
  );
}

function AdvertisingOrderDetail({
  orderId,
  initialOrder,
  onBack,
}: {
  orderId: string;
  initialOrder: MobileAdvertisingOrderSummary;
  onBack: () => void;
}) {
  const { firebaseUser } = useAuth();
  const [order, setOrder] = useState<MobileAdvertisingOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getAdvertisingOrderDetail(firebaseUser, orderId);
    setOrder(response.order);
  }, [firebaseUser, orderId]);

  useEffect(() => {
    loadDetail().catch(error => {
      Alert.alert('No se pudo cargar la orden', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadDetail]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadDetail();
    } finally {
      setRefreshing(false);
    }
  };

  const viewOrder = order || initialOrder;

  if (loading && !order) return <LoadingScreen label="Cargando orden..." />;

  return (
    <ScrollView
      contentContainerStyle={styles.detailContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Volver a publicidad</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.kicker}>Orden de publicidad</Text>
        <Text style={styles.detailTitle}>{viewOrder.title}</Text>
        <Text style={styles.detailSubtitle}>{viewOrder.clientName}</Text>
        <View style={styles.heroBadges}>
          <Text style={[styles.status, getStatusStyle(viewOrder.status)]}>{viewOrder.status}</Text>
          <Text style={styles.totalBadge}>{formatCurrency(viewOrder.totalOrder)}</Text>
        </View>
      </View>

      <Pressable onPress={() => openOrderInWeb(orderId)} style={styles.webButton}>
        <MaterialCommunityIcons name="open-in-new" size={18} color="#ffffff" />
        <Text style={styles.webButtonText}>Abrir en web</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Datos principales</Text>
        <InfoRow label="Asesor" value={viewOrder.accountExecutive} />
        <InfoRow label="Vigencia" value={`${formatDate(viewOrder.startDate)} - ${formatDate(viewOrder.endDate)}`} />
        <InfoRow label="Oportunidad" value={viewOrder.opportunityTitle} />
        <InfoRow label="Evento" value={viewOrder.event} />
        {!!order?.agencyName && <InfoRow label="Agencia" value={order.agencyName} />}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Totales</Text>
        <InfoRow label="SRL" value={formatCurrency(viewOrder.totalSrl)} />
        <InfoRow label="SAS" value={formatCurrency(viewOrder.totalSas)} />
        <InfoRow label="Total orden" value={formatCurrency(viewOrder.totalOrder)} />
      </View>

      {!!order?.srlItems.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pauta SRL</Text>
          {order.srlItems.map((item, index) => (
            <View key={`${item.programId}-${index}`} style={styles.compactItem}>
              <Text style={styles.itemTitle}>{item.type}</Text>
              <Text style={styles.meta}>
                {[item.month, item.programName || item.programId, item.seconds ? `${item.seconds}s` : '', `${item.repetitions} rep.`].filter(Boolean).join(' - ')}
              </Text>
              {!!item.unitRate && <Text style={styles.meta}>Tarifa: {formatCurrency(item.unitRate)}</Text>}
            </View>
          ))}
        </View>
      )}

      {!!order?.sasItems.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pauta SAS</Text>
          {order.sasItems.map((item, index) => (
            <View key={`${item.type}-${index}`} style={styles.compactItem}>
              <Text style={styles.itemTitle}>{item.type}</Text>
              <Text style={styles.meta}>{[item.month, item.format].filter(Boolean).join(' - ') || 'SAS'}</Text>
              {!!item.detail && <Text style={styles.itemText}>{item.detail}</Text>}
              {!!item.unitRate && <Text style={styles.meta}>Tarifa: {formatCurrency(item.unitRate)}</Text>}
            </View>
          ))}
        </View>
      )}

      {!!order && (
        <BillingRequestsCard
          title="Datos de facturacion"
          groups={order.billingRequests}
        />
      )}

      {!!order?.materialUrls.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Material</Text>
          {order.materialUrls.map((url, index) => (
            <Pressable
              key={`${url}-${index}`}
              onPress={() => openUrl(url, 'No se pudo abrir el material.')}
              style={styles.linkButton}
            >
              <MaterialCommunityIcons name="link-variant" size={18} color="#2563eb" />
              <Text style={styles.linkText}>Abrir material {index + 1}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!order?.observations && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Observaciones</Text>
          <Text style={styles.itemText}>{order.observations}</Text>
        </View>
      )}

      {!!order?.adminComments && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Comentario de administracion</Text>
          <Text style={styles.itemText}>{order.adminComments}</Text>
        </View>
      )}

      {!!order?.approvalHistory.length && (
        <ApprovalHistoryCard history={order.approvalHistory} />
      )}
    </ScrollView>
  );
}

function BillingRequestsCard({
  title,
  groups,
}: {
  title: string;
  groups: MobileAdvertisingOrderDetail['billingRequests'];
}) {
  const entries = [
    ...groups.srl.map(item => ({ company: 'srl' as const, item })),
    ...groups.sas.map(item => ({ company: 'sas' as const, item })),
    ...groups.avion.map(item => ({ company: 'avion' as const, item })),
  ];

  if (entries.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {entries.map(({ company, item }, index) => (
        <BillingRequestRow key={`${company}-${index}`} company={company} item={item} />
      ))}
    </View>
  );
}

function BillingRequestRow({
  company,
  item,
}: {
  company: 'srl' | 'sas' | 'avion';
  item: MobileAdvertisingBillingRequest;
}) {
  return (
    <View style={styles.compactItem}>
      <View style={styles.rowBetween}>
        <Text style={styles.itemTitle}>{billingCompanyLabel(company)} - {formatDate(item.date)}</Text>
        <Text style={styles.total}>{formatCurrency(item.amount)}</Text>
      </View>
      <Text style={styles.meta}>
        Bruto {formatCurrency(item.grossAmount)} - Desajuste {formatCurrency(item.adjustment)}
      </Text>
      <Text style={styles.meta}>
        {item.paymentType || 'Se paga'}{item.canjeDescription ? `: ${item.canjeDescription}` : ''}
      </Text>
    </View>
  );
}

function ApprovalHistoryCard({ history }: { history: ApprovalHistoryItem[] }) {
  const sortedHistory = [...history].sort((a, b) => (
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ));

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Historial de aprobacion</Text>
      {sortedHistory.map((item, index) => (
        <View key={`${item.timestamp}-${index}`} style={styles.compactItem}>
          <View style={styles.rowBetween}>
            <Text style={styles.itemTitle}>{item.status}</Text>
            <Text style={styles.meta}>{formatDateTime(item.timestamp)}</Text>
          </View>
          <Text style={styles.meta}>
            {item.userName || 'Usuario'}{item.userRole ? ` - ${item.userRole}` : ''}
          </Text>
          {!!item.comments && <Text style={styles.itemText}>{item.comments}</Text>}
        </View>
      ))}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '-'}</Text>
    </View>
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
  filters: {
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
    gap: 9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
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
    fontSize: 16,
    fontWeight: '900',
  },
  detailTitle: {
    color: '#0f172a',
    fontSize: 25,
    fontWeight: '900',
  },
  detailSubtitle: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  total: {
    color: '#0f172a',
    fontWeight: '900',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  statusRevision: {
    backgroundColor: '#ffedd5',
    color: '#9a3412',
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
  detailContent: {
    padding: 18,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  hero: {
    gap: 7,
  },
  kicker: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  totalBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
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
  infoRow: {
    gap: 3,
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  compactItem: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 9,
    gap: 4,
  },
  itemTitle: {
    flex: 1,
    color: '#0f172a',
    fontWeight: '900',
  },
  itemText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 12,
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '900',
  },
});
