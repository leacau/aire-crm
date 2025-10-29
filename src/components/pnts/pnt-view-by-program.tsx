
'use client';

import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Program, CommercialItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CheckCircle, Mic, Star, FileText, PlusCircle, Group } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface PntViewByProgramProps {
    programs: (Program & { pnts: CommercialItem[], notas: CommercialItem[], auspicios: Record<string, CommercialItem[]> })[];
    onItemClick: (item: CommercialItem) => void;
    onAddItemClick: (programId: string) => void;
}

interface PntItemRowProps {
  item: CommercialItem;
  onClick: (item: CommercialItem) => void;
}

const PntItemRow: React.FC<PntItemRowProps> = ({ item, onClick }) => {
  const isRead = !!item.pntRead;
  let Icon = Mic;
  if (item.type === 'Auspicio') Icon = Star;
  if (item.type === 'Nota') Icon = FileText;

  return (
    <div 
      className={cn(
        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/80",
        isRead ? "bg-muted/50 text-muted-foreground" : "bg-background"
      )}
      onClick={() => onClick(item)}
    >
      {isRead && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
      {!isRead && <Icon className="h-5 w-5 text-primary flex-shrink-0" />}
      <div className="flex-1 space-y-1 overflow-hidden">
        <p className={cn("font-semibold leading-none truncate", isRead && "line-through")}>
            {item.title || item.description}
        </p>
        <div className="flex items-center gap-4 text-xs">
          <p>{item.type}</p>
          {item.clientName && <p className="text-muted-foreground truncate">Cliente: {item.clientName}</p>}
        </div>
      </div>
        {isRead && item.pntReadAt && (
            <p className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(item.pntReadAt), 'HH:mm')}hs
            </p>
        )}
    </div>
  );
};

export function PntViewByProgram({ programs, onItemClick, onAddItemClick }: PntViewByProgramProps) {
    const [selectedProgramId, setSelectedProgramId] = useState<string | undefined>();

    const selectedProgram = programs.find(p => p.id === selectedProgramId);

    return (
        <div className="space-y-4">
            <Select onValueChange={setSelectedProgramId}>
                <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Selecciona un programa para ver sus pautas..." />
                </SelectTrigger>
                <SelectContent>
                    {programs.map(program => (
                        <SelectItem key={program.id} value={program.id}>
                            {program.name} ({program.schedule.startTime} - {program.schedule.endTime})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {selectedProgram ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{selectedProgram.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                         {Object.keys(selectedProgram.auspicios).length === 0 && selectedProgram.notas.length === 0 && selectedProgram.pnts.length === 0 ? (
                             <p className="text-center text-sm text-muted-foreground py-4">No hay pautas para este programa.</p>
                        ) : (
                            <>
                            {Object.entries(selectedProgram.auspicios).map(([bloque, items]) => (
                                <div key={bloque} className="space-y-2">
                                    <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><Group className="h-4 w-4"/> Auspicios: {bloque}</h4>
                                    {items.map(item => <PntItemRow key={item.id} item={item} onClick={onItemClick} />)}
                                </div>
                            ))}
                             {selectedProgram.notas.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><FileText className="h-4 w-4"/> Notas</h4>
                                    {selectedProgram.notas.map(item => <PntItemRow key={item.id} item={item} onClick={onItemClick} />)}
                                </div>
                            )}
                            {selectedProgram.pnts.length > 0 && (
                                <div className="space-y-2 pt-2">
                                     <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><Mic className="h-4 w-4"/> PNTs</h4>
                                    {selectedProgram.pnts.map(item => <PntItemRow key={item.id} item={item} onClick={onItemClick} />)}
                                </div>
                            )}
                            </>
                        )}
                         <div className="flex justify-center p-3 border-t">
                            <Button variant="outline" size="sm" onClick={() => onAddItemClick(selectedProgram.id)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Nuevo en este Programa
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-8 border-2 border-dashed rounded-lg">
                    <h3 className="text-xl font-semibold">Selecciona un Programa</h3>
                    <p className="text-muted-foreground mt-2">Elige un programa de la lista para ver sus pautas del día.</p>
                </div>
            )}
        </div>
    );
}
