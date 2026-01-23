'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllClientActivities, completeActivityTask, rescheduleActivityTask } from '@/lib/firebase-service';
import type { ClientActivity } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isBefore, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, Calendar, Clock, CheckCircle2, ArrowRight, CheckSquare, CalendarDays, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Importar Input
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export default function TasksPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para el modal de posponer
  const [rescheduleTask, setRescheduleTask] = useState<ClientActivity | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para búsqueda
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTasks = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
        const allActivities = await getAllClientActivities();
        const myOpenTasks = allActivities.filter(a => 
            a.userId === userInfo.id && 
            a.isTask && 
            !a.completed
        );
        setTasks(myOpenTasks);
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchTasks();
  }, [userInfo, authLoading]);

  const handleComplete = async (task: ClientActivity) => {
      if (!userInfo) return;
      // Optimistic update: remover visualmente antes de confirmar
      setTasks(prev => prev.filter(t => t.id !== task.id));
      
      try {
          await completeActivityTask(task.id, userInfo.id, userInfo.name);
          toast({ title: "Tarea completada", description: "La tarea ha sido marcada como finalizada." });
      } catch (error) {
          console.error(error);
          toast({ title: "Error", description: "No se pudo completar la tarea.", variant: "destructive" });
          fetchTasks(); // Revertir en caso de error
      }
  };

  const openReschedule = (task: ClientActivity) => {
      setRescheduleTask(task);
      setNewDate(task.dueDate ? parseISO(task.dueDate) : new Date());
  };

  const confirmReschedule = async () => {
      if (!userInfo || !rescheduleTask || !newDate) return;
      setIsProcessing(true);
      try {
          await rescheduleActivityTask(rescheduleTask.id, newDate, userInfo.id, userInfo.name);
          toast({ title: "Tarea pospuesta", description: `Nueva fecha: ${format(newDate, 'P', { locale: es })}` });
          setRescheduleTask(null);
          fetchTasks(); // Recargar para reordenar
      } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo posponer la tarea.", variant: "destructive" });
      } finally {
          setIsProcessing(false);
      }
  };

  // Filtrado y agrupación
  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    
    // Filtrar primero por búsqueda
    const filteredTasks = tasks.filter(task => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        
        const clientName = task.clientName?.toLowerCase() || '';
        const prospectName = task.prospectName?.toLowerCase() || '';
        const obs = task.observation?.toLowerCase() || '';
        
        return clientName.includes(query) || prospectName.includes(query) || obs.includes(query);
    });

    const expired: ClientActivity[] = [];
    const dueToday: ClientActivity[] = [];
    const upcoming: ClientActivity[] = [];

    filteredTasks.forEach(task => {
        if (!task.dueDate) return;
        const dueDate = parseISO(task.dueDate);
        const dueDateStart = startOfDay(dueDate);

        if (isBefore(dueDateStart, today)) {
            expired.push(task);
        } else if (isSameDay(dueDateStart, today)) {
            dueToday.push(task);
        } else {
            upcoming.push(task);
        }
    });

    expired.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    dueToday.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    upcoming.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    return { expired, dueToday, upcoming };
  }, [tasks, searchQuery]);

  if (authLoading || loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

  const TaskCard = ({ task, colorClass }: { task: ClientActivity, colorClass: string }) => {
      const link = task.clientId 
        ? `/clients/${task.clientId}` 
        : task.prospectId 
            ? `/prospects?prospectId=${task.prospectId}` 
            : '#';
      
      return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg mb-2 bg-card hover:bg-accent/50 transition-colors gap-4 ${colorClass}`}>
            <div className="space-y-1 flex-1">
                <div className="font-semibold flex items-center gap-2 flex-wrap">
                    {task.clientName || task.prospectName || 'Sin Nombre'}
                    <Badge variant="outline" className="text-[10px] h-5">{task.clientId ? 'Cliente' : 'Prospecto'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{task.observation}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <Calendar className="h-3 w-3" />
                    {task.dueDate ? format(parseISO(task.dueDate), "EEEE d 'de' MMMM", { locale: es }) : 'Sin fecha'}
                </div>
            </div>
            
            <div className="flex items-center gap-2 self-end sm:self-center">
                 <Link href={link}>
                    <Button size="icon" variant="ghost" title="Ir a la ficha">
                         <ArrowRight className="h-4 w-4" />
                    </Button>
                </Link>
                
                <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    onClick={() => openReschedule(task)}
                >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Posponer
                </Button>
                
                <Button 
                    size="sm" 
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleComplete(task)}
                >
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Finalizar
                </Button>
            </div>
        </div>
      );
  };

  return (
    <>
        <div className="flex flex-col h-full">
        <Header title="Mis Tareas Pendientes" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
            
            {/* Buscador */}
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por cliente o detalle..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                />
            </div>

            {/* VENCIDAS */}
            {groupedTasks.expired.length > 0 && (
                <section>
                    <h2 className="text-lg font-bold flex items-center gap-2 text-destructive mb-4">
                        <AlertCircle className="h-5 w-5" /> Vencidas ({groupedTasks.expired.length})
                    </h2>
                    <div className="grid gap-2">
                        {groupedTasks.expired.map(task => (
                            <TaskCard key={task.id} task={task} colorClass="border-l-4 border-l-destructive" />
                        ))}
                    </div>
                </section>
            )}

            {/* HOY */}
            {groupedTasks.dueToday.length > 0 && (
                <section>
                    <h2 className="text-lg font-bold flex items-center gap-2 text-orange-600 mb-4">
                        <Clock className="h-5 w-5" /> Vencen Hoy ({groupedTasks.dueToday.length})
                    </h2>
                    <div className="grid gap-2">
                        {groupedTasks.dueToday.map(task => (
                            <TaskCard key={task.id} task={task} colorClass="border-l-4 border-l-orange-500" />
                        ))}
                    </div>
                </section>
            )}

            {/* FUTURAS */}
            {groupedTasks.upcoming.length > 0 && (
                <section>
                    <h2 className="text-lg font-bold flex items-center gap-2 text-primary mb-4">
                        <CheckCircle2 className="h-5 w-5" /> A Vencer ({groupedTasks.upcoming.length})
                    </h2>
                    <div className="grid gap-2">
                        {groupedTasks.upcoming.map(task => (
                            <TaskCard key={task.id} task={task} colorClass="border-l-4 border-l-primary/30" />
                        ))}
                    </div>
                </section>
            )}
            
            {groupedTasks.expired.length === 0 && groupedTasks.dueToday.length === 0 && groupedTasks.upcoming.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    {searchQuery ? "No se encontraron tareas con ese criterio." : "¡Estás al día! No tienes tareas pendientes."}
                </div>
            )}

        </main>
        </div>

        <Dialog open={!!rescheduleTask} onOpenChange={(open) => !open && setRescheduleTask(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Posponer Tarea</DialogTitle>
                    <DialogDescription>
                        Selecciona la nueva fecha de vencimiento para esta tarea.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-4">
                    <CalendarComponent
                        mode="single"
                        selected={newDate}
                        onSelect={setNewDate}
                        initialFocus
                        locale={es}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRescheduleTask(null)}>Cancelar</Button>
                    <Button onClick={confirmReschedule} disabled={!newDate || isProcessing}>
                        {isProcessing ? 'Guardando...' : 'Confirmar Nueva Fecha'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}
