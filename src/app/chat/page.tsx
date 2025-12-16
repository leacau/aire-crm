"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, RefreshCw, Send, Users } from "lucide-react";

interface ChatMessage {
  name: string;
  text: string;
  createTime?: string;
  sender?: { displayName?: string };
  thread?: { name?: string };
}

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch (error) {
    return iso;
  }
}

export default function ChatPage() {
  const { toast } = useToast();
  const chatEndpoint = process.env.NEXT_PUBLIC_CHAT_ENDPOINT || "/api/google-chat/chat";
  const [message, setMessage] = useState("");
  const [threadName, setThreadName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const loadMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(chatEndpoint);

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();

      if (!response.ok) {
        const message = typeof payload === "string" ? payload : payload?.error;
        const friendly =
          response.status === 404
            ? `El endpoint ${chatEndpoint} no está disponible en este despliegue. Verifica que la app se haya redeployado con la ruta de Chat o ajusta NEXT_PUBLIC_CHAT_ENDPOINT.`
            : undefined;
        throw new Error(friendly || message || "No se pudieron obtener los mensajes.");
      }
      const data = typeof payload === "string" ? {} : payload;
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (error: any) {
      console.error("Error cargando mensajes de Chat", error);
      toast({
        title: "No se pudieron cargar los mensajes",
        description: error?.message || "Revisa que el bot tenga acceso al espacio configurado.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [chatEndpoint, toast]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      toast({ title: "Mensaje requerido", description: "Escribe un mensaje para enviarlo a Google Chat." });
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.trim(),
          threadName: threadName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const friendly =
          response.status === 404
            ? `El endpoint ${chatEndpoint} no está disponible en este despliegue. Verifica el redeploy o usa NEXT_PUBLIC_CHAT_ENDPOINT.`
            : undefined;
        throw new Error(friendly || error?.error || "No se pudo enviar el mensaje.");
      }

      setLastResult("success");
      toast({ title: "Mensaje enviado", description: "El mensaje se envió al espacio configurado en Google Chat." });
      setMessage("");
      setThreadName("");
      loadMessages();
    } catch (error: any) {
      console.error("Error al enviar mensaje de Chat", error);
      setLastResult("error");
      toast({
        title: "Error al enviar",
        description: error?.message || "No se pudo entregar el mensaje en Google Chat.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSetThread = (thread?: string) => {
    if (!thread) return;
    setThreadName(thread);
    toast({ title: "Hilo seleccionado", description: "Responderás en el hilo elegido." });
  };

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Google Chat</h1>
        <p className="text-muted-foreground max-w-3xl">
          Envía y revisa mensajes del espacio configurado en Google Chat usando el bot de Service Account. No necesitas iniciar
          sesión con Google; la API se invoca desde el backend con las credenciales del bot.
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
              Publica un aviso en el espacio definido por <code>GOOGLE_CHAT_SPACE_ID</code> usando la API de Google Chat.
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
                  <Label htmlFor="thread">Nombre de hilo (opcional)</Label>
                  <Input
                    id="thread"
                    placeholder="Selecciona un hilo existente o pega el nombre del thread."
                    value={threadName}
                    onChange={(e) => setThreadName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Cuando leas mensajes puedes elegir un hilo existente.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isSending || !message.trim()}>
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar a Google Chat
                </Button>
                <Button type="button" variant="ghost" className="gap-2" onClick={loadMessages} disabled={isLoadingMessages}>
                  {isLoadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Recargar hilos
                </Button>
              </div>
              {lastResult === "success" && (
                <Alert variant="default" className="border-green-500">
                  <AlertTitle>Mensaje enviado</AlertTitle>
                  <AlertDescription>Se registró el envío en el espacio de Chat configurado.</AlertDescription>
                </Alert>
              )}
              {lastResult === "error" && (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo enviar</AlertTitle>
                  <AlertDescription>Revisa la configuración del bot o vuelve a intentar en unos minutos.</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuración recomendada</CardTitle>
            <CardDescription>
              Configura <code>GOOGLE_CHAT_PROJECT_ID</code>, <code>GOOGLE_CHAT_CLIENT_EMAIL</code>,
              <code>GOOGLE_CHAT_PRIVATE_KEY</code> y <code>GOOGLE_CHAT_SPACE_ID</code>. La página usa el bot para listar y
              publicar mensajes sin exponer credenciales en el cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p>
              Las notificaciones de prospectos siguen enviándose por correo. Este módulo agrega un canal opcional para enviar
              recordatorios inmediatos al equipo sin alterar los procesos existentes.
            </p>
            <p>
              Usa el nombre de hilo para mantener conversaciones agrupadas. Si lo dejas vacío, cada mensaje se publicará como
              un hilo nuevo.
            </p>
            <p>
              Asegúrate de que el Service Account del bot tenga acceso al espacio y el scope <code>chat.bot</code> habilitado en
              el proyecto de Google Cloud. No es necesario iniciar sesión en el cliente.
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
                  <span className="font-medium text-foreground">{msg.sender?.displayName || "Sin nombre"}</span>
                  <span>{formatDate(msg.createTime)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {msg.thread?.name ? <Badge variant="outline">Hilo: {msg.thread.name.split("/").pop()}</Badge> : null}
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    {msg.name.split("/").pop()}
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
