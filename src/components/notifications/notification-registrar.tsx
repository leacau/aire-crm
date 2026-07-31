'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  canUseWebNotifications,
  listenForWebForegroundNotifications,
  registerWebNotificationToken,
} from '@/lib/notifications-client';
import { useToast } from '@/hooks/use-toast';

export function NotificationRegistrar() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || !canUseWebNotifications()) return;

    let cancelled = false;
    const shouldRegisterSilently = Notification.permission === 'granted';

    if (shouldRegisterSilently) {
      registerWebNotificationToken(user).catch(error => {
        console.warn('No se pudo registrar el token web de notificaciones:', error);
      });
    }

    listenForWebForegroundNotifications(payload => {
      if (cancelled) return;
      toast({
        title: payload.title || 'Aire CRM',
        description: payload.body || 'Tenes una nueva notificacion.',
      });
    }).catch(error => {
      console.warn('No se pudo escuchar notificaciones en primer plano:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [toast, user]);

  return null;
}
