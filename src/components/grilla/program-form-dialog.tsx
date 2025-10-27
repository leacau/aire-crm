
'use client';

import React, { useState, useEffect } from 'react';
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
import type { Program, ProgramSchedule } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';

interface ProgramFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (program: Omit<Program, 'id'>) => void;
  program?: Program | null;
}

const days = [
    { id: 1, label: 'Lu' },
    { id: 2, label: 'Ma' },
    { id: 3, label: 'Mi' },
    { id: 4, label: 'Ju' },
    { id: 5, label: 'Vi' },
    { id: 6, label: 'Sá' },
    { id: 7, label: 'Do' },
];

export function ProgramFormDialog({ isOpen, onOpenChange, onSave, program }: ProgramFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedules, setSchedules] = useState<ProgramSchedule[]>([]);
  const [color, setColor] = useState('bg-gray-100');
  const [conductores, setConductores] = useState('');
  const [productores, setProductores] = useState('');
  const { toast } = useToast();

  const isEditing = !!program;

  useEffect(() => {
    if (isOpen) {
      if (program) {
        setName(program.name);
        setDescription(program.description || '');
        setSchedules(program.schedules || []);
        setColor(program.color);
        setConductores(program.conductores || '');
        setProductores(program.productores || '');
      } else {
        // Reset form for new program
        setName('');
        setDescription('');
        setSchedules([{ id: `sched-${Date.now()}`, daysOfWeek: [], startTime: '', endTime: '' }]);
        setColor('bg-gray-100');
        setConductores('');
        setProductores('');
      }
    }
  }, [program, isOpen]);

  const handleScheduleChange = (index: number, field: keyof ProgramSchedule, value: any) => {
    const newSchedules = [...schedules];
    // @ts-ignore
    newSchedules[index][field] = value;
    setSchedules(newSchedules);
  };
  
  const handleDayChange = (scheduleIndex: number, dayId: number, checked: boolean | 'indeterminate') => {
      const newSchedules = [...schedules];
      const currentDays = newSchedules[scheduleIndex].daysOfWeek;
      const newDays = checked 
          ? [...currentDays, dayId] 
          : currentDays.filter(d => d !== dayId);
      newSchedules[scheduleIndex].daysOfWeek = newDays.sort();
      setSchedules(newSchedules);
  }

  const addSchedule = () => {
    setSchedules([...schedules, { id: `sched-${Date.now()}`, daysOfWeek: [], startTime: '', endTime: '' }]);
  };

  const removeSchedule = (index: number) => {
    if (schedules.length > 1) {
        setSchedules(schedules.filter((_, i) => i !== index));
    }
  };

  const handleSave = () => {
    if (!name || schedules.some(s => !s.startTime || !s.endTime || s.daysOfWeek.length === 0)) {
      toast({ title: "Campos incompletos", description: "Nombre y al menos un horario completo son requeridos.", variant: 'destructive' });
      return;
    }
    // @ts-ignore
    onSave({ name, description, schedules, color, conductores, productores });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Programa' : 'Nuevo Programa'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del programa.' : 'Define un nuevo programa para la grilla comercial.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
            <div className="space-y-2">
                <Label htmlFor="program-name">Nombre del Programa</Label>
                <Input id="program-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            
            <div className="space-y-4">
                <Label>Horarios de Emisión</Label>
                {schedules.map((schedule, index) => (
                    <div key={schedule.id} className="p-3 border rounded-md space-y-3 bg-muted/50 relative">
                         {schedules.length > 1 && (
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => removeSchedule(index)}>
                                <Trash2 className="h-4 w-4 text-destructive"/>
                            </Button>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor={`start-time-${index}`}>Hora de Inicio</Label>
                                <Input id={`start-time-${index}`} type="time" value={schedule.startTime} onChange={(e) => handleScheduleChange(index, 'startTime', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`end-time-${index}`}>Hora de Fin</Label>
                                <Input id={`end-time-${index}`} type="time" value={schedule.endTime} onChange={(e) => handleScheduleChange(index, 'endTime', e.target.value)} />
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label>Días</Label>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {days.map(day => (
                                    <div key={day.id} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`day-${index}-${day.id}`} 
                                            checked={schedule.daysOfWeek.includes(day.id)}
                                            onCheckedChange={(checked) => handleDayChange(index, day.id, checked)}
                                        />
                                        <Label htmlFor={`day-${index}-${day.id}`} className="font-normal">{day.label}</Label>
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSchedule}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Añadir Horario
                </Button>
            </div>

             <div className="space-y-2">
                <Label htmlFor="conductores">Conductor(es)</Label>
                <Input id="conductores" value={conductores} onChange={(e) => setConductores(e.target.value)} placeholder="Ej: Juan Perez, Maria Gomez" />
            </div>
             <div className="space-y-2">
                <Label htmlFor="productores">Productor(es)</Label>
                <Input id="productores" value={productores} onChange={(e) => setProductores(e.target.value)} placeholder="Ej: Ana Garcia" />
            </div>
             <div className="space-y-2">
                <Label htmlFor="description">Descripción del Programa</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe brevemente el programa, su público, etc." />
            </div>
             <div className="space-y-2">
                <Label>Color de Identificación</Label>
                <div className="flex flex-wrap gap-2">
                   {[
                    'bg-red-100', 'bg-orange-100', 'bg-amber-100', 'bg-yellow-100', 'bg-lime-100', 'bg-green-100', 
                    'bg-emerald-100', 'bg-teal-100', 'bg-cyan-100', 'bg-sky-100', 'bg-blue-100', 'bg-indigo-100', 
                    'bg-violet-100', 'bg-purple-100', 'bg-fuchsia-100', 'bg-pink-100', 'bg-rose-100', 'bg-gray-100'
                   ].map(c => (
                      <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ${c} transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}></button>
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
