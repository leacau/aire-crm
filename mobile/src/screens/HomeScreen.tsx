import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import type { AppTab } from './AppShell';

function toStartOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function HomeScreen({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const { bootstrap, session } = useAuth();
  const focus = useMemo(() => {
    const today = toStartOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = bootstrap?.tasks || [];
    const overdueTasks = tasks.filter(task => {
      const dueDate = parseDate(task.dueDate);
      return dueDate ? toStartOfDay(dueDate) < today : false;
    }).length;
    const todayTasks = tasks.filter(task => {
      const dueDate = parseDate(task.dueDate);
      if (!dueDate) return false;
      const start = toStartOfDay(dueDate);
      return start >= today && start < tomorrow;
    }).length;
    const highProbability = (bootstrap?.opportunities || []).filter(opportunity => opportunity.highCloseProbability).length;
    const activeClients = (bootstrap?.clients || []).filter(client => !client.isDeactivated).length;

    return {
      overdueTasks,
      todayTasks,
      highProbability,
      activeClients,
    };
  }, [bootstrap]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Sesion validada</Text>
        <Text style={styles.title}>Hola, {session?.user.name || 'equipo'}.</Text>
        <Text style={styles.copy}>
          Esta es la primera base mobile conectada a la API privada de Aire CRM.
        </Text>
      </View>

      <View style={styles.focusCard}>
        <Text style={styles.focusTitle}>Foco de hoy</Text>
        <View style={styles.focusGrid}>
          <Pressable style={styles.focusItem} onPress={() => onOpenTab('tasks')}>
            <Text style={styles.focusValue}>{focus.overdueTasks}</Text>
            <Text style={styles.focusLabel}>vencidas</Text>
          </Pressable>
          <Pressable style={styles.focusItem} onPress={() => onOpenTab('tasks')}>
            <Text style={styles.focusValue}>{focus.todayTasks}</Text>
            <Text style={styles.focusLabel}>para hoy</Text>
          </Pressable>
          <Pressable style={styles.focusItem} onPress={() => onOpenTab('opportunities')}>
            <Text style={styles.focusValue}>{focus.highProbability}</Text>
            <Text style={styles.focusLabel}>alta prob.</Text>
          </Pressable>
          <Pressable style={styles.focusItem} onPress={() => onOpenTab('clients')}>
            <Text style={styles.focusValue}>{focus.activeClients}</Text>
            <Text style={styles.focusLabel}>clientes activos</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('tasks')}>
          <Text style={styles.actionTitle}>Tareas</Text>
          <Text style={styles.actionCopy}>
            {bootstrap ? `${bootstrap.stats.pendingTasks} pendientes para completar desde el celular.` : 'Ver tareas pendientes y completarlas desde el celular.'}
          </Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('clients')}>
          <Text style={styles.actionTitle}>Clientes</Text>
          <Text style={styles.actionCopy}>
            {bootstrap ? `${bootstrap.stats.visibleClients} clientes visibles segun permisos.` : 'Consultar cartera accesible segun permisos del usuario.'}
          </Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('opportunities')}>
          <Text style={styles.actionTitle}>Oportunidades</Text>
          <Text style={styles.actionCopy}>
            {bootstrap ? `${bootstrap.stats.activeOpportunities} oportunidades activas para revisar.` : 'Ver pipeline activo, importes y proximos seguimientos.'}
          </Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('billing')}>
          <Text style={styles.actionTitle}>Mora</Text>
          <Text style={styles.actionCopy}>
            Consultar comprobantes pendientes, estados y notas de cobranza segun permisos.
          </Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('approvals')}>
          <Text style={styles.actionTitle}>Aprobaciones</Text>
          <Text style={styles.actionCopy}>
            Revisar pedidos pendientes y abrir la bandeja web para aprobar o devolver.
          </Text>
        </Pressable>
        <Pressable style={styles.actionCard} onPress={() => onOpenTab('prospects')}>
          <Text style={styles.actionTitle}>Prospectos</Text>
          <Text style={styles.actionCopy}>
            Crear prospectos, consultar los propios y reclamar prospectos libres.
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 16,
  },
  heroCard: {
    borderRadius: 14,
    backgroundColor: '#0f172a',
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
  },
  focusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 16,
    gap: 12,
  },
  focusTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  focusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  focusItem: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 2,
  },
  focusValue: {
    color: '#2563eb',
    fontSize: 24,
    fontWeight: '900',
  },
  focusLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  grid: {
    gap: 12,
  },
  actionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 6,
  },
  actionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  actionCopy: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
});
