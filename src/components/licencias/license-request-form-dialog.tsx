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
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays, isSaturday, isSunday, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { User, VacationRequest } from '@/lib/types';
import { getSystemHolidays, calculateBusinessDays } from '@/lib/firebase-service'; // Importar helper

interface LicenseRequestFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (requestData: Omit<VacationRequest, 'id' | 'status'>) => void;
  currentUser: User;
}

export function LicenseRequestFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  currentUser,
}: LicenseRequestFormDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [returnDate, setReturnDate] = useState<Date | undefined>();
  const [holidays, setHolidays] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calculatedDays, setCalculatedDays] = useState(0);
  const { toast } = useToast();

  // Cargar feriados al abrir
  useEffect(() => {
    if (isOpen) {
        getSystemHolidays().then(setHolidays).catch(console.error);
        setStartDate(undefined);
        setReturnDate(undefined);
        setCalculatedDays(0);
    }
  }, [isOpen]);

  // Recalcular días cuando cambian las fechas
  useEffect(() => {
    if (startDate && returnDate) {
        if (returnDate <= startDate) {
            setCalculatedDays(0);
            return;
        }
        const days = calculateBusinessDays(
            format(startDate, 'yyyy-MM-dd'), 
            format(returnDate, 'yyyy-MM-dd'), 
            holidays
        );
        setCalculatedDays(days);
    } else {
        setCalculatedDays(0);
    }
  }, [startDate, returnDate, holidays]);

  const handleSubmit = async () => {
    if (!startDate || !returnDate) {
      toast({ title: "Fechas requeridas", description: "Selecciona fecha de salida y de retorno.", variant: "destructive" });
      return;
    }
    
    if (returnDate <= startDate) {
        toast({ title: "Fechas inválidas", description: "La fecha de retorno debe ser posterior a la de salida.", variant: "destructive" });
        return;
    }

    if (calculatedDays <= 0) {
        toast({ title: "Sin consumo de días", description: "El rango seleccionado no consume días hábiles.", variant: "destructive" });
        return;
    }

    const availableDays = currentUser.vacationDays || 0;
    if (calculatedDays > availableDays) {
       toast({ title: "Saldo insuficiente", description: `Solicitas ${calculatedDays} días pero tienes ${availableDays}.`, variant: "destructive" });
       return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        userId: currentUser.id,
        userName: currentUser.name,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(addDays(returnDate, -1), 'yyyy-MM-dd'), // EndDate es visualmente el último día de vacaciones
        returnDate: format(returnDate, 'yyyy-MM-dd'),
        daysRequested: calculatedDays,
        requestDate: new Date().toISOString(),
        holidays: holidays, // Guardamos snapshot de feriados
      } as any);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Solicitar Licencia</DialogTitle>
          <DialogDescription>
            Selecciona el primer día de tu licencia y el día que te reincorporas.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Fecha de Salida (Primer día ausente)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  disabled={(date) => date < new Date('1900-01-01')}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <Label>Fecha de Retorno (Día que vuelves a trabajar)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !returnDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {returnDate ? format(returnDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={returnDate}
                  onSelect={setReturnDate}
                  initialFocus
                  disabled={(date) => startDate ? date <= startDate : false}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Resumen del cálculo */}
          <div className="rounded-md bg-muted p-4 space-y-2">
             <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Saldo actual:</span>
                <span className="font-semibold">{currentUser.vacationDays || 0} días</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Días a consumir:</span>
                <span className={cn("font-bold text-lg", calculatedDays > (currentUser.vacationDays || 0) ? "text-destructive" : "text-primary")}>
                    {calculatedDays}
                </span>
             </div>
             {calculatedDays > 0 && (
                 <div className="flex gap-2 items-start mt-2 text-xs text-muted-foreground bg-background/50 p-2 rounded">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        Se descontarán {calculatedDays} días provisoriamente. 
                        No se cuentan sábados, domingos, ni el día de retorno. 
                        {holidays.length > 0 && " Se excluyen feriados cargados en el sistema."}
                    </p>
                 </div>
             )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !startDate || !returnDate || calculatedDays <= 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Solicitar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
