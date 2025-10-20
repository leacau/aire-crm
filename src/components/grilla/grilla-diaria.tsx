'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Program, CommercialItem } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { CommercialItemFormDialog } from './commercial-item-form-dialog';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { saveCommercialItem, getCommercialItems } from '@/lib/firebase-service';
import { Spinner } from '../ui/spinner';
import { useAuth } from '@/hooks/use-auth';

interface GrillaDiariaProps {
  date: Date;
  programs: Program[];
  canManage: boolean;
}

const statusColors: Record<CommercialItem['status'], string> = {
  'Disponible': 'bg-gray-200 text-gray-800',
  'Reservado': 'bg-yellow-200 text-yellow-800',
  'Vendido': 'bg-green-200 text-green-800',
};

export function GrillaDiaria({ date, programs, canManage }: GrillaDiariaProps) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CommercialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

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


  const handleAddItemClick = (programId: string) => {
    setSelectedProgramId(programId);
    setIsItemFormOpen(true);
  };
  
  const handleSaveItem = async (item: Omit<CommercialItem, 'id' | 'date' | 'programId'>) => {
     if (!selectedProgramId || !userInfo) return;
     try {
        const newItemData: Omit<CommercialItem, 'id'> = {
            ...item,
            programId: selectedProgramId,
            date: formattedDate,
        };
        await saveCommercialItem(newItemData, userInfo.id);
        toast({ title: 'Elemento comercial guardado' });
        fetchItems(); // Refresca los items del día
     } catch (error) {
        console.error("Error saving commercial item:", error);
        toast({ title: 'Error al guardar el elemento', variant: 'destructive' });
     }
  };


  const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Adjust Sunday
  const programsForDay = programs
    .filter(p => p.daysOfWeek.includes(dayOfWeek))
    .sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <>
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
                  <CardTitle className="text-lg">{program.name} <span className="font-normal text-sm">({program.startTime} - {program.endTime})</span></CardTitle>
                   {canManage && (
                    <Button size="sm" variant="secondary" onClick={() => handleAddItemClick(program.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir
                    </Button>
                   )}
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {loadingItems ? (
                     <div className="flex justify-center items-center h-20"><Spinner /></div>
                  ) : programItems.length > 0 ? (
                     programItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                            <div>
                                <p className="font-medium">{item.description}</p>
                                <p className="text-xs text-muted-foreground">{item.type} {item.clientName ? `- ${item.clientName}`: ''}</p>
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
      <CommercialItemFormDialog
        isOpen={isItemFormOpen}
        onOpenChange={setIsItemFormOpen}
        onSave={handleSaveItem}
      />
    </>
  );
}
