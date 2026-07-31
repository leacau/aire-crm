'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Button,
} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { signOutCurrentUser } from '@/lib/auth-client';
import { canUseWebNotifications, registerWebNotificationToken } from '@/lib/notifications-client';
import Link from 'next/link';
import { Bell, LogOut, Settings } from "lucide-react";

export function UserNav() {
  const { user, userInfo } = useAuth();
  const { toast } = useToast();
  const [registeringNotifications, setRegisteringNotifications] = useState(false);
  const [notificationsSupported, setNotificationsSupported] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOutCurrentUser();
      sessionStorage.clear(); 
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const initials = userInfo?.initials || user?.displayName?.substring(0, 2).toUpperCase() || 'U';
  const displayName = userInfo?.name || user?.displayName || 'Usuario';
  const email = userInfo?.email || user?.email || '';

  useEffect(() => {
    setNotificationsSupported(canUseWebNotifications());
  }, []);

  const handleEnableNotifications = async () => {
    if (!user || registeringNotifications) return;
    setRegisteringNotifications(true);
    try {
      const token = await registerWebNotificationToken(user, { requestPermission: true });
      toast({
        title: token ? 'Notificaciones activadas' : 'Notificaciones no activadas',
        description: token
          ? 'Este navegador ya puede recibir avisos de Aire CRM.'
          : 'No se otorgo permiso para mostrar notificaciones.',
      });
    } catch (error) {
      toast({
        title: 'No se pudieron activar las notificaciones',
        description: error instanceof Error ? error.message : 'Hubo un error configurando el navegador.',
        variant: 'destructive',
      });
    } finally {
      setRegisteringNotifications(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={userInfo?.photoURL || user?.photoURL || ''} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {notificationsSupported && (
            <DropdownMenuItem onClick={handleEnableNotifications} disabled={registeringNotifications}>
              <Bell className="mr-2 h-4 w-4" />
              <span>{registeringNotifications ? 'Activando...' : 'Activar notificaciones'}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
              <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configuración</span>
              </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
