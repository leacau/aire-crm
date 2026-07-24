import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ClientsScreen } from './ClientsScreen';
import { HomeScreen } from './HomeScreen';
import { TasksScreen } from './TasksScreen';

type Tab = 'home' | 'tasks' | 'clients';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Inicio' },
  { id: 'tasks', label: 'Tareas' },
  { id: 'clients', label: 'Clientes' },
];

export function AppShell() {
  const insets = useSafeAreaInsets();
  const { logout, session } = useAuth();
  const [tab, setTab] = useState<Tab>('home');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Aire CRM</Text>
          <Text style={styles.user}>{session?.user.name || session?.user.email}</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === 'home' && <HomeScreen onOpenTab={setTab} />}
        {tab === 'tasks' && <TasksScreen />}
        {tab === 'clients' && <ClientsScreen />}
      </View>

      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {tabs.map(item => (
          <Pressable
            key={item.id}
            onPress={() => setTab(item.id)}
            style={[styles.tab, tab === item.id && styles.activeTab]}
          >
            <Text style={[styles.tabText, tab === item.id && styles.activeTabText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  greeting: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '900',
  },
  user: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  logoutButton: {
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: {
    color: '#0f172a',
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  tabbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: '#0f172a',
  },
  tabText: {
    color: '#475569',
    fontWeight: '800',
  },
  activeTabText: {
    color: '#ffffff',
  },
});
