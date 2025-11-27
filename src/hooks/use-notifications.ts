
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from './use-toast';

type NotificationPermission = 'default' | 'granted' | 'denied';

type ExtendedNotificationOptions = NotificationOptions & {
    onClickUrl?: string;
    onClick?: () => void;
};

export function useNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const { toast } = useToast();

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) {
            toast({
                title: 'Navegador no compatible',
                description: 'Este navegador no soporta notificaciones de escritorio.',
                variant: 'destructive',
            });
            return;
        }

        const status = await Notification.requestPermission();
        setPermission(status);

        if (status === 'granted') {
            toast({
                title: '¡Genial!',
                description: 'Recibirás notificaciones de tus tareas.',
            });
        } else if (status === 'denied') {
            toast({
                title: 'Permiso denegado',
                description: 'Puedes habilitar las notificaciones desde la configuración de tu navegador.',
                variant: 'destructive',
            });
        }
    }, [toast]);

    const showNotification = useCallback((title: string, options?: ExtendedNotificationOptions) => {
        if (permission === 'granted') {
            const notification = new Notification(title, {
                ...options,
                icon: '/aire-logo.png', // Optional: add your app icon
            });

            notification.onclick = () => {
                if (options?.onClick) {
                    options.onClick();
                } else if (options?.onClickUrl) {
                    window.open(options.onClickUrl, '_blank');
                }
                window.focus();
            };

            return notification;
        }
        return null;
    }, [permission]);

    return {
        notificationPermission: permission,
        requestNotificationPermission: requestPermission,
        showNotification,
    };
}
