import React, { useCallback, useEffect, useState } from 'react';
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
import { createClientActivity, getOpportunityDetail, updateOpportunity } from '../lib/api';
import type { Client, Opportunity, OpportunityStage } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

type OpportunityDetailScreenProps = {
  opportunityId: string;
  initialOpportunity?: Opportunity;
  onBack: () => void;
  backLabel?: string;
  onOpenClient?: (client: Client) => void;
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
  { icon: 'video-outline', type: 'Meet', helper: 'reunion por Meet', accessibilityLabel: 'Registrar reunion por Meet' },
];

const editableStages: OpportunityStage[] = [
  'Nuevo',
  'Propuesta',
  'Negociación',
  'Negociación a Aprobar',
  'Cerrado - No Definido',
  'Cerrado - Perdido',
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

function getStageStyle(stage: string) {
  if (stage.includes('Ganado')) return styles.stageWon;
  if (stage.includes('Perdido')) return styles.stageLost;
  if (stage.includes('Aprobar')) return styles.stageReview;
  if (stage.includes('Propuesta') || stage.includes('Negoci')) return styles.stageActive;
  return styles.stageNeutral;
}

export function OpportunityDetailScreen({
  opportunityId,
  initialOpportunity,
  onBack,
  backLabel = 'Volver a oportunidades',
  onOpenClient,
}: OpportunityDetailScreenProps) {
  const { firebaseUser } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | undefined>(initialOpportunity);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(!initialOpportunity);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [observation, setObservation] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskObservation, setTaskObservation] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(addDays(1));
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStage, setEditStage] = useState<OpportunityStage>('Propuesta');
  const [editValue, setEditValue] = useState('');
  const [editCloseDate, setEditCloseDate] = useState('');
  const [editFollowUpCurrent, setEditFollowUpCurrent] = useState('');
  const [editFollowUpNext, setEditFollowUpNext] = useState('');
  const [editHighProbability, setEditHighProbability] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getOpportunityDetail(firebaseUser, opportunityId);
    setOpportunity(response.opportunity);
    setClient(response.client || null);
  }, [firebaseUser, opportunityId]);

  useEffect(() => {
    loadDetail().catch(error => {
      Alert.alert('No se pudo cargar la oportunidad', error instanceof Error ? error.message : 'Intenta nuevamente.');
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

  const openAction = (action: QuickAction) => {
    setSelectedAction(action);
    setObservation('');
  };

  const saveAction = async () => {
    if (!firebaseUser || !selectedAction || !opportunity) return;

    const trimmedObservation = observation.trim();
    setSaving(true);
    try {
      await createClientActivity(firebaseUser, {
        clientId: opportunity.clientId,
        clientName: opportunity.clientName,
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        type: selectedAction.type,
        observation: trimmedObservation || `${selectedAction.type} registrada desde mobile.`,
        isTask: false,
      });
      setSelectedAction(null);
      setObservation('');
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

  const openEditModal = () => {
    if (!opportunity) return;
    setEditStage(opportunity.stage);
    setEditValue(String(opportunity.value || 0));
    setEditCloseDate(opportunity.closeDate ? opportunity.closeDate.slice(0, 10) : '');
    setEditFollowUpCurrent(opportunity.followUpCurrent || '');
    setEditFollowUpNext(opportunity.followUpNext || '');
    setEditHighProbability(Boolean(opportunity.highCloseProbability));
    setEditModalOpen(true);
  };

  const saveOpportunityUpdate = async () => {
    if (!firebaseUser || !opportunity) return;

    const parsedValue = Number(editValue.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      Alert.alert('Valor invalido', 'Cargá un monto estimado válido.');
      return;
    }
    if (editCloseDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(editCloseDate.trim())) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await updateOpportunity(firebaseUser, opportunity.id, {
        stage: editStage,
        value: parsedValue,
        closeDate: editCloseDate.trim(),
        followUpCurrent: editFollowUpCurrent.trim(),
        followUpNext: editFollowUpNext.trim(),
        highCloseProbability: editHighProbability,
      });
      setEditModalOpen(false);
      await loadDetail();
      Alert.alert('Oportunidad actualizada', 'Los cambios quedaron guardados.');
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const saveTask = async () => {
    if (!firebaseUser || !opportunity) return;

    const trimmedObservation = taskObservation.trim();
    const trimmedDueDate = taskDueDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDueDate)) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await createClientActivity(firebaseUser, {
        clientId: opportunity.clientId,
        clientName: opportunity.clientName,
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        type: 'Otra',
        observation: trimmedObservation || 'Tarea creada desde mobile.',
        isTask: true,
        dueDate: trimmedDueDate,
      });
      setTaskModalOpen(false);
      Alert.alert('Tarea creada', `Vencimiento: ${formatDate(trimmedDueDate)}.`);
    } catch (error) {
      Alert.alert('No se pudo crear la tarea', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando oportunidad..." />;

  if (!opportunity) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Oportunidad no disponible</Text>
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
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Oportunidad</Text>
          <Text style={styles.title}>{opportunity.title || 'Oportunidad'}</Text>
          <Text style={styles.subtitle}>{opportunity.clientName || 'Cliente sin nombre'}</Text>
          <View style={styles.heroRow}>
            <Text style={[styles.stage, getStageStyle(opportunity.stage)]}>{opportunity.stage}</Text>
            {opportunity.highCloseProbability && <Text style={styles.hotBadge}>Alta probabilidad</Text>}
          </View>
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

        <Pressable onPress={openEditModal} style={styles.editButton}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color="#ffffff" />
          <Text style={styles.editButtonText}>Actualizar oportunidad</Text>
        </Pressable>

        {!!client && !!onOpenClient && (
          <Pressable onPress={() => onOpenClient(client)} style={styles.clientButton}>
            <MaterialCommunityIcons name="account-box-outline" size={20} color="#0f172a" />
            <Text style={styles.clientButtonText}>Ver cliente</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos comerciales</Text>
          <InfoRow label="Valor" value={formatCurrency(opportunity.value)} />
          <InfoRow label="Cierre estimado" value={formatDate(opportunity.closeDate)} />
          <InfoRow label="Inicio" value={formatDate(opportunity.startDate)} />
          <InfoRow label="Fin" value={formatDate(opportunity.endDate)} />
          <InfoRow label="Canje" value={opportunity.isCanje ? 'Si' : 'No'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seguimiento</Text>
          <InfoBlock label="Actual" value={opportunity.followUpCurrent} />
          <InfoBlock label="Proximo" value={opportunity.followUpNext} />
          <InfoBlock label="Detalle" value={opportunity.details || opportunity.observaciones} />
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedAction)} transparent animationType="fade" onRequestClose={() => setSelectedAction(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Registrar {selectedAction?.helper}</Text>
            <Text style={styles.modalSubtitle}>La actividad queda asociada al cliente y a esta oportunidad.</Text>
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
            <Text style={styles.modalSubtitle}>Queda asociada a esta oportunidad.</Text>
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

      <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Actualizar oportunidad</Text>
            <Text style={styles.modalSubtitle}>Edición rápida para seguimiento comercial.</Text>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <Text style={styles.fieldLabel}>Etapa</Text>
              <View style={styles.stageGrid}>
                {editableStages.map(stage => (
                  <Pressable
                    key={stage}
                    onPress={() => setEditStage(stage)}
                    style={[styles.stageOption, editStage === stage && styles.stageOptionActive]}
                  >
                    <Text style={[styles.stageOptionText, editStage === stage && styles.stageOptionTextActive]}>{stage}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Valor estimado</Text>
              <TextInput
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94a3b8"
                style={styles.dateInput}
                value={editValue}
                onChangeText={setEditValue}
              />

              <Text style={styles.fieldLabel}>Cierre estimado</Text>
              <TextInput
                placeholder="AAAA-MM-DD"
                placeholderTextColor="#94a3b8"
                style={styles.dateInput}
                value={editCloseDate}
                onChangeText={setEditCloseDate}
              />

              <Pressable onPress={() => setEditHighProbability(value => !value)} style={styles.probabilityToggle}>
                <MaterialCommunityIcons
                  name={editHighProbability ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                  size={21}
                  color="#0f172a"
                />
                <Text style={styles.probabilityText}>Alta probabilidad de cierre</Text>
              </Pressable>

              <Text style={styles.fieldLabel}>Seguimiento actual</Text>
              <TextInput
                multiline
                placeholder="Situación actual"
                placeholderTextColor="#94a3b8"
                style={styles.modalInput}
                value={editFollowUpCurrent}
                onChangeText={setEditFollowUpCurrent}
              />

              <Text style={styles.fieldLabel}>Próximo paso</Text>
              <TextInput
                multiline
                placeholder="Próxima acción"
                placeholderTextColor="#94a3b8"
                style={styles.modalInput}
                value={editFollowUpNext}
                onChangeText={setEditFollowUpNext}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setEditModalOpen(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveOpportunityUpdate} style={[styles.primaryButton, saving && styles.disabledButton]}>
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

function InfoBlock({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.blockValue}>{value || '-'}</Text>
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
    gap: 7,
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
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    paddingVertical: 13,
  },
  editButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  clientButton: {
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
  clientButtonText: {
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
  infoRow: {
    gap: 3,
  },
  infoBlock: {
    gap: 5,
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
    fontWeight: '800',
  },
  blockValue: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
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
  hotBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
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
    maxHeight: '88%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
  },
  modalScroll: {
    maxHeight: 430,
  },
  modalScrollContent: {
    gap: 10,
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
  fieldLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stageOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  stageOptionActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  stageOptionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  stageOptionTextActive: {
    color: '#ffffff',
  },
  probabilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 11,
  },
  probabilityText: {
    color: '#0f172a',
    fontWeight: '900',
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
