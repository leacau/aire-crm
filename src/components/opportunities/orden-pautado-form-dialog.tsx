
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { OrdenPautado, PautaType, Program } from '@/lib/types';
import { pautaTypes } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '../ui/calendar';
import type { DateRange } from 'react-day-picker';

interface OrdenPautadoFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (orden: OrdenPautado) => void;
  orden?: OrdenPautado | null;
  programs: Program[];
}

const daysOfWeek = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
    { id: 6, label: 'Sábado' },
    { id: 7, label: 'Domingo' },
];

export function OrdenPautadoFormDialog({ isOpen, onOpenChange, onSave, orden, programs }: OrdenPautadoFormDialogProps) {
  const [formData, setFormData] = useState<Partial<OrdenPautado>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      if (orden) {
        setFormData(orden);
        setDateRange({
            from: orden.fechaInicio ? new Date(orden.fechaInicio) : undefined,
            to: orden.fechaFin ? new Date(orden.fechaFin) : undefined,
        })
      } else {
        setFormData({
            id: `op-${Date.now()}`,
            tipoPauta: 'Spot',
            dias: [],
            programas: [],
            repeticiones: 1,
            segundos: 0,
            textoPNT: '',
            textoPNTaprobado: false,
        });
        setDateRange(undefined);
      }
    }
  }, [isOpen, orden]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
     const target = e.target as HTMLInputElement;

    if (type === 'checkbox') {
        setFormData(prev => ({...prev, [name]: target.checked}));
    } else if (type === 'number') {
        setFormData(prev => ({...prev, [name]: Number(value) }));
    } else {
        setFormData(prev => ({...prev, [name]: value}));
    }
  }

  const handleDayChange = (dayId: number, checked: boolean | 'indeterminate') => {
      setFormData(prev => {
          const currentDays = prev.dias || [];
          const newDays = checked 
              ? [...currentDays, dayId]
              : currentDays.filter(d => d !== dayId);
          return { ...prev, dias: newDays.sort() };
      });
  }

  const handleSave = () => {
    if (!formData.tipoPauta || !formData.programas || formData.programas.length === 0) {
        toast({ title: "Datos incompletos", description: "El tipo de pauta y al menos un programa son requeridos.", variant: "destructive"});
        return;
    }

    const finalData: OrdenPautado = {
        ...formData,
        fechaInicio: dateRange?.from?.toISOString(),
        fechaFin: dateRange?.to?.toISOString(),
    } as OrdenPautado;
    
    onSave(finalData);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{orden ? 'Editar' : 'Nueva'} Orden de Pauta</DialogTitle>
          <DialogDescription>
            Define los detalles de la pauta publicitaria.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-4 -mr-4 grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tipoPauta">Tipo de Pauta</Label>
            <Select value={formData.tipoPauta} onValueChange={(v: PautaType) => setFormData(p => ({...p, tipoPauta: v}))}>
                <SelectTrigger id="tipoPauta"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {pautaTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Vigencia de la Campaña</Label>
             <Popover>
                <PopoverTrigger asChild>
                <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                    dateRange.to ? (
                        <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                        </>
                    ) : (
                        format(dateRange.from, "LLL dd, y")
                    )
                    ) : (
                    <span>Selecciona un rango</span>
                    )}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                />
                </PopoverContent>
            </Popover>
          </div>
          
           <div className="space-y-2">
                <Label>Días de Repetición</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 border rounded-md">
                    {daysOfWeek.map(day => (
                        <div key={day.id} className="flex items-center space-x-2">
                            <Checkbox 
                                id={`day-${day.id}`} 
                                checked={formData.dias?.includes(day.id)}
                                onCheckedChange={(checked) => handleDayChange(day.id, checked)}
                            />
                            <Label htmlFor={`day-${day.id}`} className="font-normal">{day.label}</Label>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Programas</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border rounded-md max-h-48 overflow-y-auto">
                    {programs.map(prog => (
                        <div key={prog.id} className="flex items-center space-x-2">
                             <Checkbox 
                                id={`prog-${prog.id}`} 
                                checked={formData.programas?.includes(prog.name)}
                                onCheckedChange={checked => {
                                    setFormData(prev => {
                                        const currentProgs = prev.programas || [];
                                        const newProgs = checked ? [...currentProgs, prog.name] : currentProgs.filter(p => p !== prog.name);
                                        return {...prev, programas: newProgs};
                                    });
                                }}
                            />
                            <Label htmlFor={`prog-${prog.id}`} className="font-normal">{prog.name}</Label>
                        </div>
                    ))}
                </div>
            </div>

            {formData.tipoPauta === 'Spot' && (
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="segundos">Duración (segundos)</Label>
                        <Input id="segundos" name="segundos" type="number" value={formData.segundos || ''} onChange={handleChange} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="repeticiones">Repeticiones por Día</Label>
                        <Input id="repeticiones" name="repeticiones" type="number" value={formData.repeticiones || ''} onChange={handleChange} />
                    </div>
                </div>
            )}

            {(formData.tipoPauta === 'PNT' || formData.tipoPauta === 'Sorteo' || formData.tipoPauta === 'Nota') && (
                <div className="space-y-2">
                    <Label htmlFor="repeticiones">Repeticiones por Día</Label>
                    <Input id="repeticiones" name="repeticiones" type="number" value={formData.repeticiones || ''} onChange={handleChange} />
                </div>
            )}
            
            {formData.tipoPauta === 'PNT' && (
                 <div className="space-y-2">
                    <Label htmlFor="textoPNT">Glosa / Texto del PNT (Opcional)</Label>
                    <Textarea id="textoPNT" name="textoPNT" value={formData.textoPNT || ''} onChange={handleChange} />
                    <div className="flex items-center space-x-2">
                        <Checkbox id="textoPNTaprobado" name="textoPNTaprobado" checked={formData.textoPNTaprobado} onCheckedChange={(c) => setFormData(p => ({...p, textoPNTaprobado: !!c}))}/>
                        <Label htmlFor="textoPNTaprobado" className="font-normal">Texto Aprobado para grilla</Label>
                    </div>
                 </div>
            )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
