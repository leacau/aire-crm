import React, { useCallback, useEffect, useState } from 'react';
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
import { completeTask, getTasks, rescheduleTask } from '../lib/api';
import type { ClientActivity } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

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

export function TasksScreen() {
  const { bootstrap, firebaseUser } = useAuth();
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ClientActivity | null>(null);
  const [dueDateInput, setDueDateInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!firebaseUser) return;
    const response = await getTasks(firebaseUser);
    setTasks(response.activities.filter(task => task.isTask && !task.completed));
  }, [firebaseUser]);

  useEffect(() => {
    if (bootstrap?.tasks) {
      setTasks(bootstrap.tasks);
      setLoading(false);
      return;
    }

    loadTasks().catch(error => {
      Alert.alert('No se pudieron cargar tareas', error instanceof Error ? error.message : 'Intenta nuevamente.');
    }).finally(() => setLoading(false));
  }, [bootstrap?.tasks, loadTasks]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadTasks();
    } finally {
      setRefreshing(false);
    }
  };

  const markComplete = async (task: ClientActivity) => {
    if (!firebaseUser) return;
    setTasks(previous => previous.filter(item => item.id !== task.id));
    try {
      await completeTask(firebaseUser, task.id);
    } catch (error) {
      Alert.alert('No se pudo completar', error instanceof Error ? error.message : 'Intenta nuevamente.');
      await loadTasks();
    }
  };

  const openReschedule = (task: ClientActivity) => {
    setSelectedTask(task);
    setDueDateInput(task.dueDate ? task.dueDate.slice(0, 10) : addDays(1));
  };

  const saveReschedule = async () => {
    if (!firebaseUser || !selectedTask) return;
    const nextDueDate = dueDateInput.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await rescheduleTask(firebaseUser, selectedTask.id, nextDueDate);
      setSelectedTask(null);
      await loadTasks();
      Alert.alert('Tarea reprogramada', `Nuevo vencimiento: ${formatDate(nextDueDate)}.`);
    } catch (error) {
      Alert.alert('No se pudo reprogramar', error instanceof Error ? error.message : 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando tareas..." />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={tasks}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>Tareas pendientes</Text>
            <Text style={styles.subtitle}>{tasks.length} tareas accesibles para tu usuario.</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay tareas pendientes.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleGroup}>
                <Text style={styles.cardTitle}>{item.clientName || item.prospectName || item.opportunityTitle || 'Actividad'}</Text>
                <Text style={styles.meta}>{item.type || 'Tarea'}</Text>
              </View>
              <Text style={styles.dueBadge}>{formatDate(item.dueDate)}</Text>
            </View>
            <Text style={styles.observation}>{item.observation}</Text>
            {!!item.opportunityTitle && <Text style={styles.meta}>Oportunidad: {item.opportunityTitle}</Text>}
            <View style={styles.actionsRow}>
              <Pressable style={styles.rescheduleButton} onPress={() => openReschedule(item)}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={18} color="#0f172a" />
                <Text style={styles.rescheduleText}>Reprogramar</Text>
              </Pressable>
              <Pressable style={styles.completeButton} onPress={() => markComplete(item)}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.completeText}>Completar</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={Boolean(selectedTask)} transparent animationType="fade" onRequestClose={() => setSelectedTask(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reprogramar tarea</Text>
            <Text style={styles.modalSubtitle}>{selectedTask?.clientName || selectedTask?.prospectName || 'Actividad'}</Text>

            <View style={styles.quickDates}>
              <Pressable onPress={() => setDueDateInput(addDays(0))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>Hoy</Text>
              </Pressable>
              <Pressable onPress={() => setDueDateInput(addDays(1))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>Manana</Text>
              </Pressable>
              <Pressable onPress={() => setDueDateInput(addDays(7))} style={styles.quickDateButton}>
                <Text style={styles.quickDateText}>7 dias</Text>
              </Pressable>
            </View>

            <TextInput
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#94a3b8"
              style={styles.dateInput}
              value={dueDateInput}
              onChangeText={setDueDateInput}
            />

            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setSelectedTask(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveReschedule} style={[styles.primaryButton, saving && styles.disabledButton]}>
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
    marginTop: 4,
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
    justifyContent: 'space-between',
    gap: 10,
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
  dueBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  observation: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 4,
  },
  rescheduleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingVertical: 11,
  },
  rescheduleText: {
    color: '#0f172a',
    fontWeight: '900',
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    paddingVertical: 11,
  },
  completeText: {
    color: '#ffffff',
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
