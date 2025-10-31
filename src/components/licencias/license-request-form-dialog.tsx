
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { addDays, eachDayOfInterval, isWeekend, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { VacationRequest, User } from '@/lib/types';
import { Card } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Spinner } from '../ui/spinner';

interface LicenseRequestFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (data: Omit<VacationRequest, 'id'>) => void;
  request?: VacationRequest | null;
  user?: User | null; // The user for whom the request is being made
  allUsers: User[];
  canChangeUser: boolean;
}

const getNextWorkday = (date: Date): Date => {
    let nextDay = addDays(date, 1);
    while (isWeekend(nextDay)) {
        nextDay = addDays(nextDay, 1);
    }
    return nextDay;
};

export function LicenseRequestFormDialog({ isOpen, onOpenChange, onSubmit, request, user, allUsers, canChangeUser }: LicenseRequestFormDialogProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
  const isEditing = !!request;
  const selectedUser = useMemo(() => allUsers.find(u => u.id === selectedUserId), [allUsers, selectedUserId]);
  const vacationDaysAvailable = selectedUser?.vacationDays || 0;

  useEffect(() => {
    if (isOpen) {
        setIsSaving(false);
        if (request) { // Editing
            setSelectedUserId(request.userId);
            setDateRange({ from: parseISO(request.startDate), to: parseISO(request.endDate) });
        } else if (user) { // Creating for self or pre-selected user
            setSelectedUserId(user.id);
            setDateRange(undefined);
        } else { // Creating for another user (manager)
             setSelectedUserId(undefined);
             setDateRange(undefined);
        }
    }
  }, [isOpen, request, user]);


  const { daysRequested, returnDate, remainingDays } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { daysRequested: 0, returnDate: '', remainingDays: vacationDaysAvailable };
    }
    const allDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const workdays = allDays.filter(day => !isWeekend(day));
    const nextWorkday = getNextWorkday(dateRange.to);
    
    return {
      daysRequested: workdays.length,
      returnDate: format(nextWorkday, 'PPP', { locale: es }),
      remainingDays: vacationDaysAvailable - workdays.length
    };
  }, [dateRange, vacationDaysAvailable]);

  const handleSubmit = () => {
    if (!selectedUserId || !selectedUser) {
        toast({ title: 'Usuario no seleccionado', description: 'Por favor, selecciona un asesor.', variant: 'destructive'});
        return;
    }
    if (!dateRange?.from || !dateRange?.to || daysRequested <= 0) {
      toast({ title: 'Datos incompletos', description: 'Por favor, selecciona un rango de fechas válido.', variant: 'destructive'});
      return;
    }
     if (remainingDays < 0) {
      toast({ title: 'Días insuficientes', description: 'No tienes suficientes días de vacaciones disponibles.', variant: 'destructive'});
      return;
    }
    
    setIsSaving(true);
    onSubmit({
        userId: selectedUserId,
        userName: selectedUser.name,
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        daysRequested,
        returnDate: format(getNextWorkday(dateRange.to), 'yyyy-MM-dd'),
        status: request?.status || 'Pendiente',
        requestDate: request?.requestDate || new Date().toISOString(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar' : 'Solicitar'} Licencia</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los detalles de la solicitud.' : 'Selecciona el período de tu licencia. Los días se calcularán automáticamente de lunes a viernes.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            {canChangeUser && (
                 <div className="space-y-2">
                    <Label>Asesor</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isEditing}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar asesor..." /></SelectTrigger>
                        <SelectContent>
                            {allUsers.filter(u => u.role === 'Asesor').map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            
            {selectedUser && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-sm text-blue-800">Días de vacaciones correspondientes:</p>
                    <p className="text-2xl font-bold text-blue-900">{vacationDaysAvailable}</p>
                </div>
            )}
          <div className="space-y-2">
            <Label htmlFor="date-range">Fecha Pedida de Licencia</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-range"
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                  disabled={!selectedUserId}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                        {format(dateRange.to, "LLL dd, y", { locale: es })}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y", { locale: es })
                    )
                  ) : (
                    <span>Selecciona un rango de fechas</span>
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
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>
          
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-3 text-center">
                    <p className="text-sm text-muted-foreground">Días pedidos</p>
                    <p className="text-xl font-bold">{daysRequested}</p>
                </Card>
                 <Card className="p-3 text-center">
                    <p className="text-sm text-muted-foreground">Retoma actividades</p>
                    <p className="text-base font-bold capitalize">{returnDate || '-'}</p>
                </Card>
                 <Card className={cn("p-3 text-center", remainingDays < 0 && "bg-red-50 border-red-200")}>
                    <p className="text-sm text-muted-foreground">Días restantes</p>
                    <p className="text-xl font-bold">{remainingDays}</p>
                </Card>
           </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Spinner size="small"/> : 'Guardar Solicitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
