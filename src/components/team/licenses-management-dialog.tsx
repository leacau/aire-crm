'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, CalendarIcon, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';
import { addVacationDays, getAllUsers, getSystemHolidays, saveSystemHolidays } from '@/lib/firebase-service';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

export function LicensesManagementDialog({ 
    isOpen, 
    onOpenChange 
}: { 
    isOpen: boolean; 
    onOpenChange: (isOpen: boolean) => void 
}) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [daysToAdd, setDaysToAdd] = useState('');
  
  // Estado para feriados
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
      try {
          const [fetchedUsers, fetchedHolidays] = await Promise.all([
              getAllUsers(),
              getSystemHolidays()
          ]);
          setUsers(fetchedUsers.filter(u => u.role === 'Asesor'));
          setHolidays(fetchedHolidays.sort());
      } catch (e) {
          console.error(e);
      }
  };

  const handleAddDays = async () => {
    if (!selectedUser || !daysToAdd || isNaN(Number(daysToAdd))) return;
    try {
      await addVacationDays(selectedUser, Number(daysToAdd), userInfo?.id || '', userInfo?.name || '');
      toast({ title: "Días agregados correctamente" });
      setDaysToAdd('');
      setSelectedUser('');
    } catch (error) {
      toast({ title: "Error al agregar días", variant: "destructive" });
    }
  };

  // --- Gestión de Feriados ---
  const handleAddHoliday = async () => {
      if (!newHolidayDate) return;
      if (holidays.includes(newHolidayDate)) {
          toast({ title: "Ese feriado ya existe", variant: "destructive" });
          return;
      }
      
      const newHolidays = [...holidays, newHolidayDate].sort();
      try {
          await saveSystemHolidays(newHolidays, userInfo?.id || '', userInfo?.name || '');
          setHolidays(newHolidays);
          setNewHolidayDate('');
          toast({ title: "Feriado agregado" });
      } catch (error) {
          toast({ title: "Error al guardar", variant: "destructive" });
      }
  };

  const handleDeleteHoliday = async (dateToDelete: string) => {
      const newHolidays = holidays.filter(d => d !== dateToDelete);
      try {
          await saveSystemHolidays(newHolidays, userInfo?.id || '', userInfo?.name || '');
          setHolidays(newHolidays);
          toast({ title: "Feriado eliminado" });
      } catch (error) {
          toast({ title: "Error al eliminar", variant: "destructive" });
      }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Gestión de Licencias</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="balance">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="balance">Saldo de Días</TabsTrigger>
                <TabsTrigger value="holidays">Feriados</TabsTrigger>
            </TabsList>

            {/* PESTAÑA SALDO DE DÍAS (Lógica existente mejorada) */}
            <TabsContent value="balance" className="space-y-4 py-4">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <Label>Seleccionar Asesor</Label>
                        <Select value={selectedUser} onValueChange={setSelectedUser}>
                            <SelectTrigger>
                                <SelectValue placeholder="Buscar asesor..." />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map(u => (
                                    <SelectItem key={u.id} value={u.id}>{u.name} (Actual: {u.vacationDays || 0})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Días a agregar</Label>
                        <div className="flex gap-2">
                            <Input 
                                type="number" 
                                value={daysToAdd} 
                                onChange={e => setDaysToAdd(e.target.value)} 
                                placeholder="Ej: 14"
                            />
                            <Button onClick={handleAddDays}>Agregar</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Esto suma días al saldo actual del asesor.</p>
                    </div>
                </div>
            </TabsContent>

            {/* PESTAÑA FERIADOS (Nueva) */}
            <TabsContent value="holidays" className="space-y-4 py-4">
                <div className="flex gap-2 items-end">
                    <div className="space-y-2 flex-1">
                        <Label>Nuevo Feriado</Label>
                        <Input 
                            type="date" 
                            value={newHolidayDate} 
                            onChange={e => setNewHolidayDate(e.target.value)} 
                        />
                    </div>
                    <Button onClick={handleAddHoliday} disabled={!newHolidayDate}>
                        <Plus className="mr-2 h-4 w-4" /> Agregar
                    </Button>
                </div>

                <div className="border rounded-md mt-4">
                    <div className="bg-muted p-2 text-sm font-medium border-b">Feriados Configurados</div>
                    <ScrollArea className="h-[200px] p-2">
                        {holidays.length === 0 && <p className="text-sm text-muted-foreground p-2">No hay feriados cargados.</p>}
                        {holidays.map(date => (
                            <div key={date} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded text-sm">
                                <div className="flex items-center gap-2">
                                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                    <span>{format(parseISO(date), "PPP", { locale: es })}</span>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteHoliday(date)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </ScrollArea>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    Estos días no se contarán al calcular la duración de las licencias solicitadas.
                </p>
            </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
