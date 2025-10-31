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
import { format, eachDayOfInterval, isWeekend, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User, VacationRequest } from '@/lib/types';
import { Spinner } from '../ui/spinner';
import { Card } from '../ui/card';
import { Input } from '../ui/input';

interface LicenseRequestFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (requestData: Omit<VacationRequest, 'id' | 'status'>, isEditing: boolean) => Promise<boolean>;
  request?: VacationRequest | null;
  currentUser: User;
  requestOwner?: User | null; // The user whose request is being edited
}

const getNextWorkday = (date: Date): Date => {
  let nextDay = addDays(date, 1);
  while (isWeekend(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

export function LicenseRequestFormDialog({ isOpen, onOpenChange, onSave, request, currentUser, requestOwner }: LicenseRequestFormDialogProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = !!request?.id;

  // Determine whose vacation days to display and calculate against.
  // If a manager is editing, use the requestOwner's data. Otherwise, use the currentUser's.
  const userForCalculations = isEditing && requestOwner ? requestOwner : currentUser;

  useEffect(() => {
    if (isOpen) {
      if (request) {
        setDateRange({
          from: request.startDate ? new Date(request.startDate) : undefined,
          to: request.endDate ? new Date(request.endDate) : undefined,
        });
      } else {
        setDateRange(undefined);
      }
      setIsSaving(false);
    }
  }, [isOpen, request]);

  const { daysRequested, returnDate } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { daysRequested: 0, returnDate: '' };
    }
    const allDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const workdays = allDays.filter(day => !isWeekend(day));
    const nextWorkday = getNextWorkday(dateRange.to);

    return {
      daysRequested: workdays.length,
      returnDate: format(nextWorkday, 'PPPP', { locale: es }),
    };
  }, [dateRange]);

  const remainingDays = (userForCalculations.vacationDays || 0) - daysRequested;

  const handleSave = async () => {
    if (!dateRange?.from || !dateRange?.to) return;

    setIsSaving(true);
    const success = await onSave({
      userId: userForCalculations.id,
      userName: userForCalculations.name,
      startDate: format(dateRange.from, 'yyyy-MM-dd'),
      endDate: format(dateRange.to, 'yyyy-MM-dd'),
      daysRequested,
      returnDate: format(getNextWorkday(dateRange.to), 'yyyy-MM-dd'),
      requestDate: request?.requestDate || new Date().toISOString(),
    }, isEditing);

    if (success) {
      onOpenChange(false);
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar Solicitud de ${userForCalculations.name}` : 'Nueva Solicitud de Licencia'}</DialogTitle>
          <DialogDescription>
            Selecciona el período de tu licencia. Los días y la fecha de reincorporación se calcularán automáticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
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
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-3 text-center"><p className="text-sm text-muted-foreground">Días pedidos</p><p className="text-xl font-bold">{daysRequested}</p></Card>
            <Card className="p-3 text-center col-span-2 lg:col-span-1"><p className="text-sm text-muted-foreground">Retoma actividades</p><p className="text-base font-bold capitalize">{returnDate || '-'}</p></Card>
            <Card className={cn("p-3 text-center", remainingDays < 0 && "bg-destructive/10 border-destructive text-destructive-foreground")}>
              <p className="text-sm">Días restantes</p>
              <p className="text-xl font-bold">{remainingDays}</p>
            </Card>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || daysRequested <= 0}>
            {isSaving ? <Spinner size="small" /> : 'Enviar Solicitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
