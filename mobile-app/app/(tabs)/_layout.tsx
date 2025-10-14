import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

export default function TabsLayout() {
  const { signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
    router.replace('/(auth)/login');
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1d4ed8' },
        headerTintColor: '#ffffff',
        tabBarActiveTintColor: '#1d4ed8',
        tabBarInactiveTintColor: '#94a3b8'
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Resumen',
          tabBarLabel: 'Inicio'
        }}
      />
      <Tabs.Screen
        name="pipeline"
        options={{
          title: 'Pipeline',
          tabBarLabel: 'Pipeline'
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarLabel: 'Perfil',
          headerRight: () => (
            <Pressable onPress={handleSignOut} style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: '#f8fafc', fontWeight: '600' }}>Salir</Text>
            </Pressable>
          )
        }}
      />
    </Tabs>
  );
}
