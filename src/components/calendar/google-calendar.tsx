'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getCalendarEvents } from '@/lib/google-calendar-service';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-gmail-service';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as BigCalendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { CalendarToolbar } from './calendar-toolbar';
import { getUserProfile } from '@/lib/firebase-service';


const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { locale: es }),
  getDay,
  locales,
});

interface CalendarEvent {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string;
  resource?: any;
}

interface EventFormData {
  title: string;
  start: Date;
  end: Date;
  description: string;
}

interface GoogleCalendarProps {
    selectedUserId?: string;
}

export function GoogleCalendar({ selectedUserId }: GoogleCalendarProps) {
  const { userInfo, ensureGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState<Partial<EventFormData>>({});
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);


  const fetchEvents = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    setError(null);
    
    let calendarId = 'primary';
    if (selectedUserId && selectedUserId !== userInfo.id) {
        const userToView = await getUserProfile(selectedUserId);
        if (userToView?.email) {
            calendarId = userToView.email;
        } else {
            setError(`No se pudo encontrar el email para el usuario seleccionado.`);
            setLoading(false);
            return;
        }
    }

    // Usamos ensureGoogleAccessToken para garantizar que hay token o pedirlo
    const token = await ensureGoogleAccessToken();

    if (token) {
      try {
        const eventItems = await getCalendarEvents(token, calendarId);
        const formattedEvents = eventItems.map((item: any) => ({
          id: item.id,
          title: item.summary,
          start: new Date(item.start.dateTime || item.start.date),
          end: new Date(item.end.dateTime || item.end.date),
          description: item.description,
          resource: item,
        }));
        setEvents(formattedEvents);
      } catch (err: any) {
        console.error(err);
        setError(`No se pudieron cargar los eventos del calendario. Detalle: ${err.message}`);
      }
    } else {
      setError('Se requiere acceso a Google Calendar. Por favor, recarga la página o intenta más tarde.');
    }
    setLoading(false);
  }, [ensureGoogleAccessToken, userInfo, selectedUserId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    // Disable creating events on other people's calendars
    if(selectedUserId && selectedUserId !== userInfo?.id) return;
    
    setSelectedEvent(null);
    setIsReadOnly(false);
    setFormData({ start, end, title: '', description: '' });
    setIsDialogOpen(true);
  }, [selectedUserId, userInfo?.id]);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    const readOnly = selectedUserId && selectedUserId !== userInfo?.id;
    
    setSelectedEvent(event);
    setIsReadOnly(Boolean(readOnly));
    setFormData({
      start: event.start,
      end: event.end,
      title: event.title,
      description: event.description,
    });
    setIsDialogOpen(true);
  }, [selectedUserId, userInfo?.id]);
  
  const handleSaveEvent = async () => {
    const token = await ensureGoogleAccessToken();
    if (!token || !formData.title || !formData.start || !formData.end) {
      toast({ title: "Datos incompletos o falta autorización", variant: 'destructive'});
      return;
    }

    try {
      if (selectedEvent?.id) {
        await deleteCalendarEvent(token, selectedEvent.id);
      }
      
      const eventToSave = {
        summary: formData.title,
        description: formData.description || '',
        start: { dateTime: formData.start.toISOString() },
        end: { dateTime: formData.end.toISOString() },
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 10 },
                { method: 'popup', minutes: (24 * 60) }, // 24 hours
            ]
        }
      };

      await createCalendarEvent(token, eventToSave);
      toast({ title: 'Evento guardado correctamente'});
      setIsDialogOpen(false);
      fetchEvents(); // Refresh events from google
    } catch(err: any) {
      console.error(err);
      toast({ title: 'Error al guardar el evento', description: err.message, variant: 'destructive'});
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;
    const token = await ensureGoogleAccessToken();
    if (!token) return;

    try {
      await deleteCalendarEvent(token, selectedEvent.id);
      toast({ title: 'Evento eliminado' });
      setIsDialogOpen(false);
      fetchEvents();
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error al eliminar el evento', description: err.message, variant: 'destructive' });
    }
  }


  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardHeader><CardTitle>Estado del Calendario</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchEvents}>Reintentar conexión</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="h-full p-4">
        <BigCalendar
          culture='es'
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          date={date}
          onNavigate={setDate}
          view={view}
          onView={setView}
          components={{
            toolbar: (toolbarProps) => <CalendarToolbar {...toolbarProps} />
          }}
          messages={{
            next: "Siguiente",
            previous: "Anterior",
            today: "Hoy",
            month: "Mes",
            week: "Semana",
            day: "Día",
            agenda: "Agenda",
            date: "Fecha",
            time: "Hora",
            event: "Evento",
            noEventsInRange: "No hay eventos en este rango.",
            showMore: total => `+ Ver más (${total})`
          }}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent ? (isReadOnly ? 'Detalles del Evento' : 'Editar Evento') : 'Crear Nuevo Evento'}</DialogTitle>
            <DialogDescription>
              {selectedEvent 
                ? (isReadOnly ? 'Viendo los detalles de un evento del calendario.' : 'Edita los detalles de tu evento.') 
                : 'Completa los detalles para crear un nuevo evento en tu Google Calendar.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                    id="title"
                    value={formData.title || ''}
                    onChange={(e) => setFormData(p => ({...p, title: e.target.value}))}
                    readOnly={isReadOnly}
                />
            </div>
             <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(p => ({...p, description: e.target.value}))}
                    readOnly={isReadOnly}
                />
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="start">Inicio</Label>
                    <Input
                        id="start"
                        type="datetime-local"
                        value={formData.start && !isNaN(new Date(formData.start).valueOf()) ? format(new Date(formData.start), "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(e) => setFormData(p => ({...p, start: new Date(e.target.value)}))}
                        readOnly={isReadOnly}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="end">Fin</Label>
                    <Input
                        id="end"
                        type="datetime-local"
                        value={formData.end && !isNaN(new Date(formData.end).valueOf()) ? format(new Date(formData.end), "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(e) => setFormData(p => ({...p, end: new Date(e.target.value)}))}
                        readOnly={isReadOnly}
                    />
                </div>
             </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {selectedEvent && !isReadOnly ? (
                <Button variant="destructive" onClick={handleDeleteEvent}>Eliminar</Button>
            ) : <div />}
            <div className='flex gap-2'>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cerrar</Button>
              {!isReadOnly && <Button onClick={handleSaveEvent}>Guardar</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
