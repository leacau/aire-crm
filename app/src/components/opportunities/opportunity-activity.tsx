
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ClientActivity, ClientActivityType, User } from '@/lib/types';
import { getClientActivities, createClientActivity, updateClientActivity, getAllUsers } from '@/lib/firebase-service';
import { sendEmail, createCalendarEvent, deleteCalendarEvent } from '@/lib/google-gmail-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { BellPlus, CalendarIcon, CheckCircle, Clock, Mail, MailIcon, MessageSquare, PhoneCall, Users, Video, BuildingIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { clientActivityTypes } from '@/lib/types';

const activityIcons: Record<ClientActivityType, React.ReactNode> = {
    'Llamada': <PhoneCall className="h-4 w-4" />,
    'WhatsApp': <MessageSquare className="h-4 w-4" />,
    'Meet': <Video className="h-4 w-4" />,
    'Reunión': <Users className="h-4 w-4" />,
    'Visita Aire': <BuildingIcon className="h-4 w-4" />,
    'Mail': <MailIcon className="h-4 w-4" />,
};

interface OpportunityActivityProps {
    opportunityId: string;
    clientId: string;
    clientName: string;
}

export function OpportunityActivity({ opportunityId, clientId, clientName }: OpportunityActivityProps) {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();

    const [activities, setActivities] = useState<ClientActivity[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const [newActivityType, setNewActivityType] = useState<ClientActivityType | ''>('');
    const [newActivityObservation, setNewActivityObservation] = useState('');
    const [isTask, setIsTask] = useState(false);
    const [dueDate, setDueDate] = useState<Date | undefined>();
    const [dueTime, setDueTime] = useState<string>('09:00');
    const [isSavingActivity, setIsSavingActivity] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);

    const fetchOpportunityActivities = useCallback(async () => {
        setLoading(true);
        try {
            const [oppActivities, allUsers] = await Promise.all([
                getClientActivities(clientId, opportunityId),
                getAllUsers(),
            ]);
            setActivities(oppActivities);
            setUsers(allUsers);
        } catch (error) {
            console.error("Error fetching opportunity activities:", error);
            toast({ title: "Error al cargar actividades", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [clientId, opportunityId, toast]);

    useEffect(() => {
        fetchOpportunityActivities();
    }, [fetchOpportunityActivities]);
    
    const usersMap = users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
    }, {} as Record<string, User>);
    
    const resetActivityForm = () => {
        setNewActivityType('');
        setNewActivityObservation('');
        setIsTask(false);
        setDueDate(undefined);
        setDueTime('09:00');
    };

    const combineDateAndTime = (date: Date, time: string): Date => {
        const [hours, minutes] = time.split(':').map(Number);
        return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
    };

    const handleSaveClientActivity = async () => {
        if (!newActivityType || !newActivityObservation.trim() || !userInfo) {
            toast({ title: "Datos incompletos", description: "Selecciona un tipo y añade una observación.", variant: 'destructive'});
            return;
        }
        if (isTask && (!dueDate || !dueTime)) {
            toast({ title: "Fecha y hora de vencimiento requeridas", variant: 'destructive'});
            return;
        }

        setIsSavingActivity(true);
        let finalDueDate: Date | undefined = isTask && dueDate ? combineDateAndTime(dueDate, dueTime) : undefined;
        
        const activityPayload: Omit<ClientActivity, 'id' | 'timestamp'> = {
            clientId,
            clientName,
            opportunityId,
            type: newActivityType,
            observation: newActivityObservation,
            userId: userInfo.id,
            userName: userInfo.name,
            isTask,
            completed: false,
            ...(isTask && finalDueDate && { dueDate: finalDueDate.toISOString() }),
        };

        let calendarEventId: string | undefined;
        if(activityPayload.isTask && activityPayload.dueDate) {
            const token = await getGoogleAccessToken();
            if (token) {
                try {
                    const createdEvent = await createCalendarEvent(token, {
                        summary: `Tarea CRM: ${activityPayload.observation}`,
                        description: `Tarea para la oportunidad relacionada con el cliente: ${clientName}.\n\nObservación: ${activityPayload.observation}`,
                        start: { dateTime: activityPayload.dueDate },
                        end: { dateTime: activityPayload.dueDate },
                    });
                    calendarEventId = createdEvent.id;
                } catch(e) {
                     console.error("Failed to create calendar event", e);
                     toast({ title: "Error al crear evento en calendario", variant: "destructive"});
                }
            }
        }

        try {
            if (calendarEventId) activityPayload.googleCalendarEventId = calendarEventId;
            await createClientActivity(activityPayload);
            toast({ title: "Actividad Registrada" });
            resetActivityForm();
            fetchOpportunityActivities();
        } catch (error) {
            toast({ title: "Error al guardar la actividad", variant: 'destructive'});
        } finally {
            setIsSavingActivity(false);
        }
    };
    
    const handleTaskCompleteToggle = async (activity: ClientActivity, currentStatus: boolean) => {
        if(!userInfo) return;
        const completed = !currentStatus;
        const payload: Partial<ClientActivity> = { 
            completed,
            ...(completed && {
                completedByUserId: userInfo.id,
                completedByUserName: userInfo.name,
            })
        };

        if(completed && activity.googleCalendarEventId) {
            const token = await getGoogleAccessToken();
            if (token) {
                try {
                    await deleteCalendarEvent(token, activity.googleCalendarEventId);
                    payload.googleCalendarEventId = null;
                } catch(e) { console.error("Failed to delete calendar event", e); }
            }
        }

        try {
            await updateClientActivity(activity.id, payload);
            fetchOpportunityActivities();
            toast({ title: `Tarea ${completed ? 'completada' : 'marcada como pendiente'}`});
        } catch (error) {
            toast({ title: "Error al actualizar la tarea", variant: 'destructive' });
        }
    };

    if (loading) return <div className="flex justify-center items-center h-40"><Spinner/></div>

    return (
        <div className="space-y-6">
             <div className="space-y-4 p-4 border rounded-md">
                <h4 className="font-medium">Nueva Actividad / Tarea</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Select value={newActivityType} onValueChange={(value) => setNewActivityType(value as ClientActivityType)}>
                        <SelectTrigger><SelectValue placeholder="Tipo de actividad" /></SelectTrigger>
                        <SelectContent>{clientActivityTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                    </Select>
                    <Textarea 
                        placeholder="Escribe una observación..." 
                        value={newActivityObservation}
                        onChange={(e) => setNewActivityObservation(e.target.value)}
                        className="sm:col-span-2"
                    />
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="is-task-opp" checked={isTask} onCheckedChange={(checked) => setIsTask(!!checked)} />
                        <Label htmlFor="is-task-opp" className='font-normal'>Crear como Tarea</Label>
                    </div>
                    {isTask && (
                        <div className="flex items-center gap-2">
                          <Popover>
                              <PopoverTrigger asChild>
                              <Button variant={"outline"} className={cn("w-[200px] justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dueDate ? format(dueDate, "PPP", { locale: es }) : <span>Fecha de vencimiento</span>}
                              </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus locale={es}/></PopoverContent>
                          </Popover>
                          <div className="relative">
                            <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="pl-8 w-[120px]" />
                           </div>
                        </div>
                    )}
                </div>
                 <Button onClick={handleSaveClientActivity} disabled={isSavingActivity}>
                    {isSavingActivity ? <><Spinner size="small" color="white" className="mr-2" /> Guardando...</> : "Guardar"}
                </Button>
            </div>
            
            <div className="mt-6 space-y-4">
                <h4 className="font-medium">Historial de Actividad</h4>
                {activities.map(activity => {
                    const userName = usersMap[activity.userId]?.name || activity.userName;
                    const completedByUserName = activity.completedByUserId ? (usersMap[activity.completedByUserId]?.name || activity.completedByUserName) : undefined;
                    return (
                        <div key={activity.id} className="flex items-start gap-3">
                            {activity.isTask && (
                                <Checkbox 
                                    id={`task-opp-${activity.id}`}
                                    checked={activity.completed}
                                    onCheckedChange={() => handleTaskCompleteToggle(activity, !!activity.completed)}
                                    className="mt-1"
                                />
                            )}
                            <div className={cn("p-2 bg-muted rounded-full", !activity.isTask && "mt-1")}>{activityIcons[activity.type]}</div>
                            <div className={cn('flex-1', activity.completed && 'line-through text-muted-foreground')}>
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm">{activity.type}</span>
                                    <span className="text-xs">{new Date(activity.timestamp).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm">{activity.observation}</p>
                                {activity.isTask && activity.dueDate && (
                                    <p className="text-xs mt-1 font-medium flex items-center">
                                        <CalendarIcon className="h-3 w-3 mr-1" />
                                        Vence: {format(new Date(activity.dueDate), "PPP p", { locale: es })}
                                    </p>
                                )}
                                <p className="text-xs mt-1">Registrado por: {userName}</p>
                                {activity.completed && activity.completedAt && (
                                    <div className='text-xs mt-1'>
                                        <p className='font-medium flex items-center text-green-600'>
                                        <CheckCircle className="h-3 w-3 mr-1"/>
                                        Finalizada: {format(new Date(activity.completedAt), "PPP", { locale: es })} por {completedByUserName}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {activities.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No hay actividades registradas para esta oportunidad.</p>}
            </div>
        </div>
    );
}
