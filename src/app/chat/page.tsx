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
import type { ChatMember } from '@/lib/google-chat-service';
import { Loader2, MessageSquare, RefreshCw, SendHorizontal, LogIn, AlertCircle } from 'lucide-react';

// Tipos definidos localmente
interface ChatMessage {
  name: string;
  text: string;
  createTime?: string;
  sender?: { displayName?: string; name?: string; email?: string };
  thread?: { name?: string };
}

// Función auxiliar simple
const formatDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch (error) {
    return iso;
  }
};

export default function ChatPage() {
  const { toast } = useToast();
  const { getGoogleAccessToken, userInfo } = useAuth();
  
  // Estados
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [spaceMembers, setSpaceMembers] = useState<Record<string, string>>({}); // Map: "users/ID" -> "Nombre"

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceMapping[]>([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const historyRef = useRef<HTMLDivElement | null>(null);

  // 1. Verificación inicial de sesión Google
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
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

  // 2. Carga de espacios y usuarios
  useEffect(() => {
    const loadResources = async () => {
      try {
        // Recuperar selección previa
        const storedSpace = sessionStorage.getItem('chat-selected-space');
        if (storedSpace) setSelectedSpace(storedSpace);
        setSelectionHydrated(true);

        // Cargar datos de Firebase
        const [spaces, appUsers] = await Promise.all([getChatSpaces(), getAllUsers()]);
        setUsers(appUsers);
        setChatSpaces(spaces);
      } catch (error) {
        console.error('Error cargando recursos del chat:', error);
      }
    };
    loadResources();
  }, []);

  // 3. Persistir selección de espacio
  useEffect(() => {
    if (selectionHydrated) {
      sessionStorage.setItem('chat-selected-space', selectedSpace);
    }
  }, [selectedSpace, selectionHydrated]);

  // 4. Función para cargar mensajes y miembros
  const loadMessages = useCallback(
    async (space?: string, manualToken?: string) => {
      setIsLoadingMessages(true);
      setLastError(null);

      try {
        const token = manualToken || await getGoogleAccessToken({ silent: true });
        
        if (!token) {
          setIsGoogleConnected(false);
          setIsLoadingMessages(false);
          return;
        }

        const search = space ? `?space=${encodeURIComponent(space)}` : '';
        
        // 4a. Cargar Mensajes
        const msgsPromise = fetch(`/api/chat${search}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // 4b. Cargar Miembros del Espacio (para resolver nombres en grupos)
        // Usamos el nuevo modo 'members'
        const membersPromise = fetch(`/api/chat${search}${search ? '&' : '?'}mode=members`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const [msgsResponse, membersResponse] = await Promise.all([msgsPromise, membersPromise]);

        // Procesar mensajes
        const msgsContentType = msgsResponse.headers.get('content-type') || '';
        const msgsPayload = msgsContentType.includes('application/json') ? await msgsResponse.json() : await msgsResponse.text();

        if (!msgsResponse.ok) {
          if (msgsResponse.status === 403 || msgsResponse.status === 401) {
             setIsGoogleConnected(false);
             try { sessionStorage.removeItem('google-access-token'); } catch {}
             throw new Error('Tu sesión de Google expiró o faltan permisos. Por favor reconecta.');
          }
          throw new Error((typeof msgsPayload === 'string' ? msgsPayload : msgsPayload?.error) || 'No se pudieron obtener los mensajes.');
        }

        const msgsData = typeof msgsPayload === 'string' ? {} : msgsPayload;
        setMessages(Array.isArray(msgsData?.messages) ? msgsData.messages : []);

        // Procesar miembros (si falla, no bloquea)
        if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            if (Array.isArray(membersData.members)) {
                const map: Record<string, string> = {};
                membersData.members.forEach((m: ChatMember) => {
                    if (m.member?.name && m.member?.displayName) {
                        map[m.member.name] = m.member.displayName;
                    }
                });
                setSpaceMembers(map);
            }
        }

        setIsGoogleConnected(true);
      } catch (error: any) {
        console.error('Error cargando chat:', error);
        setLastError(error?.message || 'Error al leer historial.');
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [getGoogleAccessToken]
  );

  // 5. Cargar mensajes automáticamente al conectar o cambiar espacio
  useEffect(() => {
    if (isGoogleConnected && !isCheckingAuth) {
        loadMessages(selectedSpace || undefined);
    }
  }, [isGoogleConnected, isCheckingAuth, selectedSpace, loadMessages]);

  // 6. Scroll automático al fondo
  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (!a.createTime || !b.createTime) return 0;
      return new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
    });
  }, [messages]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [orderedMessages]);

  const myChatId = useMemo(() => {
    if (!userInfo?.email || messages.length === 0) return null;
    const myMsg = messages.find(m => m.sender?.email === userInfo.email);
    return myMsg?.sender?.name || null;
  }, [messages, userInfo]);

  const handleManualLogin = async () => {
    setIsCheckingAuth(true);
    try {
        const token = await getGoogleAccessToken();
        if (token) {
            setIsGoogleConnected(true);
            setLastError(null);
            toast({ title: 'Conectado a Google Chat' });
            loadMessages(selectedSpace || undefined, token);
        } else {
            toast({ title: 'No se pudo conectar', variant: 'destructive' });
        }
    } catch (error) {
        console.error('Login error', error);
        toast({ title: 'Error de conexión', variant: 'destructive' });
    } finally {
        setIsCheckingAuth(false);
    }
  };

  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!text) return;

    setIsSending(true);
    try {
      const token = await getGoogleAccessToken({ silent: true });
      if (!token) throw new Error('Sesión perdida. Reconecta con Google.');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, mode: 'api', targetSpace: selectedSpace || undefined }),
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
            setIsGoogleConnected(false);
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error enviando mensaje.');
      }

      toast({ title: 'Mensaje enviado' });
      setMessageText('');
      loadMessages(selectedSpace || undefined, token);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const resolveSenderName = (sender?: { displayName?: string; name?: string; email?: string }) => {
    if (!sender) return 'Desconocido';

    // 1. Prioridad: Si Google ya dio el nombre en el mensaje
    if (sender.displayName) return sender.displayName;

    // 2. Si tenemos email, buscar en usuarios locales
    if (sender.email) {
      if (userInfo?.email && sender.email === userInfo.email) return 'Yo';
      const localUser = users.find(u => u.email === sender.email);
      if (localUser?.name) return localUser.name;
    }

    // 3. Buscar en la lista de miembros del espacio (Solución para Grupos)
    if (sender.name && spaceMembers[sender.name]) {
        return spaceMembers[sender.name];
    }

    // 4. Chequear si soy "Yo" por ID inferido
    if (myChatId && sender.name === myChatId) {
      return 'Yo';
    }

    // 5. Fallback para DMs
    if (selectedSpace && sender.name) {
      const mapping = chatSpaces.find(s => s.spaceId === selectedSpace);
      if (mapping) {
        const targetUser = users.find(u => u.id === mapping.userId);
        if (targetUser?.name) return targetUser.name;
        if (mapping.userEmail) return mapping.userEmail;
      }
    }

    return sender.name || 'Usuario';
  };

  const availableSpaces = useMemo(() => chatSpaces.filter(s => !!s.spaceId), [chatSpaces]);
  const selectedSpaceValue = selectedSpace || 'default';

  const getSpaceLabel = (space: ChatSpaceMapping) => {
      const user = users.find(u => u.id === space.userId);
      return user?.name || space.userEmail || space.spaceId;
  };

  if (isCheckingAuth) {
      return (
          <div className="flex h-64 w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      );
  }

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
                        Conecta tu cuenta para ver y enviar mensajes.
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
              <CardDescription>Mensajes recientes.</CardDescription>
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
                      {getSpaceLabel(space)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" className="gap-2" onClick={() => loadMessages(selectedSpace || undefined)} disabled={isLoadingMessages}>
              {isLoadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lastError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{lastError}</AlertDescription>
            </Alert>
          )}

          <div ref={historyRef} className="flex max-h-[500px] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/40 p-3 min-h-[100px]">
            {orderedMessages.length === 0 && !isLoadingMessages && (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No hay mensajes recientes.
                </div>
            )}
            {orderedMessages.map((msg, idx) => {
              const senderName = resolveSenderName(msg.sender);
              return (
                <div key={`${msg.createTime}-${idx}`} className="flex flex-col gap-1 rounded-md bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{senderName}</span>
                    <span>{formatDate(msg.createTime)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
            <Label htmlFor="chat-message" className="text-xs">Nuevo mensaje</Label>
            <Textarea
              id="chat-message"
              placeholder="Escribe un mensaje..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={2}
            />
            <div className="flex items-center justify-end">
              <Button onClick={handleSendMessage} disabled={!messageText.trim() || isSending} size="sm">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SendHorizontal className="h-4 w-4 mr-2" />}
                Enviar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
