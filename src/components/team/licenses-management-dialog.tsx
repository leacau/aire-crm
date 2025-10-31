
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import type { VacationRequest, User } from '@/lib/types';
import { getAllUsers, getVacationRequests, managerCreateOrUpdateVacationRequest, deleteVacationRequest, approveVacationRequest } from '@/lib/firebase-service';
import { useAuth } from '@/hooks/use-auth';
import { LicensesTable } from '../licencias/licenses-table';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import { format, eachDayOfInterval, isWeekend, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card } from '../ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';

interface LicensesManagementDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const getNextWorkday = (date: Date): Date => {
    let nextDay = addDays(date, 1);
    while (isWeekend(nextDay)) {
        nextDay = addDays(nextDay, 1);
    }
    return nextDay;
};

export function LicensesManagementDialog({ isOpen, onOpenChange }: LicensesManagementDialogProps) {
  const { userInfo, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Partial<VacationRequest> | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [requestToDelete, setRequestToDelete] = useState<VacationRequest | null>(null);

  const { daysRequested, returnDate } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { daysRequested: 0, returnDate: '' };
    }
    const allDays = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const workdays = allDays.filter(day => !isWeekend(day));
    const nextWorkday = getNextWorkday(dateRange.to);
    
    return {
      daysRequested: workdays.length,
      returnDate: format(nextWorkday, 'PPP', { locale: es }),
    };
  }, [dateRange]);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedRequests, fetchedUsers] = await Promise.all([
        getVacationRequests(userInfo.id, userInfo.role),
        getAllUsers(),
      ]);
      setRequests(fetchedRequests);
      setUsers(fetchedUsers.filter(u => u.role === 'Asesor'));
    } catch (error) {
      console.error("Error fetching license data for manager:", error);
      toast({ title: "Error al cargar datos de licencias", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userInfo, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleSaveRequest = async () => {
    if (!editingRequest?.userId || !dateRange?.from || !dateRange?.to) {
      toast({ title: 'Datos incompletos', variant: 'destructive' });
      return;
    }
    
    const user = users.find(u => u.id === editingRequest.userId);
    if (!user) return;

    const payload: Partial<VacationRequest> = {
      ...editingRequest,
      startDate: format(dateRange.from, 'yyyy-MM-dd'),
      endDate: format(dateRange.to, 'yyyy-MM-dd'),
      daysRequested,
      returnDate: format(getNextWorkday(dateRange.to), 'yyyy-MM-dd'),
      userName: user.name,
    };
    
    await managerCreateOrUpdateVacationRequest(payload, userInfo!.id);
    toast({ title: `Solicitud ${editingRequest.id ? 'actualizada' : 'creada'}` });
    setIsFormVisible(false);
    setEditingRequest(null);
    fetchData();
  };

  const handleApprove = async (requestId: string) => {
    if (!userInfo) return;
    try {
      const accessToken = await getGoogleAccessToken();
      if (!accessToken) throw new Error("No se pudo obtener el token de acceso.");
      await approveVacationRequest(requestId, userInfo!.id, accessToken);
      toast({ title: 'Solicitud Aprobada' });
      fetchData();
    } catch (error) {
      console.error("Error approving request:", error);
      toast({ title: 'Error al aprobar', variant: 'destructive', description: (error as Error).message });
    }
  };

  const handleDelete = async () => {
    if (!requestToDelete) return;
    try {
      await deleteVacationRequest(requestToDelete.id);
      toast({ title: 'Solicitud Eliminada' });
      fetchData();
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setRequestToDelete(null);
    }
  };

  const openForm = (request: Partial<VacationRequest> | null) => {
    setEditingRequest(request || { status: 'Pendiente' });
    setDateRange(request?.startDate && request?.endDate ? { from: new Date(request.startDate), to: new Date(request.endDate) } : undefined);
    setIsFormVisible(true);
  };
  
  const closeForm = () => {
    setIsFormVisible(false);
    setEditingRequest(null);
  };

  const tableColumns = useMemo<ColumnDef<VacationRequest>[]>(() => [
    { accessorKey: 'userName', header: 'Asesor', cell: ({ row }) => <div className="font-medium">{row.original.userName}</div> },
    { accessorKey: 'startDate', header: 'Desde', cell: ({ row }) => format(new Date(row.original.startDate), 'P', { locale: es }) },
    { accessorKey: 'endDate', header: 'Hasta', cell: ({ row }) => format(new Date(row.original.endDate), 'P', { locale: es }) },
    { accessorKey: 'daysRequested', header: 'Días' },
    { accessorKey: 'returnDate', header: 'Reincorpora', cell: ({ row }) => format(new Date(row.original.returnDate), 'P', { locale: es }) },
    { id: 'actions', cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
            {row.original.status === 'Pendiente' && <Button size="sm" onClick={() => handleApprove(row.original.id)}>Aprobar</Button>}
            <Button size="sm" variant="outline" onClick={() => openForm(row.original)}>Editar</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRequestToDelete(row.original)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
        </div>
      )
    },
  ], [handleApprove]);


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestión de Licencias del Equipo</DialogTitle>
          <DialogDescription>
            Crea, edita y aprueba las solicitudes de licencias de tu equipo.
          </DialogDescription>
        </DialogHeader>
        
        {loading ? <Spinner /> : (
            isFormVisible ? (
                 <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                    <h3 className="font-semibold text-lg">{editingRequest?.id ? 'Editar' : 'Nueva'} Solicitud</h3>
                    <div className="space-y-2">
                        <Label>Asesor</Label>
                        <Select value={editingRequest?.userId} onValueChange={(v) => setEditingRequest(p => ({...p, userId: v}))}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar asesor..." /></SelectTrigger>
                            <SelectContent>
                                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>Período de Licencia</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "PPP", { locale: es })} - ${format(dateRange.to, "PPP", { locale: es })}` : format(dateRange.from, "PPP", { locale: es })) : <span>Selecciona un rango</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={dateRange} onSelect={setDateRange} locale={es} /></PopoverContent>
                        </Popover>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="p-3 text-center"><p className="text-sm text-muted-foreground">Días pedidos</p><p className="text-xl font-bold">{daysRequested}</p></Card>
                        <Card className="p-3 text-center"><p className="text-sm text-muted-foreground">Retoma actividades</p><p className="text-base font-bold capitalize">{returnDate || '-'}</p></Card>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex justify-end mb-4">
                        <Button onClick={() => openForm(null)}><PlusCircle className="mr-2 h-4 w-4" /> Nueva Solicitud</Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <LicensesTable requests={requests} isManagerView={true} onUpdateRequest={handleApprove} />
                    </div>
                </div>
            )
        )}

        <DialogFooter>
            {isFormVisible ? (
                <>
                  <Button variant="outline" onClick={closeForm}>Cancelar</Button>
                  <Button onClick={handleSaveRequest}>Guardar Solicitud</Button>
                </>
            ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
     <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta solicitud?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción es irreversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} variant="destructive">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
