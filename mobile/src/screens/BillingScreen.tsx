import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getBillingBootstrap } from '../lib/api';
import type { PaymentEntry } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('es-AR');
}

function getStatusStyle(status: string) {
  if (status === 'Pagado') return styles.statusPaid;
  if (status === 'Incobrable') return styles.statusBad;
  if (status === 'Reclamado') return styles.statusClaimed;
  return styles.statusPending;
}

export function BillingScreen() {
  const { firebaseUser } = useAuth();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBilling = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getBillingBootstrap(firebaseUser);
    setPayments(response.payments || []);
  }, [firebaseUser]);

  useEffect(() => {
    loadBilling().catch(error => {
      Alert.alert('No se pudo cargar Mora', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadBilling]);

  const visiblePayments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pendingFirst = [...payments].sort((a, b) => {
      const statusWeight = (entry: PaymentEntry) => entry.status === 'Pagado' ? 1 : 0;
      const byStatus = statusWeight(a) - statusWeight(b);
      if (byStatus !== 0) return byStatus;
      return (b.daysLate || 0) - (a.daysLate || 0);
    });

    if (!normalized) return pendingFirst;

    return pendingFirst.filter(payment => (
      payment.razonSocial?.toLowerCase().includes(normalized)
      || payment.advisorName?.toLowerCase().includes(normalized)
      || payment.comprobanteNumber?.toLowerCase().includes(normalized)
      || payment.company?.toLowerCase().includes(normalized)
      || payment.status?.toLowerCase().includes(normalized)
    ));
  }, [payments, query]);

  const totals = useMemo(() => {
    return visiblePayments.reduce((acc, payment) => {
      if (payment.status !== 'Pagado') {
        acc.pending += Number(payment.pendingAmount ?? payment.amount ?? 0);
        acc.count += 1;
      }
      return acc;
    }, { pending: 0, count: 0 });
  }, [visiblePayments]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadBilling();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando mora..." />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={visiblePayments}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View style={styles.header}>
          <Text style={styles.title}>Mora</Text>
          <Text style={styles.subtitle}>{totals.count} pendientes · {formatCurrency(totals.pending)}</Text>
          <TextInput
            placeholder="Buscar por cliente, asesor o comprobante"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No hay comprobantes de mora para mostrar.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleGroup}>
              <Text style={styles.client}>{item.razonSocial || 'Cliente sin nombre'}</Text>
              <Text style={styles.meta}>{[item.tipo, item.comprobanteNumber, item.company].filter(Boolean).join(' · ') || 'Sin comprobante'}</Text>
            </View>
            <Text style={[styles.status, getStatusStyle(item.status)]}>{item.status}</Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amount}>{formatCurrency(item.pendingAmount ?? item.amount)}</Text>
            <Text style={styles.days}>{item.daysLate ?? 0} dias</Text>
          </View>

          <View style={styles.detailGrid}>
            <Text style={styles.meta}>Emision: {formatDate(item.issueDate)}</Text>
            <Text style={styles.meta}>Vence: {formatDate(item.dueDate)}</Text>
            <Text style={styles.meta}>Asesor: {item.advisorName || '-'}</Text>
            <Text style={styles.meta}>Prox. contacto: {formatDate(item.nextContactAt)}</Text>
          </View>

          <Text style={styles.note}>Estado: {item.status}{item.notes ? `: ${item.notes}` : ''}</Text>
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
    gap: 9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleGroup: {
    flex: 1,
    gap: 3,
  },
  client: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
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
  statusClaimed: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  statusPaid: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusBad: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  amount: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  days: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '900',
  },
  detailGrid: {
    gap: 3,
  },
  note: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
});
