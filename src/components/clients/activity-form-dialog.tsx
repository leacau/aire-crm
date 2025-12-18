

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon, Clock, CircleDollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createClientActivity, getOpportunitiesByClientId } from '@/lib/firebase-service';
import { createCalendarEvent } from '@/lib/google-gmail-service';
import type { Opportunity, ClientActivity, User, ClientActivityType, Prospect } from '@/lib/types';
import { clientActivityTypes } from '@/lib/types';
import { Spinner } from '../ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';

interface ActivityFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  entity: { id: string; name: string; type: 'client' | 'prospect' };
  userInfo: User;
  getGoogleAccessToken: () => Promise<string | null>;
  onActivitySaved?: () => void;
  /** Owner of the entity; used to invite them to calendar tasks when creating prospect activities. */
  entityOwner?: User;
}

const combineDateAndTime = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
};

export function ActivityFormDialog({ isOpen, onOpenChange, entity, userInfo, getGoogleAccessToken, onActivitySaved, entityOwner }: ActivityFormDialogProps) {
  const { toast } = useToast();
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [newActivityType, setNewActivityType] = useState<ClientActivityType | ''>('');
  const [newActivityObservation, setNewActivityObservation] = useState('');
  const [newActivityOpportunityId, setNewActivityOpportunityId] = useState<string | undefined>();
  const [isTask, setIsTask] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState('09:00');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && entity.type === 'client') {
      getOpportunitiesByClientId(entity.id).then(setOpportunities);
    } else {
        setOpportunities([]);
    }
  }, [isOpen, entity]);

  const resetForm = () => {
    setNewActivityType('');
    setNewActivityObservation('');
    setIsTask(false);
    setDueDate(undefined);
    setDueTime('09:00');
    setNewActivityOpportunityId(undefined);
    setOpportunities([]);
  };

  const handleSave = async () => {
    if (!newActivityType || !newActivityObservation.trim()) {
      toast({ title: "Datos incompletos", description: "Selecciona un tipo y añade una observación.", variant: "destructive" });
      return;
    }
    if (isTask && (!dueDate || !dueTime)) {
      toast({ title: "Fecha y hora de vencimiento requeridas", description: "Por favor, selecciona fecha y hora para la tarea.", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    let finalDueDate: Date | undefined = undefined;
    if (isTask && dueDate) {
      finalDueDate = combineDateAndTime(dueDate, dueTime);
    }
    
    const selectedOpp = opportunities.find(opp => opp.id === newActivityOpportunityId);

    const activityPayload: Omit<ClientActivity, 'id' | 'timestamp'> = {
        ...(entity.type === 'client' && { clientId: entity.id, clientName: entity.name }),
        ...(entity.type === 'prospect' && { prospectId: entity.id, prospectName: entity.name }),
        opportunityId: newActivityOpportunityId === 'none' ? undefined : newActivityOpportunityId,
        opportunityTitle: selectedOpp?.title,
        type: newActivityType,
        observation: newActivityObservation,
        userId: userInfo.id,
        userName: userInfo.name,
        isTask,
        completed: false,
        ...(isTask && finalDueDate && { dueDate: finalDueDate.toISOString() }),
    };

    let calendarEventId: string | undefined = undefined;
    if (activityPayload.isTask && activityPayload.dueDate) {
      const token = await getGoogleAccessToken();
      if (token) {
        try {
          const calendarEvent = {
            summary: `Tarea CRM: ${activityPayload.observation.substring(0, 100)}`,
            description: `Tarea registrada en el CRM para ${entity.type === 'client' ? 'el cliente' : 'el prospecto'}: ${entity.name}.\n\nObservación: ${activityPayload.observation}`,
            start: { dateTime: activityPayload.dueDate },
            end: { dateTime: activityPayload.dueDate },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 10 },
                { method: 'popup', minutes: 60 * 24 }, // 24 hours
              ],
            },
            ...(entity.type === 'prospect' && entityOwner?.email
              ? {
                  attendees: [
                    {
                      email: entityOwner.email,
                      displayName: entityOwner.name,
                    },
                  ],
                  sendUpdates: 'all' as const,
                }
              : {}),
          };
          const createdEvent = await createCalendarEvent(token, calendarEvent);
          calendarEventId = createdEvent.id;
        } catch (e) {
          console.error("Failed to create calendar event", e);
          toast({ title: "Error al crear evento en calendario", description: "La tarea se guardó en el CRM, pero no se pudo crear el evento en Google Calendar.", variant: "destructive" });
        }
      }
    }

    try {
        if (calendarEventId) {
            activityPayload.googleCalendarEventId = calendarEventId;
        }
        await createClientActivity(activityPayload);
        toast({ title: "Actividad Registrada" });
        if(onActivitySaved) onActivitySaved();
        resetForm();
        onOpenChange(false);
    } catch (error) {
        console.error("Error saving client activity:", error);
        toast({ title: "Error al guardar la actividad", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Actividad para {entity.name}</DialogTitle>
          <DialogDescription>
            Añade una nueva interacción o crea una tarea de seguimiento para este {entity.type === 'client' ? 'cliente' : 'prospecto'}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-2">
            <Label htmlFor="activity-type">Tipo de Actividad</Label>
            <Select value={newActivityType} onValueChange={(v) => setNewActivityType(v as ClientActivityType)}>
              <SelectTrigger id="activity-type">
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                {clientActivityTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-observation">Observación</Label>
            <Textarea
              id="activity-observation"
              value={newActivityObservation}
              onChange={(e) => setNewActivityObservation(e.target.value)}
              placeholder="Detalles de la interacción..."
              rows={4}
            />
          </div>
          {entity.type === 'client' && (
            <div className="space-y-2">
                <Label htmlFor="activity-opp">Oportunidad (Opcional)</Label>
                <Select value={newActivityOpportunityId} onValueChange={setNewActivityOpportunityId}>
                <SelectTrigger id="activity-opp">
                    <SelectValue placeholder="Asociar a una oportunidad..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {opportunities.map(opp => <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>)}
                </SelectContent>
                </Select>
            </div>
          )}
           <div className="flex items-center space-x-2 pt-2">
            <Checkbox id="is-task" checked={isTask} onCheckedChange={(checked) => setIsTask(!!checked)} />
            <Label htmlFor="is-task" className='font-normal'>Crear como Tarea/Recordatorio</Label>
          </div>
          {isTask && (
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-muted/50">
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
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
