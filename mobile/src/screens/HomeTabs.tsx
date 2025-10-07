import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import DashboardScreen from './dashboard/DashboardScreen';
import ClientsScreen from './clients/ClientsScreen';
import OpportunitiesScreen from './opportunities/OpportunitiesScreen';
import ProfileScreen from './profile/ProfileScreen';

const Tab = createBottomTabNavigator();

const HomeTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: '#2563eb',
      tabBarInactiveTintColor: '#9ca3af',
      tabBarStyle: {
        backgroundColor: '#ffffff'
      },
      tabBarIcon: ({ color, size }) => {
        const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
          Dashboard: 'speedometer-outline',
          Clients: 'people-outline',
          Opportunities: 'briefcase-outline',
          Profile: 'person-circle-outline'
        };

        const iconName = iconMap[route.name] ?? 'ellipse-outline';
        return <Ionicons name={iconName} size={size} color={color} />;
      }
    })}
  >
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Clients" component={ClientsScreen} />
    <Tab.Screen name="Opportunities" component={OpportunitiesScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);

export default HomeTabs;
