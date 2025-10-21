'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Program, CommercialItem } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getCommercialItems } from '@/lib/firebase-service';
import { Spinner } from '../ui/spinner';
import { useAuth } from '@/hooks/use-auth';
import { Building, CircleDollarSign } from 'lucide-react';
import Link from 'next/link';

interface GrillaDiariaProps {
  date: Date;
  programs: Program[];
  canManage: boolean;
  onAddItem: (programId: string, date: Date) => void;
}

const statusColors: Record<CommercialItem['status'], string> = {
  'Disponible': 'bg-gray-200 text-gray-800',
  'Reservado': 'bg-yellow-200 text-yellow-800',
  'Vendido': 'bg-green-200 text-green-800',
};

export function GrillaDiaria({ date, programs, canManage, onAddItem }: GrillaDiariaProps) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CommercialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const formattedDate = format(date, 'yyyy-MM-dd');

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    try {
        const fetchedItems = await getCommercialItems(formattedDate);
        setItems(fetchedItems);
    } catch (error) {
        console.error("Error fetching commercial items:", error);
        toast({ title: 'Error al cargar los elementos comerciales', variant: 'destructive' });
    } finally {
        setLoadingItems(false);
    }
  }, [formattedDate, toast]);
  
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);


  const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Adjust Sunday
  const programsForDay = programs
    .filter(p => p.schedules.some(s => s.daysOfWeek.includes(dayOfWeek)))
    .map(p => {
        const scheduleForDay = p.schedules.find(s => s.daysOfWeek.includes(dayOfWeek));
        return { ...p, schedule: scheduleForDay! };
    })
    .sort((a,b) => a.schedule.startTime.localeCompare(b.schedule.startTime));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold capitalize">
        {format(date, "eeee, dd 'de' MMMM", { locale: es })}
      </h2>
      
      {programsForDay.length > 0 ? (
        programsForDay.map(program => {
          const programItems = items.filter(item => item.programId === program.id);
          return (
            <Card key={program.id}>
              <CardHeader className={cn("p-4 flex flex-row items-center justify-between", program.color)}>
                 <CardTitle 
                    className={cn("text-lg", canManage && "cursor-pointer hover:underline")}
                    onClick={() => canManage && onAddItem(program.id, date)}
                 >
                    {program.name} <span className="font-normal text-sm">({program.schedule.startTime} - {program.schedule.endTime})</span>
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {loadingItems ? (
                   <div className="flex justify-center items-center h-20"><Spinner /></div>
                ) : programItems.length > 0 ? (
                   programItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                          <div>
                              <p className="font-medium">{item.description}</p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                <p>{item.type}</p>
                                {item.clientName && (
                                  <Link href={`/clients/${item.clientId}`} className="flex items-center gap-1 hover:underline">
                                    <Building className="h-3 w-3" />
                                    {item.clientName}
                                  </Link>
                                )}
                                 {item.opportunityTitle && (
                                   <p className="flex items-center gap-1">
                                    <CircleDollarSign className="h-3 w-3" />
                                    {item.opportunityTitle}
                                   </p>
                                )}
                              </div>
                          </div>
                          <Badge className={statusColors[item.status]}>{item.status}</Badge>
                      </div>
                   ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay elementos comerciales cargados para este programa.</p>
                )}
              </CardContent>
            </Card>
          )
        })
      ) : (
        <p>No hay programas para este día.</p>
      )}
    </div>
  );
}
