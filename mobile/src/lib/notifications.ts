import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { User } from 'firebase/auth';
import { apiRequest } from './api-client';

const DEFAULT_CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Aire CRM',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563eb',
  });
}

async function ensureNotificationPermission() {
  await ensureAndroidNotificationChannel();

  const currentPermissions = await Notifications.getPermissionsAsync();
  if (currentPermissions.granted) return true;

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return requestedPermissions.granted;
}

function getDeviceLabel() {
  const parts = [Device.manufacturer, Device.modelName].filter(Boolean);
  return parts.join(' ') || Platform.OS;
}

export async function registerMobileNotificationToken(user: User) {
  if (!Device.isDevice) {
    throw new Error('Las notificaciones push requieren un dispositivo fisico.');
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    throw new Error('No se otorgo permiso para recibir notificaciones en este dispositivo.');
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = typeof deviceToken.data === 'string' ? deviceToken.data : '';
  if (!token) {
    throw new Error('Firebase no devolvio un token FCM para este dispositivo.');
  }

  await apiRequest('/api/notifications/tokens', {
    method: 'POST',
    user,
    body: {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app: 'mobile',
      deviceId: `${Platform.OS}:${getDeviceLabel()}`,
    },
  });

  return token;
}

export async function unregisterMobileNotificationToken(user: User) {
  if (!Device.isDevice) return;

  const deviceToken = await Notifications.getDevicePushTokenAsync().catch(() => null);
  const token = typeof deviceToken?.data === 'string' ? deviceToken.data : '';
  if (!token) return;

  await apiRequest('/api/notifications/tokens', {
    method: 'DELETE',
    user,
    body: { token },
  }).catch(error => {
    console.warn('No se pudo desregistrar el token mobile de notificaciones:', error);
  });
}

export function useMobileNotifications(user: User | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !user) return undefined;

    let cancelled = false;

    registerMobileNotificationToken(user).catch(error => {
      if (!cancelled) {
        console.warn('No se pudo registrar el token mobile de notificaciones:', error);
      }
    });

    const tokenSubscription = Notifications.addPushTokenListener(token => {
      if (cancelled || !token.data) return;
      apiRequest('/api/notifications/tokens', {
        method: 'POST',
        user,
        body: {
          token: token.data,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          app: 'mobile',
          deviceId: `${Platform.OS}:${getDeviceLabel()}`,
        },
      }).catch(error => {
        console.warn('No se pudo actualizar el token mobile de notificaciones:', error);
      });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('Aire CRM notification opened:', data);
    });

    return () => {
      cancelled = true;
      tokenSubscription.remove();
      responseSubscription.remove();
    };
  }, [enabled, user]);
}
