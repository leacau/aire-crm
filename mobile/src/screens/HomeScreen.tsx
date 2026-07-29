import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import type { AppTab } from './AppShell';

export function HomeScreen({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const { bootstrap, session } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Sesion validada</Text>
        <Text style={styles.title}>Hola, {session?.user.name || 'equipo'}.</Text>
        <Text style={styles.copy}>
          Esta es la primera base mobile conectada a la API privada de Aire CRM.
        </Text>
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
