import React from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

const ProfileScreen: React.FC = () => {
  const { profile, user, signOutUser } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (error: any) {
      Alert.alert('No se pudo cerrar la sesión', error?.message ?? 'Vuelve a intentarlo.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{profile?.name?.[0] ?? 'A'}</Text>
          </View>
        )}
        <Text style={styles.name}>{profile?.name ?? 'Usuario'}</Text>
        <Text style={styles.email}>{profile?.email ?? user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Rol</Text>
        <Text style={styles.sectionValue}>{profile?.role ?? 'Sin asignar'}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 24
  },
  header: {
    alignItems: 'center',
    marginTop: 32
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 16
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe'
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827'
  },
  email: {
    marginTop: 4,
    color: '#6b7280'
  },
  section: {
    marginTop: 32,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  sectionLabel: {
    fontSize: 14,
    color: '#6b7280'
  },
  sectionValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937'
  },
  button: {
    marginTop: 40,
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  }
});

export default ProfileScreen;
