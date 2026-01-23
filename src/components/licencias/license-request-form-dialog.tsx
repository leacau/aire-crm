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
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { User, VacationRequest } from '@/lib/types';
import { getSystemHolidays, calculateBusinessDays } from '@/lib/firebase-service';

interface LicenseRequestFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Actualizamos la firma para permitir pasar ID y flag de edición
  onSave: (requestData: Partial<VacationRequest>, isEditing: boolean) => Promise<void | boolean>;
  currentUser: User;
  request?: VacationRequest | null; // Añadido para recibir la licencia a editar
  requestOwner?: User | null; // Añadido para saber de quién es la licencia
}

export function LicenseRequestFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  currentUser,
  request,      // Recibimos la solicitud a editar
  requestOwner, // Recibimos el dueño de la solicitud
}: LicenseRequestFormDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [returnDate, setReturnDate] = useState<Date | undefined>();
  const [holidays, setHolidays] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calculatedDays, setCalculatedDays] = useState(0);
  const { toast } = useToast();

  // Efecto para cargar datos iniciales (feriados y datos de la request si es edición)
  useEffect(() => {
    if (isOpen) {
        getSystemHolidays().then(setHolidays).catch(console.error);
        
        if (request) {
            // MODO EDICIÓN: Cargar fechas existentes
            // Parseamos las fechas string 'yyyy-MM-dd' a objetos Date
            // Nota: parseISO maneja bien el formato ISO, pero asegurate de las zonas horarias si usas strings simples
            // Si request.startDate es '2023-10-10', parseISO funciona bien.
            const start = parseISO(request.startDate);
            const ret = parseISO(request.returnDate);
            setStartDate(start);
            setReturnDate(ret);
            // El cálculo de días se disparará automáticamente por el useEffect de abajo
        } else {
            // MODO CREACIÓN: Limpiar
            setStartDate(undefined);
            setReturnDate(undefined);
            setCalculatedDays(0);
        }
    }
  }, [isOpen, request]);

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

    // Determinar de quién son los días a descontar
    // Si estamos editando (request existe), usamos el requestOwner o buscamos el usuario original.
    // Si es nuevo, es el currentUser.
    const targetUser = request ? requestOwner : currentUser;
    const availableDays = targetUser?.vacationDays || 0;

    // Validación opcional: Permitir guardar si es admin/jefe aunque se pase, o mantener estricto.
    // Aquí mantenemos la validación estricta sobre el saldo.
    // Nota: Si se edita, habría que considerar devolver los días anteriores antes de chequear saldo, 
    // pero para simplificar, validamos contra el saldo actual + días de la request actual si es edición.
    let effectiveBalance = availableDays;
    if (request) {
        effectiveBalance += request.daysRequested; // "Devolvemos" virtualmente los días para validar el nuevo monto
    }

    if (calculatedDays > effectiveBalance) {
       toast({ title: "Saldo insuficiente", description: `La solicitud requiere ${calculatedDays} días.`, variant: "destructive" });
       return;
    }

    setIsSubmitting(true);
    try {
      // AQUÍ ESTÁ EL CAMBIO CLAVE:
      // Si existe 'request', mantenemos su ID y su userId original.
      // Si no, usamos el currentUser.
      
      const payload: Partial<VacationRequest> = {
        userId: request ? request.userId : currentUser.id,     // Mantiene el dueño original
        userName: request ? request.userName : currentUser.name, // Mantiene el nombre original
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(addDays(returnDate, -1), 'yyyy-MM-dd'),
        returnDate: format(returnDate, 'yyyy-MM-dd'),
        daysRequested: calculatedDays,
        requestDate: request ? request.requestDate : new Date().toISOString(), // Mantener fecha solicitud original si se edita
        holidays: holidays,
        ...(request ? { id: request.id, status: request.status } : {}) // Incluir ID si es edición
      };

      await onSave(payload, !!request); // Pasamos flag isEditing
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = !!request;
  const targetUser = request ? requestOwner : currentUser;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modificar Licencia' : 'Solicitar Licencia'}</DialogTitle>
          <DialogDescription>
             {isEditing 
                ? `Editando solicitud de ${targetUser?.name || 'Usuario'}`
                : "Selecciona el primer día de tu licencia y el día que te reincorporas."
             }
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
                  // Si edita, permitimos fechas pasadas? Generalmente no, pero depende de la política. Dejamos bloqueo histórico.
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
                <span className="text-muted-foreground">Saldo actual ({targetUser?.name}):</span>
                <span className="font-semibold">{targetUser?.vacationDays || 0} días</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Días a consumir:</span>
                <span className={cn("font-bold text-lg", 
                    calculatedDays > (isEditing ? ((targetUser?.vacationDays || 0) + (request?.daysRequested || 0)) : (targetUser?.vacationDays || 0)) 
                    ? "text-destructive" : "text-primary")}>
                    {calculatedDays}
                </span>
             </div>
             {calculatedDays > 0 && (
                 <div className="flex gap-2 items-start mt-2 text-xs text-muted-foreground bg-background/50 p-2 rounded">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        Se descontarán {calculatedDays} días. 
                    </p>
                 </div>
             )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !startDate || !returnDate || calculatedDays <= 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Guardar Cambios' : 'Solicitar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
