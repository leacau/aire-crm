'use client';

import { apiRequest } from '@/lib/api-client';
import { app } from '@/lib/firebase';
import type { AuthClientUser } from '@/lib/auth-client';

type RegisterOptions = {
  requestPermission?: boolean;
};

type ForegroundMessageHandler = (payload: { title?: string; body?: string; data?: Record<string, string> }) => void;

const WEB_PUSH_SW_PATH = '/firebase-messaging-sw.js';

let foregroundUnsubscribe: (() => void) | null = null;

function getVapidKey() {
  return process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_VAPID_KEY?.trim() || '';
}

export function canUseWebNotifications() {
  return (
    typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'Notification' in window
  );
}

export async function registerWebNotificationToken(user: AuthClientUser, options: RegisterOptions = {}) {
  if (!canUseWebNotifications()) {
    throw new Error('Este navegador no soporta notificaciones web.');
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    throw new Error('Falta configurar NEXT_PUBLIC_FIREBASE_MESSAGING_VAPID_KEY.');
  }

  if (Notification.permission === 'denied') {
    throw new Error('Las notificaciones estan bloqueadas en este navegador.');
  }

  if (Notification.permission !== 'granted') {
    if (!options.requestPermission) return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
  }

  const [{ getMessaging, getToken, isSupported }, registration] = await Promise.all([
    import('firebase/messaging'),
    navigator.serviceWorker.register(WEB_PUSH_SW_PATH),
  ]);

  if (!(await isSupported())) {
    throw new Error('Firebase Messaging no esta soportado en este navegador.');
  }

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) return null;

  await apiRequest('/api/notifications/tokens', {
    method: 'POST',
    user,
    body: {
      token,
      platform: 'web',
      app: 'web',
      userAgent: navigator.userAgent,
    },
  });

  return token;
}

export async function unregisterWebNotificationToken(user: AuthClientUser) {
  if (!canUseWebNotifications()) return;

  const vapidKey = getVapidKey();
  if (!vapidKey || Notification.permission !== 'granted') return;

  const { getMessaging, getToken, deleteToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return;

  const registration = await navigator.serviceWorker.getRegistration(WEB_PUSH_SW_PATH);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration || undefined,
  }).catch(() => null);

  if (!token) return;

  await apiRequest('/api/notifications/tokens', {
    method: 'DELETE',
    user,
    body: { token },
  });
  await deleteToken(messaging).catch(() => undefined);
}

export async function listenForWebForegroundNotifications(onMessagePayload: ForegroundMessageHandler) {
  if (!canUseWebNotifications() || foregroundUnsubscribe) return foregroundUnsubscribe;

  const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;

  const messaging = getMessaging(app);
  foregroundUnsubscribe = onMessage(messaging, payload => {
    onMessagePayload({
      title: payload.notification?.title || payload.data?.title,
      body: payload.notification?.body || payload.data?.body,
      data: payload.data,
    });
  });

  return foregroundUnsubscribe;
}
