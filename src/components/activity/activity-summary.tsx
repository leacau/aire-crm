
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { User, ActivityLog, ClientActivity } from '@/lib/types';
import { clientActivityTypes } from '@/lib/types';

interface ActivitySummaryProps {
  advisors: User[];
  systemActivities: ActivityLog[];
  clientActivities: ClientActivity[];
}

interface AdvisorStats {
  name: string;
  activities: Record<string, number>;
  clientsCreated: number;
  clientsWorked: number;
}

export function ActivitySummary({ advisors, systemActivities, clientActivities }: ActivitySummaryProps) {
  
  const stats = useMemo(() => {
    const advisorStats: Record<string, AdvisorStats> = {};

    advisors.forEach(advisor => {
      advisorStats[advisor.id] = {
        name: advisor.name,
        activities: Object.fromEntries(clientActivityTypes.map(type => [type, 0])),
        clientsCreated: 0,
        clientsWorked: 0,
      };
    });

    const workedClientsByAdvisor: Record<string, Set<string>> = {};
    advisors.forEach(a => workedClientsByAdvisor[a.id] = new Set());

    // Process client activities
    clientActivities.forEach(activity => {
      if (advisorStats[activity.userId]) {
        advisorStats[activity.userId].activities[activity.type]++;
        workedClientsByAdvisor[activity.userId].add(activity.clientId);
      }
    });

    // Process system activities
    systemActivities.forEach(activity => {
      if (advisorStats[activity.userId]) {
        if (activity.entityType === 'client' && activity.type === 'create') {
          advisorStats[activity.userId].clientsCreated++;
        }
        if (activity.entityId) {
            workedClientsByAdvisor[activity.userId].add(activity.entityId);
        }
      }
    });

    advisors.forEach(advisor => {
        advisorStats[advisor.id].clientsWorked = workedClientsByAdvisor[advisor.id].size;
    });

    const totalStats: AdvisorStats = {
      name: 'Total',
      activities: Object.fromEntries(clientActivityTypes.map(type => [type, 0])),
      clientsCreated: 0,
      clientsWorked: 0,
    };
    
    let totalWorkedClients = new Set<string>();

    Object.values(advisorStats).forEach(stat => {
        clientActivityTypes.forEach(type => {
            totalStats.activities[type] += stat.activities[type];
        });
        totalStats.clientsCreated += stat.clientsCreated;
    });
    
    Object.values(workedClientsByAdvisor).forEach(clientSet => {
        clientSet.forEach(clientId => totalWorkedClients.add(clientId));
    });
    totalStats.clientsWorked = totalWorkedClients.size;


    return {
        advisorStats: Object.values(advisorStats),
        totalStats,
    };

  }, [advisors, systemActivities, clientActivities]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Actividad</CardTitle>
        <CardDescription>Estadísticas de rendimiento del equipo para el período seleccionado.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold">Asesor</TableHead>
                {clientActivityTypes.map(type => (
                  <TableHead key={type} className="text-right">{type}</TableHead>
                ))}
                <TableHead className="text-right font-bold">Clientes Creados</TableHead>
                <TableHead className="text-right font-bold">Clientes Trabajados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.advisorStats.map((stat) => (
                <TableRow key={stat.name}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  {clientActivityTypes.map(type => (
                     <TableCell key={type} className="text-right">{stat.activities[type]}</TableCell>
                  ))}
                  <TableCell className="text-right">{stat.clientsCreated}</TableCell>
                  <TableCell className="text-right">{stat.clientsWorked}</TableCell>
                </TableRow>
              ))}
               <TableRow className="bg-muted/50 font-bold">
                  <TableCell>{stats.totalStats.name}</TableCell>
                   {clientActivityTypes.map(type => (
                     <TableCell key={type} className="text-right">{stats.totalStats.activities[type]}</TableCell>
                  ))}
                  <TableCell className="text-right">{stats.totalStats.clientsCreated}</TableCell>
                  <TableCell className="text-right">{stats.totalStats.clientsWorked}</TableCell>
                </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
