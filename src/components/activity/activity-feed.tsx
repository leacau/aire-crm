
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { getActivities, getAllClientActivities, getAllUsers } from '@/lib/firebase-service';
import type { ActivityLog, ClientActivity, User } from '@/lib/types';
import { isWithinInterval } from 'date-fns';
import { ActivityDetailRow, ActivitySummary } from './activity-summary';

type CombinedActivity = (ActivityLog | ClientActivity) & { sortDate: Date };

export function ActivityFeed() {
  const { toast } = useToast();
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
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
         <DateRangePicker date={dateRange} onDateChange={setDateRange} />
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
                        selectedActivities.map(act => <ActivityDetailRow key={act.id} activity={act}/>)
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
