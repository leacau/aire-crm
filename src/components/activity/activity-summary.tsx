
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ActivityLog, ClientActivity } from '@/lib/types';
import {
  BuildingIcon,
  MailIcon,
  MessageSquare,
  PhoneCall,
  PlusCircle,
  ArrowRight,
  Users,
  Video,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

export type CombinedActivity = (ActivityLog | ClientActivity) & { sortDate: Date };

interface ActivitySummaryProps {
  summary: { title: string; count: number }[];
  onActivityTypeSelect: (type: string) => void;
  selectedActivityType: string | null;
}

export const activityGroupIcons: Record<string, React.ReactNode> = {
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

export const ActivityDetailRow = ({ activity }: { activity: CombinedActivity }) => {
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


export function ActivitySummary({ summary, onActivityTypeSelect, selectedActivityType }: ActivitySummaryProps) {
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Actividad</CardTitle>
        <CardDescription>Resumen de actividades del equipo para el período seleccionado. Haz clic en una tarjeta para ver el detalle.</CardDescription>
      </CardHeader>
      <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.map(({ title, count }) => (
                  <Card 
                    key={title}
                    onClick={() => onActivityTypeSelect(title)}
                    className={cn(
                        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                        selectedActivityType === title && "border-primary shadow-md"
                    )}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium flex items-center gap-2">
                            {activityGroupIcons[title]}
                            <span>{title}</span>
                         </CardTitle>
                         <Badge variant="secondary">{count}</Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{count}</div>
                        <p className="text-xs text-muted-foreground">actividades</p>
                    </CardContent>
                  </Card>
              ))}
          </div>
           {summary.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No hay actividad para el período seleccionado.</p>
           )}
      </CardContent>
    </Card>
  );
}
