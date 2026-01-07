'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getAllUsers, getChatSpaces } from '@/lib/firebase-service';
import type { ChatSpaceMapping, User } from '@/lib/types';
import { Loader2, MessageSquare, RefreshCw, SendHorizontal, LogIn, AlertCircle } from 'lucide-react';

interface ChatMessage {
  name: string;
  text: string;
  createTime?: string;
  sender?: { displayName?: string; name?: string; email?: string };
  thread?: { name?: string };
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch (error) {
    return iso;
  }
}

export default function ChatPage() {
  const { toast } = useToast();
  const { getGoogleAccessToken } = useAuth();
  
  // Estados de Autenticación y Carga
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  
  // Datos del Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceMapping[]>([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const selectedSpaceValue = selectedSpace || 'default';
  const hasManyMessages = messages.length > 10;
  const historyRef = useRef<HTMLDivElement | null>(null);

  // 1. Verificar autenticación silenciosa al montar
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        // Solo verificamos si hay token guardado, sin abrir popups
        const token = await getGoogleAccessToken({ silent: true });
        if (mounted) {
          setIsGoogleConnected(!!token);
        }
      } catch (error) {
        console.warn('Error verificando sesión de Google Chat:', error);
      } finally {
        if (mounted) setIsCheckingAuth(false);
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, [getGoogleAccessToken]);

  // 2. Recuperar selección de espacio guardada
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('chat-selected-space');
      if (stored !== null) {
        setSelectedSpace(stored);
      }
    } catch (error) {
      console.warn('No se pudo leer la selección previa de Chat', error);
    } finally {
      setSelectionHydrated(true);
    }
  }, []);

  // 3. Cargar espacios y usuarios (solo si estamos hidratados)
  useEffect(() => {
    if (selectionHydrated) {
      loadChatSpaces();
    }
  }, [selectionHydrated]);

  // 4. Guardar selección de espacio
  useEffect(() => {
    if (!selectionHydrated) return;
    try {
      sessionStorage.setItem('chat-selected-space', selectedSpace);
    } catch (error) {
      console.warn('No se pudo guardar la selección del espacio', error);
    }
  }, [selectedSpace, selectionHydrated]);

  // 5. Cargar mensajes cuando cambia el espacio O cuando nos conectamos
  useEffect(() => {
    if (isGoogleConnected && !isCheckingAuth) {
        loadMessages(selectedSpace || undefined);
    }
  }, [isGoogleConnected, isCheckingAuth, selectedSpace]);

  // Scroll al fondo al recibir mensajes
  useEffect(() => {
    if (!historyRef.current) return;
    historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [orderedMessages]); // Dependencia corregida a orderedMessages

  const availableSpaces = useMemo(() => {
    return chatSpaces.filter((space) => !!space.spaceId);
  }, [chatSpaces]);

  const spaceLabel = useCallback(
    (space: ChatSpaceMapping) => {
      const user = users.find((u) => u.id === space.userId);
      return user?.name || space.userEmail || space.spaceId;
    },
    [users],
  );

  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (!a.createTime || !b.createTime) return 0;
      return new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
    });
  }, [messages]);

  const handleManualLogin = async () => {
    setIsCheckingAuth(true);
    try {
        // Aquí SÍ permitimos el popup interactivo
        const token = await getGoogleAccessToken();
        if (token) {
            setIsGoogleConnected(true);
            setLastError(null);
            toast({ title: 'Conectado a Google Chat' });
            // Forzamos recarga inmediata pasando el token
            loadMessages(selectedSpace || undefined, token);
        } else {
            toast({ title: 'No se pudo conectar', variant: 'destructive' });
        }
    } catch (error) {
        console.error('Login error', error);
        toast({ title: 'Error de conexión', description: 'Intenta nuevamente.', variant: 'destructive' });
    } finally {
        setIsCheckingAuth(false);
    }
  };

  const loadMessages = useCallback(
    async (space?: string, manualToken?: string) => {
      setIsLoadingMessages(true);
      setLastError(null);

      try {
        // Usamos el token manual si existe (para evitar race conditions post-login) o pedimos uno silencioso
        const token = manualToken || await getGoogleAccessToken({ silent: true });
        
        if (!token) {
          // Si no hay token en modo silencioso, marcamos como desconectado y salimos
          setIsGoogleConnected(false);
          setIsLoadingMessages(false);
          return;
        }

        const search = space ? `?space=${encodeURIComponent(space)}` : '';
        const response = await fetch(`/api/chat${search}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : await response.text();

        if (!response.ok) {
          // Manejo específico de expiración/permisos para romper el loop
          if (response.status === 403 || response.status === 401) {
             setIsGoogleConnected(false);
             try { sessionStorage.removeItem('google-access-token'); } catch {}
             throw new Error('Tu sesión de Google expiró o faltan permisos. Por favor reconecta.');
          }

          const message = typeof payload === 'string' ? payload : payload?.error;
          throw new Error(message || 'No se pudieron obtener los mensajes.');
        }

        const data = typeof payload === 'string' ? {} : payload;
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setIsGoogleConnected(true); // Confirmamos conexión exitosa
      } catch (error: any) {
        console.error('Error cargando mensajes de Chat', error);
        setLastError(error?.message || 'No se pudieron leer los mensajes de Chat.');
        // No mostramos toast destructivo en cada error de carga automática para no spamear
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [getGoogleAccessToken],
  );

  const loadChatSpaces = useCallback(async () => {
    try {
      const [spaces, appUsers] = await Promise.all([getChatSpaces(), getAllUsers()]);
      setUsers(appUsers);
      setChatSpaces(spaces);
    } catch (error) {
      console.error('No se pudieron obtener los espacios de chat', error);
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    const text = messageText.trim();
    if (!text) return;

    setIsSending(true);
    try {
      const token = await getGoogleAccessToken({ silent: true });
      if (!token) {
          throw new Error('Sesión perdida. Por favor reconecta con Google.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, mode: 'api', targetSpace: selectedSpace || undefined }),
      });

      const payload = await response.json().catch(() => ({ error: 'No se pudo enviar el mensaje a Google Chat.' }));
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
            setIsGoogleConnected(false);
        }
        throw new Error(payload?.error || 'No se pudo enviar el mensaje a Google Chat.');
      }

      toast({ title: 'Mensaje enviado', description: 'El mensaje fue entregado en Google Chat.' });
      setMessageText('');
      loadMessages(selectedSpace || undefined, token);
    } catch (error: any) {
      console.error('Error enviando mensaje de Chat', error);
      toast({
        title: 'No se pudo enviar el mensaje',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  }, [getGoogleAccessToken, loadMessages, messageText, selectedSpace, toast]);

  if (isCheckingAuth) {
      return (
          <div className="flex h-64 w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      );
  }

  // Estado Desconectado (Auth Gate)
  if (!isGoogleConnected) {
      return (
        <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold tracking-tight">Google Chat</h1>
            <Card className="border-dashed">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-muted p-4 rounded-full mb-2 w-fit">
                        <MessageSquare className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <CardTitle>Conexión requerida</CardTitle>
                    <CardDescription>
                        Para ver el historial y enviar mensajes, necesitas dar acceso a tu cuenta de Google.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center pb-8">
                    <Button onClick={handleManualLogin} size="lg" className="gap-2">
                        <LogIn className="h-4 w-4" />
                        Conectar con Google Chat
                    </Button>
                </CardContent>
            </Card>
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Google Chat</h1>
        <p className="text-muted-foreground max-w-3xl">
          Consulta el historial de cada espacio de Chat habilitado.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <div>
              <CardTitle>Historial del espacio</CardTitle>
              <CardDescription>Visualiza los mensajes recientes.</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Espacio</Label>
              <Select
                value={selectedSpaceValue}
                onValueChange={(value) => setSelectedSpace(value === 'default' ? '' : value)}
                disabled={availableSpaces.length === 0}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Espacio principal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Espacio principal</SelectItem>
                  {availableSpaces.map((space) => (
                    <SelectItem key={space.spaceId} value={space.spaceId}>
                      {spaceLabel(space)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" className="gap-2" onClick={() => loadMessages(selectedSpace || undefined)} disabled={isLoadingMessages}>
              {isLoadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando mensajes...
            </div>
          ) : null}

          {lastError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No se pudo cargar el historial</AlertTitle>
              <AlertDescription>{lastError}</AlertDescription>
            </Alert>
          )}

          {messages.length === 0 && !isLoadingMessages && !lastError ? (
            <p className="text-sm text-muted-foreground text-center py-8">
                No hay mensajes recientes para mostrar en este espacio.
            </p>
          ) : null}

          {hasManyMessages ? (
            <p className="text-xs text-muted-foreground">Mostrando los últimos mensajes.</p>
          ) : null}

          <div ref={historyRef} className="flex max-h-[500px] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/40 p-3">
            {orderedMessages.map((msg, idx) => {
              const senderId = msg.sender?.name?.split('/').pop();
              const senderEmail = msg.sender?.email || (senderId && senderId.includes('@') ? senderId : undefined);
              const displayName = msg.sender?.displayName?.trim();
              const displayEmail = displayName && displayName.includes('@') ? displayName : undefined;
              const senderLabel =
                senderEmail ||
                displayEmail ||
                displayName ||
                senderId?.replace('users/', '') ||
                'Sin nombre';

              return (
                <div key={`${msg.createTime}-${idx}`} className="flex flex-col gap-1 rounded-md bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{senderLabel}</span>
                    <span>{formatDate(msg.createTime)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {msg.thread?.name ? <Badge variant="outline">Hilo: {msg.thread.name.split('/').pop()}</Badge> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
            <Label htmlFor="chat-message" className="text-xs">Escribir nuevo mensaje</Label>
            <Textarea
              id="chat-message"
              placeholder="Escribe un mensaje..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || isSending || isLoadingMessages}
                className="gap-2"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}Enviar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
