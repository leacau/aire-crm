import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { completeTask, getTasks } from '../lib/api';
import type { ClientActivity } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

export function TasksScreen() {
  const { bootstrap, firebaseUser } = useAuth();
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  if (loading) return <LoadingScreen label="Cargando tareas..." />;

  return (
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
          <Text style={styles.cardTitle}>{item.clientName || item.prospectName || 'Actividad'}</Text>
          <Text style={styles.observation}>{item.observation}</Text>
          {item.dueDate && <Text style={styles.meta}>Vence: {new Date(item.dueDate).toLocaleDateString('es-AR')}</Text>}
          <Pressable style={styles.completeButton} onPress={() => markComplete(item)}>
            <Text style={styles.completeText}>Completar</Text>
          </Pressable>
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
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
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
  completeButton: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#16a34a',
    paddingVertical: 11,
  },
  completeText: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
