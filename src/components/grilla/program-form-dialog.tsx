'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Program } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface ProgramFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (program: Omit<Program, 'id'>) => void;
  program?: Program | null;
}

const days = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
    { id: 6, label: 'Sábado' },
    { id: 0, label: 'Domingo' },
];

export function ProgramFormDialog({ isOpen, onOpenChange, onSave, program }: ProgramFormDialogProps) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [color, setColor] = useState('bg-gray-100');
  const { toast } = useToast();

  const handleDayChange = (dayId: number, checked: boolean | 'indeterminate') => {
    setDaysOfWeek(prev => 
      checked ? [...prev, dayId] : prev.filter(d => d !== dayId)
    );
  };

  const handleSave = () => {
    if (!name || !startTime || !endTime || daysOfWeek.length === 0) {
      toast({ title: "Campos incompletos", variant: 'destructive' });
      return;
    }
    onSave({ name, startTime, endTime, daysOfWeek, color });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{program ? 'Editar Programa' : 'Nuevo Programa'}</DialogTitle>
          <DialogDescription>
            Define un nuevo programa para la grilla comercial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="program-name">Nombre del Programa</Label>
                <Input id="program-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="start-time">Hora de Inicio</Label>
                    <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="end-time">Hora de Fin</Label>
                    <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
            </div>
             <div className="space-y-2">
                <Label>Días de Emisión</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {days.map(day => (
                        <div key={day.id} className="flex items-center space-x-2">
                            <Checkbox 
                                id={`day-${day.id}`} 
                                checked={daysOfWeek.includes(day.id)}
                                onCheckedChange={(checked) => handleDayChange(day.id, checked)}
                            />
                            <Label htmlFor={`day-${day.id}`} className="font-normal">{day.label}</Label>
                        </div>
                    ))}
                </div>
             </div>
             <div className="space-y-2">
                <Label>Color de Identificación</Label>
                {/* A simple color picker for now */}
                <div className="flex gap-2">
                   {['bg-blue-100', 'bg-red-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100', 'bg-pink-100'].map(c => (
                      <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ${c} ${color === c ? 'ring-2 ring-primary' : ''}`}></button>
                   ))}
                </div>
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Programa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
