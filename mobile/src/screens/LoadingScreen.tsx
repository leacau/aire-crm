import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function LoadingScreen({ label = 'Cargando...' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0f172a" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  text: {
    color: '#334155',
    fontSize: 15,
  },
});
