'use client';

import type React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [threadKey, setThreadKey] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      toast({ title: 'Mensaje requerido', description: 'Escribe un mensaje para enviarlo a Google Chat.' });
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.trim(), threadKey: threadKey.trim() || undefined }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'No se pudo enviar el mensaje.');
      }

      setLastResult('success');
      toast({ title: 'Mensaje enviado', description: 'El mensaje se envió al espacio configurado en Google Chat.' });
      setMessage('');
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Google Chat</h1>
        <p className="text-muted-foreground max-w-2xl">
          Usa el botón del menú para abrir el espacio de Chat de tu cuenta laboral o envía un mensaje directo al webhook
          configurado para notificaciones internas. Esto no reemplaza las notificaciones por correo: actúa como un canal
          complementario.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Enviar mensaje
            </CardTitle>
            <CardDescription>
              Publica un aviso en el espacio de Google Chat configurado con el webhook <code>GOOGLE_CHAT_WEBHOOK_URL</code>.
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="thread">Clave de hilo (opcional)</Label>
                <Input
                  id="thread"
                  placeholder="Usa la misma clave para agrupar mensajes en un hilo."
                  value={threadKey}
                  onChange={(e) => setThreadKey(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSending}>
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar a Google Chat
                </Button>
                <Button asChild variant="outline">
                  <Link href="https://chat.google.com" target="_blank" rel="noreferrer">
                    Abrir Chat en Google Workspace
                  </Link>
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
              Para habilitar el envío, crea un webhook entrante en el espacio de Google Chat y guárdalo en la variable de entorno
              <code> GOOGLE_CHAT_WEBHOOK_URL </code> del proyecto.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p>
              Las notificaciones de prospectos seguirán enviándose por correo. Este módulo agrega un canal opcional para enviar
              recordatorios inmediatos al equipo sin alterar los procesos existentes.
            </p>
            <p>
              Usa la clave de hilo para mantener conversaciones agrupadas en un mismo tema (por ejemplo, <strong>prospectos-pendientes</strong>).
              Si la dejas vacía, cada mensaje se publicará como un hilo nuevo.
            </p>
            <p>
              El acceso se rige por los mismos permisos de pantalla; los roles con permiso de edición podrán enviar mensajes al
              webhook configurado.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
