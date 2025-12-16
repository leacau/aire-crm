'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getAllUsers } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { Loader2, MessageSquare, RefreshCw, Send, Users } from 'lucide-react';

interface ChatMessage {
  name: string;
  text: string;
  createTime?: string;
  sender?: { displayName?: string };
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
  const chatEndpoint = process.env.NEXT_PUBLIC_CHAT_ENDPOINT || '/api/google-chat/chat';
  const [message, setMessage] = useState('');
  const [threadKey, setThreadKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [targetEmail, setTargetEmail] = useState('');

  const directMessageValue = targetEmail || 'none';

  const advisoryOptions = useMemo(() => advisors.filter((user) => !!user.email), [advisors]);

  const loadMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    try {
      const token = await getGoogleAccessToken();
      if (!token) {
        toast({ title: 'Acceso a Google requerido', description: 'Inicia sesión con Google para leer el hilo del espacio.' });
        return;
      }

      const response = await fetch(chatEndpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();

      if (!response.ok) {
        const message = typeof payload === 'string' ? payload : payload?.error;
        const friendly =
          response.status === 404
            ? `El endpoint ${chatEndpoint} no está disponible en este despliegue. Verifica que la app se haya redeployado con la ruta de Chat o ajusta NEXT_PUBLIC_CHAT_ENDPOINT.`
            : undefined;
        throw new Error(friendly || message || 'No se pudieron obtener los mensajes.');
      }
      const data = typeof payload === 'string' ? {} : payload;
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (error: any) {
      console.error('Error cargando mensajes de Chat', error);
      toast({
        title: 'No se pudieron cargar los mensajes',
        description: error?.message || 'Revisa los permisos de Chat en tu cuenta de Google.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [getGoogleAccessToken, toast]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      toast({ title: 'Mensaje requerido', description: 'Escribe un mensaje para enviarlo a Google Chat.' });
      return;
    }

    const wantsDirectMessage = Boolean(targetEmail);
    const token = await getGoogleAccessToken(wantsDirectMessage ? undefined : { silent: true });

    if (wantsDirectMessage && !token) {
      toast({
        title: 'Google Chat requerido',
        description: 'Vuelve a iniciar sesión con Google para enviar mensajes directos en Chat.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: message.trim(),
          threadKey: threadKey.trim() || undefined,
          webhookUrl: webhookUrl.trim() || undefined,
          targetEmail: targetEmail || undefined,
          // Forzar API cuando hay token para poder responder hilos existentes.
          mode: token ? 'api' : undefined,
          accessToken: token || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const friendly =
          response.status === 404
            ? `El endpoint ${chatEndpoint} no está disponible en este despliegue. Verifica el redeploy o usa el webhook directo.`
            : undefined;
        throw new Error(friendly || error?.error || 'No se pudo enviar el mensaje.');
      }

      setLastResult('success');
      toast({ title: 'Mensaje enviado', description: 'El mensaje se envió al espacio configurado en Google Chat.' });
      setMessage('');
      setThreadKey('');
      setWebhookUrl('');
      setTargetEmail('');
      if (token) {
        loadMessages();
      }
    } catch (error: any) {
      console.error('Error al enviar mensaje de Chat', error);
      setLastResult('error');
      toast({
        title: 'Error al enviar',
        description: error?.message || 'No se pudo entregar el mensaje en Google Chat.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSetThread = (threadName?: string) => {
    if (!threadName) return;
    setThreadKey(threadName);
    toast({ title: 'Hilo seleccionado', description: 'Responderás en el hilo elegido.' });
  };

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    getAllUsers('Asesor')
      .then((data) => setAdvisors(data))
      .catch((error) => {
        console.error('No se pudieron cargar los asesores para Chat', error);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Google Chat</h1>
        <p className="text-muted-foreground max-w-3xl">
          Usa el botón del menú para abrir el espacio de Chat de tu cuenta laboral o envía un mensaje directo al webhook
          configurado para notificaciones internas. Este módulo agrega conversación en el espacio existente y chats directos con
          cada asesor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Enviar mensaje
            </CardTitle>
            <CardDescription>
              Publica un aviso en el espacio de Google Chat configurado con el webhook <code>GOOGLE_CHAT_WEBHOOK_URL</code> o
              envía un mensaje directo a un asesor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSend}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="message">Mensaje</Label>
                <Textarea
                  id="message"
                  placeholder="Comparte recordatorios, avisos de prospectos u otra novedad para el equipo."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="thread">Clave de hilo / Thread name (opcional)</Label>
                  <Input
                    id="thread"
                    placeholder="Usa la misma clave para agrupar mensajes en un hilo."
                    value={threadKey}
                    onChange={(e) => setThreadKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Cuando lees mensajes puedes elegir un hilo existente.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="webhook">Webhook alternativo (opcional)</Label>
                  <Input
                    id="webhook"
                    placeholder="https://chat.googleapis.com/v1/spaces/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si lo dejas vacío se usará <code>GOOGLE_CHAT_WEBHOOK_URL</code>. Sirve para probar otros espacios sin cambiar
                    la configuración global.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Enviar directo a asesor (opcional)</Label>
                <Select
                  value={directMessageValue}
                  onValueChange={(value) => setTargetEmail(value === 'none' ? '' : value)}
                >
                  <SelectTrigger className="w-full md:w-80">
                    <SelectValue placeholder="Sin mensaje directo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin mensaje directo</SelectItem>
                    {advisoryOptions.map((user) => (
                      <SelectItem key={user.id} value={user.email!}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si eliges un asesor se abrirá un chat directo con su cuenta de Google Chat usando tu sesión de Google.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isSending || !message.trim()}>
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar a Google Chat
                </Button>
                <Button asChild variant="outline">
                  <Link href="https://chat.google.com" target="_blank" rel="noreferrer">
                    Abrir Chat en Google Workspace
                  </Link>
                </Button>
                <Button type="button" variant="ghost" className="gap-2" onClick={loadMessages} disabled={isLoadingMessages}>
                  {isLoadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Recargar hilos
                </Button>
              </div>
              {lastResult === 'success' && (
                <Alert variant="default" className="border-green-500">
                  <AlertTitle>Mensaje enviado</AlertTitle>
                  <AlertDescription>Se registró el envío en el espacio de Chat configurado.</AlertDescription>
                </Alert>
              )}
              {lastResult === 'error' && (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo enviar</AlertTitle>
                  <AlertDescription>Revisa la configuración del webhook o vuelve a intentar en unos minutos.</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuración recomendada</CardTitle>
            <CardDescription>
              Para habilitar el envío y lectura, crea un webhook entrante en el espacio de Google Chat y guárdalo en
              <code> GOOGLE_CHAT_WEBHOOK_URL </code>. Opcionalmente configura <code>GOOGLE_CHAT_SPACE_ID</code> para recuperar los
              hilos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p>
              Las notificaciones de prospectos siguen enviándose por correo. Este módulo agrega un canal opcional para enviar
              recordatorios inmediatos al equipo sin alterar los procesos existentes.
            </p>
            <p>
              Usa la clave de hilo para mantener conversaciones agrupadas en un mismo tema (por ejemplo,
              <strong>prospectos-pendientes</strong>). Si la dejas vacía, cada mensaje se publicará como un hilo nuevo.
            </p>
            <p>
              Para chats directos y lectura de hilos, autoriza la app con los scopes de Google Chat (messages y spaces) y habilita
              la API Google Chat en el proyecto de Google Cloud.
            </p>
            <p>
              El acceso se rige por los mismos permisos de pantalla; los roles con permiso de edición podrán enviar mensajes al
              webhook configurado.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <div>
              <CardTitle>Actividad reciente del espacio</CardTitle>
              <CardDescription>Consulta el hilo del espacio configurado y selecciona un hilo para responder desde aquí.</CardDescription>
            </div>
          </div>
          <Button variant="ghost" className="gap-2" onClick={loadMessages} disabled={isLoadingMessages}>
            {isLoadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando mensajes...
            </div>
          ) : null}
          {messages.length === 0 && !isLoadingMessages ? (
            <p className="text-sm text-muted-foreground">Aún no pudimos mostrar mensajes de este espacio.</p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {messages.map((msg) => (
              <div key={msg.name} className="flex flex-col gap-2 rounded-lg border p-3 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{msg.sender?.displayName || 'Sin nombre'}</span>
                  <span>{formatDate(msg.createTime)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {msg.thread?.name ? <Badge variant="outline">Hilo: {msg.thread.name.split('/').pop()}</Badge> : null}
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    {msg.name.split('/').pop()}
                  </Badge>
                </div>
                {msg.thread?.name ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleSetThread(msg.thread?.name)}>
                      Usar este hilo
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
