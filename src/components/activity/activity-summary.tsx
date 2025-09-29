
'use client';

import React, { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { User, ActivityLog, ClientActivity, ClientActivityType } from '@/lib/types';
import { clientActivityTypes } from '@/lib/types';
import {
  Activity,
  ArrowRight,
  BuildingIcon,
  Kanban,
  MailIcon,
  MessageSquare,
  PhoneCall,
  PlusCircle,
  Users,
  Video,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import Link from 'next/link';

type CombinedActivity = (ActivityLog | ClientActivity) & { sortDate: Date };

interface ActivitySummaryProps {
  advisors: User[];
  systemActivities: ActivityLog[];
  clientActivities: ClientActivity[];
}

const activityGroupIcons: Record<string, React.ReactNode> = {
  'Llamada': <PhoneCall className="h-5 w-5" />,
  'WhatsApp': <MessageSquare className="h-5 w-5" />,
  'Meet': <Video className="h-5 w-5" />,
  'Reunión': <Users className="h-5 w-5" />,
  'Visita Aire': <BuildingIcon className="h-5 w-5" />,
  'Mail': <MailIcon className="h-5 w-5" />,
  'Nuevos Clientes': <PlusCircle className="h-5 w-5 text-green-500" />,
  'Nuevas Oportunidades': <PlusCircle className="h-5 w-5 text-blue-500" />,
  'Cambios de Etapa': <ArrowRight className="h-5 w-5 text-purple-500" />,
};

const ActivityDetailRow = ({ activity }: { activity: CombinedActivity }) => {
  return (
    <div className="flex items-center justify-between text-sm py-2 border-b last:border-b-0">
      <div className="flex-1">
        {'entityType' in activity 
          ? <span dangerouslySetInnerHTML={{ __html: activity.details }} />
          : <p>{activity.observation} en <Link href={`/clients/${activity.clientId}`} className="font-bold text-primary hover:underline">{activity.clientName}</Link></p>
        }
        <p className="text-xs text-muted-foreground">Por: {activity.userName}</p>
      </div>
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(activity.timestamp).toLocaleDateString()}
      </p>
    </div>
  )
};


export function ActivitySummary({ advisors, systemActivities, clientActivities }: ActivitySummaryProps) {
  
  const groupedActivities = useMemo(() => {
      const allActivities: CombinedActivity[] = [
        ...clientActivities.map(a => ({ ...a, sortDate: new Date(a.timestamp) })),
        ...systemActivities.map(a => ({ ...a, sortDate: new Date(a.timestamp) }))
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

      return Object.entries(groups).map(([title, activities]) => ({
        title,
        count: activities.length,
        activities
      })).filter(g => g.count > 0);

  }, [systemActivities, clientActivities]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Actividad</CardTitle>
        <CardDescription>Resumen de actividades del equipo para el período seleccionado.</CardDescription>
      </CardHeader>
      <CardContent>
          <Accordion type="multiple" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedActivities.map(({ title, count, activities }) => (
                  <AccordionItem key={title} value={title} className="border rounded-lg px-4 bg-muted/50">
                      <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex items-center gap-3">
                              {activityGroupIcons[title]}
                              <span className="font-semibold text-base">{title}</span>
                              <Badge variant="secondary">{count}</Badge>
                          </div>
                      </AccordionTrigger>
                      <AccordionContent className="bg-background -mx-4 px-4">
                          <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                              {activities.map(act => <ActivityDetailRow key={act.id} activity={act}/>)}
                          </div>
                      </AccordionContent>
                  </AccordionItem>
              ))}
          </Accordion>
           {groupedActivities.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No hay actividad para el período seleccionado.</p>
           )}
      </CardContent>
    </Card>
  );
}
