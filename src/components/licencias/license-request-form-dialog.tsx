

'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, eachDayOfInterval, isWeekend, addDays, isWithinInterval, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User, VacationRequest } from '@/lib/types';
import { Spinner } from '../ui/spinner';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { useToast } from '@/hooks/use-toast';

interface LicenseRequestFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (requestData: Omit<VacationRequest, 'id' | 'status'>, isEditing: boolean) => Promise<boolean>;
  request?: VacationRequest | null;
  currentUser: User;
  allUserRequests: VacationRequest[];
  requestOwner?: User | null;
}

export function LicenseRequestFormDialog({ isOpen, onOpenChange, onSave, request, currentUser, allUserRequests, requestOwner }: LicenseRequestFormDialogProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = !!request?.id;
  const { toast } = useToast();

  const userForCalculations = isEditing && requestOwner ? requestOwner : currentUser;

  useEffect(() => {
    if (isOpen) {
      if (request) {
        setDateRange({
          from: request.startDate ? parseISO(request.startDate) : undefined,
          to: request.endDate ? parseISO(request.endDate) : undefined,
        });
        setHolidays(request.holidays?.map(h => parseISO(h)) || []);
      } else {
        setDateRange(undefined);
        setHolidays([]);
      }
      setIsSaving(false);
    }
  }, [isOpen, request]);
  
  useEffect(() => {
    if (!dateRange) {
        setHolidays([]);
    }
  }, [dateRange]);

  const handleHolidayToggle = (day: Date | undefined) => {
    if (!day || !dateRange?.from || !dateRange?.to) return;
    
    if (isWeekend(day) || !isWithinInterval(day, { start: startOfDay(dateRange.from), end: startOfDay(dateRange.to) })) {
      toast({ title: "Día no válido", description: "Solo puedes marcar días laborables dentro del rango seleccionado como feriados.", variant: "destructive" });
      return;
    }

    const dayTime = startOfDay(day).getTime();
    setHolidays(prev => 
        prev.some(h => startOfDay(h).getTime() === dayTime)
            ? prev.filter(h => startOfDay(h).getTime() !== dayTime)
            : [...prev, day]
    );
  };

  const { daysRequested, returnDate } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { daysRequested: 0, returnDate: null };
    }
    const allDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const holidayTimeStamps = new Set(holidays.map(h => startOfDay(h).getTime()));

    const workdays = allDays.filter(day => {
        const isWorkday = !isWeekend(day);
        const isHoliday = holidayTimeStamps.has(startOfDay(day).getTime());
        return isWorkday && !isHoliday;
    });
    
    let nextDay = dateRange.to;
    let isHolidayOrWeekend = true;
    while(isHolidayOrWeekend) {
        nextDay = addDays(nextDay, 1);
        const isNextDayHoliday = holidayTimeStamps.has(startOfDay(nextDay).getTime());
        const isNextDayWeekend = isWeekend(nextDay);
        if(!isNextDayHoliday && !isNextDayWeekend) {
            isHolidayOrWeekend = false;
        }
    }

    return {
      daysRequested: workdays.length,
      returnDate: nextDay,
    };
  }, [dateRange, holidays]);

  const remainingDays = useMemo(() => {
    if (!userForCalculations) return 0;
    
    const committedDays = allUserRequests
      .filter(r => (r.status === 'Aprobado' || r.status === 'Pendiente') && r.id !== request?.id)
      .reduce((acc, curr) => acc + curr.daysRequested, 0);

    const availableDays = (userForCalculations.vacationDays || 0) - committedDays;
    
    return availableDays - daysRequested;
  }, [userForCalculations, allUserRequests, daysRequested, request?.id]);


  const handleSave = async () => {
    if (!dateRange?.from || !dateRange?.to || !returnDate) return;

    setIsSaving(true);
    const success = await onSave({
      userId: userForCalculations.id,
      userName: userForCalculations.name,
      startDate: format(dateRange.from, 'yyyy-MM-dd'),
      endDate: format(dateRange.to, 'yyyy-MM-dd'),
      daysRequested,
      returnDate: format(returnDate, 'yyyy-MM-dd'),
      requestDate: request?.requestDate || new Date().toISOString(),
      holidays: holidays.map(h => h.toISOString().split('T')[0]),
    }, isEditing);

    if (success) {
      onOpenChange(false);
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar Solicitud de ${userForCalculations.name}` : 'Nueva Solicitud de Licencia'}</DialogTitle>
          <DialogDescription>
            Selecciona el período de tu licencia. Los días y la fecha de reincorporación se calcularán automáticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
            {/* Left Column: Form and Info */}
            <div className="space-y-4">
                 <div className="space-y-2">
                    <Label>Días de vacaciones disponibles</Label>
                    <Input value={userForCalculations.vacationDays || 0} disabled />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="date-range">Fechas Solicitadas</Label>
                    <Popover>
                    <PopoverTrigger asChild>
                        <Button id="date-range" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "PPP", { locale: es })} - ${format(dateRange.to, "PPP", { locale: es })}` : format(dateRange.from, "PPP", { locale: es })) : <span>Selecciona un rango de fechas</span>}
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
                            locale={es}
                            footer={<p className="text-xs text-center text-muted-foreground pt-2">Marca los feriados en el calendario de la derecha.</p>}
                        />
                    </PopoverContent>
                    </Popover>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="p-3 text-center"><p className="text-sm text-muted-foreground">Días pedidos</p><p className="text-xl font-bold">{daysRequested}</p></Card>
                    <Card className="p-3 text-center col-span-2 lg:col-span-1"><p className="text-sm text-muted-foreground">Retoma actividades</p><p className="text-base font-bold capitalize">{returnDate ? format(returnDate, 'PPPP', {locale: es}) : '-'}</p></Card>
                    <Card className={cn("p-3 text-center", remainingDays < 0 && "bg-destructive/10 border-destructive text-destructive-foreground")}>
                    <p className="text-sm">Días restantes</p>
                    <p className="text-xl font-bold">{remainingDays}</p>
                    </Card>
                </div>
            </div>
            {/* Right Column: Holiday Calendar */}
            <div className="space-y-2">
                <Label>Marcar Feriados / Días No Laborables</Label>
                 <Calendar
                    mode="multiple"
                    min={0}
                    selected={holidays}
                    onSelect={(days) => setHolidays(days || [])}
                    month={dateRange?.from}
                    disabled={!dateRange?.from}
                    locale={es}
                    className="rounded-md border p-0"
                    classNames={{
                      caption_label: "hidden",
                      nav_button_previous: "hidden",
                      nav_button_next: "hidden",
                    }}
                />
                <p className="text-xs text-muted-foreground">
                    Selecciona los días feriados o no laborables que caen dentro de tu período de licencia. No se contarán como días de vacaciones.
                </p>
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || daysRequested <= 0}>
            {isSaving ? <Spinner size="small" /> : isEditing ? 'Guardar Cambios' : 'Enviar Solicitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
