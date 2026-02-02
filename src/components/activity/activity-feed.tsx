'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button'; // Importar Button
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth'; // Importar useAuth
import { getActivities, getAllClientActivities, getAllUsers, completeActivityTask } from '@/lib/firebase-service'; // Importar completeActivityTask
import type { ActivityLog, ClientActivity, User } from '@/lib/types';
import { isWithinInterval, startOfMonth, endOfMonth, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActivitySummary } from './activity-summary';
import { CheckCircle2, Circle, User as UserIcon, Calendar, Clock } from 'lucide-react'; // Iconos
import { cn } from '@/lib/utils';

type CombinedActivity = (ActivityLog | ClientActivity) & { sortDate: Date };

export function ActivityFeed() {
  const { toast } = useToast();
  const { userInfo } = useAuth(); // Obtener usuario para completar tareas
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado para actualización optimista de tareas completadas
  const [localCompletedIds, setLocalCompletedIds] = useState<Set<string>>(new Set());

  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateRange: DateRange | undefined = useMemo(() => {
    return {
      from: startOfMonth(selectedDate),
      to: endOfMonth(selectedDate),
    };
  }, [selectedDate]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');
  const [selectedActivityType, setSelectedActivityType] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sysActivities, cliActivities, allAdvisors] = await Promise.all([
          getActivities(),
          getAllClientActivities(),
          getAllUsers('Asesor'),
        ]);
        setSystemActivities(sysActivities);
        setClientActivities(cliActivities);
        setAdvisors(allAdvisors);
      } catch (error) {
        console.error("Error fetching activity data:", error);
        toast({ title: 'Error al cargar las actividades', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const groupedActivities = useMemo(() => {
    const filterByDate = (activity: { timestamp: string }) => 
        !dateRange?.from || !dateRange?.to || isWithinInterval(new Date(activity.timestamp), { start: dateRange.from, end: dateRange.to });
    
    const activitiesByUser = (activity: { userId: string }) =>
        selectedAdvisor === 'all' || activity.userId === selectedAdvisor;

    const filteredSys = systemActivities.filter(filterByDate).filter(activitiesByUser);
    const filteredCli = clientActivities.filter(filterByDate).filter(activitiesByUser);
    
    const allActivities: CombinedActivity[] = [
      ...filteredCli.map(a => ({ ...a, sortDate: new Date(a.timestamp) })),
      ...filteredSys.map(a => ({ ...a, sortDate: new Date(a.timestamp) }))
    ].sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    
    const groups: Record<string, CombinedActivity[]> = {
      'Llamada': [],
      'WhatsApp': [],
      'Meet': [],
      'Reunión': [],
      'Visita Aire': [],
      'Mail': [],
      'Nuevos Clientes': [],
      'Nuevas Oportunidades': [],
      'Cambios de Etapa': [],
    };

    allActivities.forEach(activity => {
      if ('entityType' in activity) { // System Activity
        if (activity.type === 'create' && activity.entityType === 'client') {
          groups['Nuevos Clientes'].push(activity);
        } else if (activity.type === 'create' && activity.entityType === 'opportunity') {
          groups['Nuevas Oportunidades'].push(activity);
        } else if (activity.type === 'stage_change') {
          groups['Cambios de Etapa'].push(activity);
        }
      } else { // Client Activity
        if (groups[activity.type]) {
          groups[activity.type].push(activity);
        }
      }
    });

    const summary = Object.entries(groups).map(([title, activities]) => ({
      title,
      count: activities.length,
      activities
    })).filter(g => g.count > 0);

    return { summary, details: groups };

  }, [systemActivities, clientActivities, dateRange, selectedAdvisor]);

  const handleActivityTypeSelect = (type: string) => {
    setSelectedActivityType(prev => prev === type ? null : type);
  }

  // Función para completar tarea desde el feed
  const handleQuickComplete = async (activityId: string) => {
    if (!userInfo) return;

    setLocalCompletedIds(prev => new Set(prev).add(activityId));
    try {
        await completeActivityTask(activityId, userInfo.id, userInfo.name);
        toast({ title: "Tarea completada", description: "Se ha marcado como finalizada." });
        
        // Actualizar estado local para reflejar cambio permanente
        setClientActivities(prev => prev.map(a => 
            a.id === activityId ? { ...a, completed: true } : a
        ));
    } catch (error) {
        console.error(error);
        toast({ title: "Error al completar", variant: "destructive" });
        setLocalCompletedIds(prev => {
            const next = new Set(prev);
            next.delete(activityId);
            return next;
        });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const selectedActivities = selectedActivityType ? groupedActivities.details[selectedActivityType] : [];

  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row items-center gap-4">
         <MonthYearPicker date={selectedDate} onDateChange={setSelectedDate} />
          <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por asesor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los asesores</SelectItem>
              {advisors.map(advisor => (
                <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
      </div>

      <ActivitySummary 
        summary={groupedActivities.summary}
        onActivityTypeSelect={handleActivityTypeSelect}
        selectedActivityType={selectedActivityType}
      />
      
      {selectedActivityType && (
        <Card>
           <CardHeader>
              <CardTitle>{selectedActivityType}</CardTitle>
           </CardHeader>
           <CardContent>
               <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
                    {selectedActivities.length > 0 ? (
                        selectedActivities.map(act => {
                            // Determinar si es una tarea completable
                            const isTask = 'isTask' in act && act.isTask;
                            const isCompleted = ('completed' in act && act.completed) || localCompletedIds.has(act.id);
                            
                            return (
                                <div key={act.id} className="flex gap-3 p-3 border rounded-md items-start bg-card hover:bg-accent/10 transition-colors">
                                    <div className="mt-1">
                                        {isTask ? (
                                             <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn("h-5 w-5 rounded-full p-0", 
                                                    isCompleted ? "text-green-500 hover:text-green-600" : "text-muted-foreground hover:text-green-500"
                                                )}
                                                disabled={isCompleted}
                                                onClick={() => handleQuickComplete(act.id)}
                                                title={isCompleted ? "Completada" : "Marcar como completa"}
                                            >
                                                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                                            </Button>
                                        ) : (
                                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                                <UserIcon className="h-3 w-3 text-primary" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between items-start">
                                            <span className={cn("font-medium text-sm", isCompleted && "line-through text-muted-foreground")}>
                                                {'title' in act ? act.title : act.details}
                                            </span>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                                {format(parseISO(act.timestamp), "P p", { locale: es })}
                                            </span>
                                        </div>
                                        
                                        <div className="text-xs text-muted-foreground">
                                            <span className="font-semibold">{act.userName}</span>
                                            {'clientName' in act && act.clientName && (
                                                <span> • {act.clientName}</span>
                                            )}
                                        </div>

                                        {'details' in act && (
                                            <div className="text-xs text-muted-foreground/80 line-clamp-2" dangerouslySetInnerHTML={{ __html: act.details || '' }} />
                                        )}
                                        {'observation' in act && act.observation && (
                                            <p className="text-xs text-muted-foreground/80 line-clamp-2">{act.observation}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-center text-muted-foreground py-4">No hay actividades para mostrar.</p>
                    )}
               </div>
           </CardContent>
        </Card>
      )}

    </div>
  );
}
