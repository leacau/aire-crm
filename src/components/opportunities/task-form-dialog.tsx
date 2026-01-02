'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createClientActivity } from '@/lib/firebase-service';
import { createCalendarEvent } from '@/lib/google-gmail-service';
import type { Opportunity, ClientActivity, User } from '@/lib/types';
import { Spinner } from '../ui/spinner';

interface TaskFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  opportunity: Opportunity;
  client: { id: string; name: string };
  userInfo: User;
  ensureGoogleAccessToken: () => Promise<string | null>;
}

const combineDateAndTime = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
};

export function TaskFormDialog({ isOpen, onOpenChange, opportunity, client, userInfo, ensureGoogleAccessToken }: TaskFormDialogProps) {
  const { toast } = useToast();

  const [observation, setObservation] = useState(`Seguimiento: ${opportunity.title}\n\nEnlace al cliente: /clients/${client.id}`);
  const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
  const [dueTime, setDueTime] = useState<string>('09:00');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setObservation(`Seguimiento: ${opportunity.title}\n\nEnlace al cliente: /clients/${client.id}`);
    setDueDate(new Date());
    setDueTime('09:00');
  };

  const handleSave = async () => {
    if (!observation.trim() || !dueDate || !dueTime) {
      toast({ title: "Datos incompletos", description: "Asegúrate de completar la observación, fecha y hora.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const finalDueDate = combineDateAndTime(dueDate, dueTime);

    const activityPayload: Omit<ClientActivity, 'id' | 'timestamp'> = {
      clientId: client.id,
      clientName: client.name,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      type: 'Llamada', // Defaulting to a common type, could be a select in the future
      observation,
      userId: userInfo.id,
      userName: userInfo.name,
      isTask: true,
      completed: false,
      dueDate: finalDueDate.toISOString(),
    };

    let calendarEventId: string | undefined = undefined;
    const token = await ensureGoogleAccessToken();
    if (!token) {
      toast({ title: "Reinicia sesión para conectar Google", description: "Perdimos el acceso a tu cuenta de Google. Iniciá sesión nuevamente para agendar la tarea en tu calendario." , variant: 'destructive' });
      setIsSaving(false);
      return;
    }

    try {
      const calendarEvent = {
        summary: `CRM: ${opportunity.title}`,
        description: `Tarea registrada en el CRM.\n\nObservación: ${observation}`,
        start: { dateTime: finalDueDate.toISOString() },
        end: { dateTime: finalDueDate.toISOString() },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 10 },
            { method: 'popup', minutes: 60 * 24 }, // 24 hours
          ],
        },
      };
      const createdEvent = await createCalendarEvent(token, calendarEvent);
      calendarEventId = createdEvent.id;
    } catch (e) {
      console.error("Failed to create calendar event", e);
      toast({ title: "Error al crear evento en calendario", description: "La tarea se guardará en el CRM, pero no se pudo crear el evento en Google Calendar.", variant: "destructive" });
    }

    try {
      if (calendarEventId) {
        activityPayload.googleCalendarEventId = calendarEventId;
      }
      await createClientActivity(activityPayload);
      toast({ title: "Tarea Creada", description: "El recordatorio ha sido guardado." });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving task:", error);
      toast({ title: "Error al guardar la tarea", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Tarea/Recordatorio</DialogTitle>
          <DialogDescription>
            Crea un recordatorio para la oportunidad "{opportunity.title}". Se creará un evento en tu Google Calendar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-observation">Observación / Nombre de la Tarea</Label>
            <Textarea
              id="task-observation"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha de Vencimiento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : 'Guardar Tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
