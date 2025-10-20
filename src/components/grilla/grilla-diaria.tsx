'use client';

import React, { useState } from 'react';
import type { Program, CommercialItem } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { CommercialItemFormDialog } from './commercial-item-form-dialog';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';

interface GrillaDiariaProps {
  date: Date;
  programs: Program[];
}

const statusColors: Record<CommercialItem['status'], string> = {
  'Disponible': 'bg-gray-200 text-gray-800',
  'Reservado': 'bg-yellow-200 text-yellow-800',
  'Vendido': 'bg-green-200 text-green-800',
};

// Mock data, to be replaced with Firebase data
const mockItems: CommercialItem[] = [
    { id: '1', programId: 'ahora-vengo', date: '2024-08-05', type: 'Pauta', description: 'Pauta 30s Coca-Cola', status: 'Vendido', clientName: 'Coca-Cola' },
    { id: '2', programId: 'ahora-vengo', date: '2024-08-05', type: 'Auspicio', description: 'Auspicio de Deportes', status: 'Disponible' },
    { id: '3', programId: 'pasan-cosas', date: '2024-08-05', type: 'Nota', description: 'Nota con intendente', status: 'Reservado', clientName: 'Municipalidad' },
];


export function GrillaDiaria({ date, programs }: GrillaDiariaProps) {
  const [items, setItems] = useState<CommercialItem[]>(mockItems);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const dayOfWeek = date.getDay();
  const programsForDay = programs.filter(p => p.daysOfWeek.includes(dayOfWeek));

  const handleAddItemClick = (programId: string) => {
    setSelectedProgramId(programId);
    setIsItemFormOpen(true);
  };
  
  const handleSaveItem = (item: Omit<CommercialItem, 'id' | 'date' | 'programId'>) => {
     if (!selectedProgramId) return;
     const newItem: CommercialItem = {
        ...item,
        id: `item-${Date.now()}`,
        programId: selectedProgramId,
        date: format(date, 'yyyy-MM-dd'),
     };
     setItems(prev => [...prev, newItem]);
  };


  return (
    <>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold capitalize">
          {format(date, "eeee, dd 'de' MMMM", { locale: es })}
        </h2>
        
        {programsForDay.length > 0 ? (
          programsForDay.map(program => {
            const programItems = items.filter(item => item.programId === program.id && item.date === format(date, 'yyyy-MM-dd'));
            return (
              <Card key={program.id}>
                <CardHeader className={cn("p-4 flex flex-row items-center justify-between", program.color)}>
                  <CardTitle className="text-lg">{program.name} <span className="font-normal text-sm">({program.startTime} - {program.endTime})</span></CardTitle>
                   <Button size="sm" variant="secondary" onClick={() => handleAddItemClick(program.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir
                    </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {programItems.length > 0 ? (
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
