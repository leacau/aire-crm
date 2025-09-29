
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { getActivities, getAllClientActivities, getAllUsers } from '@/lib/firebase-service';
import type { ActivityLog, ClientActivity, User } from '@/lib/types';
import { isWithinInterval } from 'date-fns';
import {
  Activity,
  ArrowRight,
  BuildingIcon,
  MailIcon,
  MessageSquare,
  PhoneCall,
  PlusCircle,
  Users,
  Video,
} from 'lucide-react';
import Link from 'next/link';

type CombinedActivity = (ActivityLog | ClientActivity) & { sortDate: Date };

const systemActivityIcons: Record<string, React.ReactNode> = {
  'create': <PlusCircle className="h-5 w-5 text-green-500" />,
  'update': <Activity className="h-5 w-5 text-blue-500" />,
  'stage_change': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const clientActivityIcons: Record<string, React.ReactNode> = {
    'Llamada': <PhoneCall className="h-5 w-5" />,
    'WhatsApp': <MessageSquare className="h-5 w-5" />,
    'Meet': <Video className="h-5 w-5" />,
    'Reunión': <Users className="h-5 w-5" />,
    'Visita Aire': <BuildingIcon className="h-5 w-5" />,
    'Mail': <MailIcon className="h-5 w-5" />,
};

const getDefaultIcon = () => <Activity className="h-5 w-5 text-muted-foreground" />;

export function ActivityFeed() {
  const { toast } = useToast();
  const [systemActivities, setSystemActivities] = useState<ActivityLog[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all');

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

  const filteredActivities = useMemo(() => {
    const combined: CombinedActivity[] = [
      ...systemActivities.map(a => ({ ...a, sortDate: new Date(a.timestamp) })),
      ...clientActivities.map(a => ({ ...a, sortDate: new Date(a.timestamp) }))
    ];

    return combined
      .filter(activity => {
        const isInDateRange = !dateRange?.from || !dateRange?.to || isWithinInterval(activity.sortDate, { start: dateRange.from, end: dateRange.to });
        const isBySelectedAdvisor = selectedAdvisor === 'all' || activity.userId === selectedAdvisor;
        return isInDateRange && isBySelectedAdvisor;
      })
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  }, [systemActivities, clientActivities, dateRange, selectedAdvisor]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const renderActivity = (activity: CombinedActivity) => {
    // System Activity
    if ('entityType' in activity) {
        return (
            <div key={activity.id} className="flex items-start gap-4">
                <div className="p-2 bg-muted rounded-full">
                    {systemActivityIcons[activity.type] || getDefaultIcon()}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <p className="text-sm" dangerouslySetInnerHTML={{ __html: activity.details }} />
                        <p className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(activity.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Por: {activity.userName || 'Usuario desconocido'}
                    </p>
                </div>
            </div>
        )
    }
    // Client Activity
    if ('clientId' in activity) {
        return (
             <div key={activity.id} className="flex items-start gap-4">
                <div className="p-2 bg-muted rounded-full">
                    {clientActivityIcons[activity.type] || getDefaultIcon()}
                </div>
                 <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{activity.type}</p>
                        <p className="text-sm text-muted-foreground whitespace-nowrap">
                             {new Date(activity.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                    <Link href={`/clients/${activity.clientId}`} className="text-sm font-bold text-primary hover:underline">
                        {activity.clientName}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1">{activity.observation}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Por: {activity.userName || 'Usuario desconocido'}
                    </p>
                </div>
            </div>
        )
    }

    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
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
        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {filteredActivities.length > 0 ? (
            filteredActivities.map(renderActivity)
          ) : (
            <p className="text-center text-muted-foreground">No hay actividades que coincidan con los filtros.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

