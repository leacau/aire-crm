
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Program, CommercialItem, Client } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getCommercialItems, getClients } from '@/lib/firebase-service';
import { Spinner } from '../ui/spinner';
import { useAuth } from '@/hooks/use-auth';
import { Building, CircleDollarSign, PlusCircle, InfoIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '../ui/button';

interface GrillaDiariaProps {
  date: Date;
  programs: Program[];
  canManage: boolean;
  onItemClick: (item: CommercialItem) => void;
  onAddItemClick: (programId: string, date: Date) => void;
}

const statusColors: Record<CommercialItem['status'], string> = {
  'Disponible': 'bg-gray-200 text-gray-800',
  'Reservado': 'bg-yellow-200 text-yellow-800',
  'Vendido': 'bg-green-200 text-green-800',
};

export function GrillaDiaria({ date, programs, canManage, onItemClick, onAddItemClick }: GrillaDiariaProps) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CommercialItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const formattedDate = format(date, 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
        const [fetchedItems, fetchedClients] = await Promise.all([
            getCommercialItems(formattedDate),
            getClients()
        ]);
        setItems(fetchedItems);
        setClients(fetchedClients);
    } catch (error) {
        console.error("Error fetching commercial items:", error);
        toast({ title: 'Error al cargar los elementos comerciales', variant: 'destructive' });
    } finally {
        setLoading(false);
    }
  }, [formattedDate, toast]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userClientIds = useMemo(() => {
    if (!userInfo || canManage) return null;
    return new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
  }, [clients, userInfo, canManage]);

  const canEditItem = (item: CommercialItem) => {
    if (canManage) return true;
    if (item.status === 'Disponible') return false; // Advisors cannot edit available items
    if (userClientIds && item.clientId) {
      return userClientIds.has(item.clientId);
    }
    return false;
  };


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
      
      {loading ? (
        <div className="flex justify-center items-center h-40"><Spinner size="large" /></div>
      ) : programsForDay.length > 0 ? (
        programsForDay.map(program => {
          const programItems = items.filter(item => item.programId === program.id);
          return (
            <Card key={program.id}>
              <CardHeader className={cn("p-3 sm:p-4 flex flex-row items-center justify-between", program.color)}>
                 <div className='flex-1 flex items-center gap-2'>
                    <Link href={`/grilla/${program.id}`} onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/10 hover:bg-black/20 text-white">
                            <InfoIcon className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className='cursor-pointer' onClick={() => onAddItemClick(program.id, date)}>
                        <CardTitle className="text-sm sm:text-lg">
                            {program.name} <span className="font-normal text-xs sm:text-sm">({program.schedule.startTime} - {program.schedule.endTime})</span>
                        </CardTitle>
                    </div>
                 </div>
                 {canManage && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/10 hover:bg-black/20" onClick={() => onAddItemClick(program.id, date)}>
                        <PlusCircle className="h-5 w-5 text-white" />
                    </Button>
                 )}
              </CardHeader>
              <CardContent className="p-2 sm:p-4 space-y-3">
                {programItems.length > 0 ? (
                   programItems.map(item => {
                     const isEditable = canEditItem(item);
                     return (
                      <div 
                        key={item.id} 
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-md border bg-muted/50 gap-2 sm:gap-4",
                          isEditable && "cursor-pointer hover:bg-muted/80"
                        )}
                        onClick={() => isEditable && onItemClick(item)}
                      >
                          <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{item.title || item.description}</p>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                                <p>{item.type}{item.bloque && ` - ${item.bloque}`}</p>
                                {item.clientName && (
                                  <Link href={`/clients/${item.clientId}`} className="flex items-center gap-1 hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                                    <Building className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.clientName}</span>
                                  </Link>
                                )}
                                 {item.opportunityTitle && (
                                   <p className="flex items-center gap-1 truncate">
                                    <CircleDollarSign className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.opportunityTitle}</span>
                                   </p>
                                )}
                              </div>
                          </div>
                          <Badge className={cn("self-start sm:self-center shrink-0", statusColors[item.status])}>{item.status}</Badge>
                      </div>
                     )
                   })
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
