import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
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
import { createClientActivity, getClientDetail } from '../lib/api';
import type { Client, ClientActivity, Opportunity } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

type ClientDetailScreenProps = {
  clientId: string;
  initialClient?: Client;
  onBack: () => void;
};

type QuickAction = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  type: string;
  helper: string;
  accessibilityLabel: string;
};

const quickActions: QuickAction[] = [
  { icon: 'phone-outline', type: 'Llamada', helper: 'llamada', accessibilityLabel: 'Registrar llamada' },
  { icon: 'email-outline', type: 'Mail', helper: 'correo', accessibilityLabel: 'Registrar mail' },
  { icon: 'chat-outline', type: 'WhatsApp', helper: 'WhatsApp', accessibilityLabel: 'Registrar WhatsApp' },
  { icon: 'car-outline', type: 'Visita a empresa', helper: 'visita presencial', accessibilityLabel: 'Registrar visita presencial' },
  { icon: 'video-outline', type: 'Meet', helper: 'reunion por Meet', accessibilityLabel: 'Registrar reunion por Meet' },
];

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(value?: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function resolveClientName(client?: Client) {
  return client?.denominacion || client?.razonSocial || 'Cliente';
}

export function ClientDetailScreen({ clientId, initialClient, onBack }: ClientDetailScreenProps) {
  const { firebaseUser } = useAuth();
  const [client, setClient] = useState<Client | undefined>(initialClient);
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(!initialClient);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [observation, setObservation] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskObservation, setTaskObservation] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(addDays(1));

  const loadDetail = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getClientDetail(firebaseUser, clientId);
    setClient(response.client);
    setActivities(response.activities);
    setOpportunities(response.opportunities);
  }, [clientId, firebaseUser]);

  useEffect(() => {
    loadDetail().catch(error => {
      Alert.alert('No se pudo cargar el cliente', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [loadDetail]);

  const activeOpportunities = useMemo(
    () => opportunities.filter(opportunity => !opportunity.stage.includes('Perdido')),
    [opportunities],
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadDetail();
    } finally {
      setRefreshing(false);
    }
  };

  const openAction = (action: QuickAction) => {
    setSelectedAction(action);
    setObservation('');
  };

  const saveAction = async () => {
    if (!firebaseUser || !selectedAction || !client) return;

    const trimmedObservation = observation.trim();
    setSaving(true);
    try {
      await createClientActivity(firebaseUser, {
        clientId: client.id,
        clientName: resolveClientName(client),
        type: selectedAction.type,
        observation: trimmedObservation || `${selectedAction.type} registrada desde mobile.`,
        isTask: false,
      });
      setSelectedAction(null);
      setObservation('');
      await loadDetail();
      Alert.alert('Actividad registrada', `Se guardo la accion de ${selectedAction.helper}.`);
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const openTaskModal = () => {
    setTaskObservation('');
    setTaskDueDate(addDays(1));
    setTaskModalOpen(true);
  };

  const saveTask = async () => {
    if (!firebaseUser || !client) return;

    const trimmedObservation = taskObservation.trim();
    const trimmedDueDate = taskDueDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDueDate)) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await createClientActivity(firebaseUser, {
        clientId: client.id,
        clientName: resolveClientName(client),
        type: 'Otra',
        observation: trimmedObservation || 'Tarea creada desde mobile.',
        isTask: true,
        dueDate: trimmedDueDate,
      });
      setTaskModalOpen(false);
      await loadDetail();
      Alert.alert('Tarea creada', `Vencimiento: ${formatDate(trimmedDueDate)}.`);
    } catch (error) {
      Alert.alert('No se pudo crear la tarea', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando cliente..." />;

  if (!client) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Cliente no disponible</Text>
        <Pressable onPress={onBack} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Volver a clientes</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Cliente</Text>
          <Text style={styles.title}>{resolveClientName(client)}</Text>
          <Text style={styles.subtitle}>Asesor: {client.ownerName || '-'}</Text>
          <Text style={styles.meta}>{[client.localidad, client.provincia].filter(Boolean).join(', ') || 'Sin ubicacion'}</Text>
        </View>

        <View style={styles.actionsRow}>
          {quickActions.map(action => (
            <Pressable
              key={action.type}
              accessibilityLabel={action.accessibilityLabel}
              accessibilityRole="button"
              onPress={() => openAction(action)}
              style={styles.actionButton}
            >
              <MaterialCommunityIcons name={action.icon} size={25} color="#ffffff" />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={openTaskModal} style={styles.taskButton}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#0f172a" />
          <Text style={styles.taskButtonText}>Crear tarea</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos de empresa</Text>
          <InfoRow label="Razon social" value={client.razonSocial} />
          <InfoRow label="CUIT" value={client.cuit} />
          <InfoRow label="IVA" value={client.condicionIVA} />
          <InfoRow label="Rubro" value={client.rubro} />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Telefono" value={client.phone} />
          <InfoRow label="Tipo" value={client.tipoEntidad} />
          {!!client.observaciones && (
            <Text style={styles.observations}>{client.observaciones}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Oportunidades</Text>
          <Text style={styles.cardSubtitle}>{activeOpportunities.length} activas o visibles para este cliente.</Text>
          {opportunities.slice(0, 5).map(opportunity => (
            <View key={opportunity.id} style={styles.compactItem}>
              <Text style={styles.itemTitle}>{opportunity.title}</Text>
              <Text style={styles.itemMeta}>{opportunity.stage} · {formatAmount(opportunity.value)}</Text>
            </View>
          ))}
          {opportunities.length === 0 && <Text style={styles.muted}>Sin oportunidades asociadas.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actividad reciente</Text>
          {activities.slice(0, 12).map(activity => (
            <View key={activity.id} style={styles.activityItem}>
              <View style={styles.activityHeader}>
                <Text style={styles.itemTitle}>{activity.type}</Text>
                <Text style={styles.itemDate}>{formatDate(activity.timestamp)}</Text>
              </View>
              <Text style={styles.itemMeta}>{activity.userName || '-'}</Text>
              <Text style={styles.activityText}>{activity.observation}</Text>
            </View>
          ))}
          {activities.length === 0 && <Text style={styles.muted}>Todavia no hay actividades cargadas.</Text>}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedAction)} transparent animationType="fade" onRequestClose={() => setSelectedAction(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Registrar {selectedAction?.helper}</Text>
            <Text style={styles.modalSubtitle}>La nota es opcional. Queda asentado con fecha de hoy.</Text>
            <TextInput
              multiline
              placeholder="Agregar comentario"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
              value={observation}
              onChangeText={setObservation}
            />
            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setSelectedAction(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveAction} style={[styles.primaryButton, saving && styles.disabledButton]}>
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={taskModalOpen} transparent animationType="fade" onRequestClose={() => setTaskModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Crear tarea</Text>
            <Text style={styles.modalSubtitle}>Queda asociada a {resolveClientName(client)}.</Text>
            <View style={styles.quickDates}>
              <Pressable onPress={() => setTaskDueDate(addDays(0))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>Hoy</Text>
              </Pressable>
              <Pressable onPress={() => setTaskDueDate(addDays(1))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>Manana</Text>
              </Pressable>
              <Pressable onPress={() => setTaskDueDate(addDays(7))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>7 dias</Text>
              </Pressable>
            </View>
            <TextInput
              multiline
              placeholder="Que hay que hacer"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
              value={taskObservation}
              onChangeText={setTaskObservation}
            />
            <TextInput
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#94a3b8"
              style={styles.dateInput}
              value={taskDueDate}
              onChangeText={setTaskDueDate}
            />
            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setTaskModalOpen(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveTask} style={[styles.primaryButton, saving && styles.disabledButton]}>
                <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
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
    gap: 5,
  },
  kicker: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    color: '#64748b',
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#0f172a',
  },
  taskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingVertical: 13,
  },
  taskButtonText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 13,
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
  observations: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  compactItem: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    gap: 3,
  },
  activityItem: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    gap: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    color: '#0f172a',
    fontWeight: '900',
  },
  itemMeta: {
    color: '#64748b',
    fontSize: 13,
  },
  itemDate: {
    color: '#64748b',
    fontSize: 12,
  },
  activityText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  muted: {
    color: '#64748b',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 20,
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
  modalInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    color: '#0f172a',
    padding: 12,
    textAlignVertical: 'top',
  },
  quickDates: {
    flexDirection: 'row',
    gap: 8,
  },
  quickDateButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 9,
  },
  quickDateText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
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
