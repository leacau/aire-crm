import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { getBillingBootstrap, updatePaymentEntry } from '../lib/api';
import type { Client, PaymentEntry, PaymentStatus } from '../lib/types';
import { ClientDetailScreen } from './ClientDetailScreen';
import { LoadingScreen } from './LoadingScreen';

const statusOptions: PaymentStatus[] = ['Pendiente', 'Reclamado', 'Pagado', 'Incobrable'];

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

function normalizeText(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function BillingScreen() {
  const { firebaseUser } = useAuth();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentEntry | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editStatus, setEditStatus] = useState<PaymentStatus>('Pendiente');
  const [editNotes, setEditNotes] = useState('');
  const [editNextContactAt, setEditNextContactAt] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBilling = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getBillingBootstrap(firebaseUser);
    setPayments(response.payments || []);
    setClients(response.clients || []);
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

  const clientsByName = useMemo(() => {
    const entries = new Map<string, Client>();
    clients.forEach(client => {
      [client.razonSocial, client.denominacion].forEach(name => {
        const normalized = normalizeText(name);
        if (normalized && !entries.has(normalized)) entries.set(normalized, client);
      });
    });
    return entries;
  }, [clients]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadBilling();
    } finally {
      setRefreshing(false);
    }
  };

  const openPaymentEditor = (payment: PaymentEntry) => {
    setSelectedPayment(payment);
    setEditStatus(payment.status);
    setEditNotes(payment.notes || '');
    setEditNextContactAt(payment.nextContactAt ? payment.nextContactAt.slice(0, 10) : '');
  };

  const getPaymentClient = (payment: PaymentEntry) => clientsByName.get(normalizeText(payment.razonSocial));

  const savePayment = async () => {
    if (!firebaseUser || !selectedPayment) return;

    setSaving(true);
    try {
      await updatePaymentEntry(firebaseUser, selectedPayment.id, {
        status: editStatus,
        notes: editNotes.trim(),
        nextContactAt: editNextContactAt.trim() || null,
      });
      setSelectedPayment(null);
      await loadBilling();
      Alert.alert('Mora actualizada', 'Se guardaron los cambios.');
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando mora..." />;

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
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={visiblePayments}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>Mora</Text>
            <Text style={styles.subtitle}>{totals.count} pendientes - {formatCurrency(totals.pending)}</Text>
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
        renderItem={({ item }) => {
          const paymentClient = getPaymentClient(item);

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <Text style={styles.client}>{item.razonSocial || 'Cliente sin nombre'}</Text>
                  <Text style={styles.meta}>
                    {[item.tipo, item.comprobanteNumber, item.company].filter(Boolean).join(' - ') || 'Sin comprobante'}
                  </Text>
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
              <View style={styles.cardActions}>
                <Pressable onPress={() => openPaymentEditor(item)} style={styles.cardActionButton}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color="#0f172a" />
                  <Text style={styles.cardActionText}>Editar</Text>
                </Pressable>
                {paymentClient && (
                  <Pressable onPress={() => setSelectedClient(paymentClient)} style={styles.cardActionButton}>
                    <MaterialCommunityIcons name="account-box-outline" size={18} color="#0f172a" />
                    <Text style={styles.cardActionText}>Cliente</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={Boolean(selectedPayment)} transparent animationType="fade" onRequestClose={() => setSelectedPayment(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Actualizar mora</Text>
            <Text style={styles.modalSubtitle}>{selectedPayment?.razonSocial || 'Cliente sin nombre'}</Text>

            <View style={styles.statusGrid}>
              {statusOptions.map(status => (
                <Pressable
                  key={status}
                  onPress={() => setEditStatus(status)}
                  style={[styles.statusOption, editStatus === status && styles.statusOptionActive]}
                >
                  <Text style={[styles.statusOptionText, editStatus === status && styles.statusOptionTextActive]}>
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              multiline
              placeholder="Nota o aclaracion"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <TextInput
              placeholder="Proximo contacto AAAA-MM-DD"
              placeholderTextColor="#94a3b8"
              style={styles.dateInput}
              value={editNextContactAt}
              onChangeText={setEditNextContactAt}
            />

            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setSelectedPayment(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={savePayment} style={[styles.primaryButton, saving && styles.disabledButton]}>
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardActionButton: {
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
  cardActionText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    padding: 18,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: '#64748b',
    fontSize: 13,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusOptionActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  statusOptionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  statusOptionTextActive: {
    color: '#ffffff',
  },
  modalInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    color: '#0f172a',
    padding: 12,
    textAlignVertical: 'top',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.65,
  },
});
