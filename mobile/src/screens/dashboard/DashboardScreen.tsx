import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { format, isBefore, isToday, isTomorrow, parseISO, startOfToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import {
  getClientsForUser,
  getOpportunitiesForUser,
  getRecentActivities,
  getTasksForUser
} from '../../services/firebaseService';
import type { ActivityLog, ClientActivity } from '../../types';

const today = startOfToday();

const categorizeTasks = (tasks: ClientActivity[]) => {
  const overdue: ClientActivity[] = [];
  const dueToday: ClientActivity[] = [];
  const dueTomorrow: ClientActivity[] = [];

  tasks.forEach(task => {
    if (!task.dueDate || task.completed) {
      return;
    }

    const dueDate = parseISO(task.dueDate);

    if (isBefore(dueDate, today)) {
      overdue.push(task);
    } else if (isToday(dueDate)) {
      dueToday.push(task);
    } else if (isTomorrow(dueDate)) {
      dueTomorrow.push(task);
    }
  });

  return { overdue, dueToday, dueTomorrow };
};

const TaskList = ({ title, tasks }: { title: string; tasks: ClientActivity[] }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {tasks.length === 0 ? (
      <Text style={styles.emptyText}>No hay tareas pendientes.</Text>
    ) : (
      tasks.map(task => (
        <View key={task.id} style={styles.taskCard}>
          <Text style={styles.taskTitle}>{task.observation}</Text>
          <Text style={styles.taskSubtitle}>{task.clientName ?? 'Cliente sin nombre'}</Text>
          {task.dueDate && (
            <Text style={styles.taskDate}>
              Vence {format(parseISO(task.dueDate), "d 'de' MMMM", { locale: es })}
            </Text>
          )}
        </View>
      ))
    )}
  </View>
);

const ActivityItem = ({ activity }: { activity: ActivityLog }) => (
  <View style={styles.activityCard}>
    <Text style={styles.activityTitle}>{activity.userName}</Text>
    <Text style={styles.activityDescription}>{(activity.details ?? '').replace(/<[^>]*>?/gm, '')}</Text>
    <Text style={styles.activityTime}>
      {activity.timestamp ? format(parseISO(activity.timestamp), "d MMM - HH:mm", { locale: es }) : ''}
    </Text>
  </View>
);

const DashboardScreen: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    clients: 0,
    opportunities: 0,
    tasks: [] as ClientActivity[],
    activities: [] as ActivityLog[]
  });

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [clients, opportunities, tasks, activities] = await Promise.all([
        getClientsForUser(user.uid),
        getOpportunitiesForUser(user.uid),
        getTasksForUser(user.uid),
        getRecentActivities(10)
      ]);

      setStats({
        clients: clients.length,
        opportunities: opportunities.length,
        tasks,
        activities
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const taskGroups = useMemo(() => categorizeTasks(stats.tasks), [stats.tasks]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.greeting}>Hola, {profile?.name ?? 'equipo'} 👋</Text>
        <Text style={styles.subtitle}>Resumen de tu día</Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Clientes</Text>
            <Text style={styles.summaryValue}>{stats.clients}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Oportunidades</Text>
            <Text style={styles.summaryValue}>{stats.opportunities}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Tareas pendientes</Text>
            <Text style={styles.summaryValue}>{taskGroups.overdue.length + taskGroups.dueToday.length + taskGroups.dueTomorrow.length}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#2563eb" />
        ) : (
          <>
            <TaskList title="Atrasadas" tasks={taskGroups.overdue} />
            <TaskList title="Para hoy" tasks={taskGroups.dueToday} />
            <TaskList title="Para mañana" tasks={taskGroups.dueTomorrow} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actividad reciente</Text>
              {stats.activities.length === 0 ? (
                <Text style={styles.emptyText}>No hay actividad registrada.</Text>
              ) : (
                stats.activities.map(activity => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6'
  },
  content: {
    padding: 20
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827'
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    color: '#6b7280'
  },
  summaryGrid: {
    marginTop: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  summaryCard: {
    width: '48%',
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280'
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937'
  },
  section: {
    marginTop: 32
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12
  },
  emptyText: {
    color: '#9ca3af'
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937'
  },
  taskSubtitle: {
    marginTop: 4,
    color: '#6b7280'
  },
  taskDate: {
    marginTop: 6,
    color: '#2563eb',
    fontWeight: '500'
  },
  activityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937'
  },
  activityDescription: {
    marginTop: 4,
    color: '#4b5563'
  },
  activityTime: {
    marginTop: 6,
    fontSize: 12,
    color: '#9ca3af'
  }
});

export default DashboardScreen;
