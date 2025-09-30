
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getCalendarEvents } from '@/lib/google-calendar-service';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CalendarEvent {
    id: string;
    summary: string;
    start: {
        dateTime: string;
        date: string;
    };
    end: {
        dateTime: string;
        date: string;
    };
    htmlLink: string;
}

export function GoogleCalendar() {
    const { getGoogleAccessToken } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            setError(null);
            const token = await getGoogleAccessToken();

            if (token) {
                try {
                    const eventItems = await getCalendarEvents(token);
                    setEvents(eventItems);
                } catch (err) {
                    console.error(err);
                    setError('No se pudieron cargar los eventos del calendario. Es posible que necesites volver a iniciar sesión.');
                }
            } else {
                setError('No se pudo obtener el permiso para acceder a Google Calendar. Por favor, intenta iniciar sesión de nuevo con Google.');
            }

            setLoading(false);
        };

        fetchEvents();
    }, [getGoogleAccessToken]);

    const handleRetry = async () => {
        setLoading(true);
        setError(null);
        const token = await getGoogleAccessToken();
        if (token) {
            try {
                const eventItems = await getCalendarEvents(token);
                setEvents(eventItems);
            } catch (err) {
                console.error(err);
                setError('No se pudieron cargar los eventos del calendario. Es posible que necesites volver a iniciar sesión.');
            }
        } else {
            setError('No se pudo obtener el permiso para acceder a Google Calendar.');
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Spinner size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="max-w-xl mx-auto">
                <CardHeader>
                    <CardTitle>Error de Calendario</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive mb-4">{error}</p>
                    <Button onClick={handleRetry}>Reintentar</Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Próximos Eventos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {events.length > 0 ? (
                        events.map(event => {
                            const startDate = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
                            const isAllDay = !event.start.dateTime;
                            return (
                                <div key={event.id} className="p-3 border rounded-lg hover:bg-muted/50">
                                    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                                        {event.summary}
                                    </a>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {isAllDay
                                            ? format(startDate, "PPP", { locale: es }) + " (Todo el día)"
                                            : format(startDate, "PPP p", { locale: es })
                                        }
                                    </p>
                                </div>
                            );
                        })
                    ) : (
                        <p>No se encontraron próximos eventos.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

