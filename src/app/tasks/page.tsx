'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllClientActivities } from '@/lib/firebase-service';
import type { ClientActivity } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isBefore, isSameDay, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, Calendar, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TasksPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!userInfo) return;
      const allActivities = await getAllClientActivities();
      // Filtrar: Mis tareas, que sean tareas, que no estén completas
      const myOpenTasks = allActivities.filter(a => 
          a.userId === userInfo.id && 
          a.isTask && 
          !a.completed
      );
      setTasks(myOpenTasks);
      setLoading(false);
    };

    if (!authLoading) fetchTasks();
  }, [userInfo, authLoading]);

  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    
    const expired: ClientActivity[] = [];
    const dueToday: ClientActivity[] = [];
    const upcoming: ClientActivity[] = [];

    tasks.forEach(task => {
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

    // Ordenar: Vencidas (Más antigua primero), Hoy (Hora?), Futuras (Más cercana primero)
    expired.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    dueToday.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    upcoming.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    return { expired, dueToday, upcoming };
  }, [tasks]);

  if (authLoading || loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

  const TaskCard = ({ task, colorClass }: { task: ClientActivity, colorClass: string }) => {
      const link = task.clientId 
        ? `/clients/${task.clientId}` 
        : task.prospectId 
            ? `/prospects?prospectId=${task.prospectId}` 
            : '#';
      
      return (
        <div className={`flex items-start justify-between p-4 border rounded-lg mb-2 bg-card hover:bg-accent/50 transition-colors ${colorClass}`}>
            <div className="space-y-1">
                <div className="font-semibold flex items-center gap-2">
                    {task.clientName || task.prospectName || 'Sin Nombre'}
                    <Badge variant="outline" className="text-[10px] h-5">{task.clientId ? 'Cliente' : 'Prospecto'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{task.observation}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(task.dueDate!), "EEEE d 'de' MMMM", { locale: es })}
                </div>
            </div>
            <Link href={link}>
                <Button size="sm" variant="ghost">
                    Ir <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
            </Link>
        </div>
      );
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Mis Tareas Pendientes" />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-8">
        
        {/* VENCIDAS */}
        <section>
            <h2 className="text-lg font-bold flex items-center gap-2 text-destructive mb-4">
                <AlertCircle className="h-5 w-5" /> Vencidas ({groupedTasks.expired.length})
            </h2>
            <div className="grid gap-2">
                {groupedTasks.expired.length > 0 ? (
                    groupedTasks.expired.map(task => (
                        <TaskCard key={task.id} task={task} colorClass="border-l-4 border-l-destructive" />
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground italic">¡Excelente! No tienes tareas vencidas.</p>
                )}
            </div>
        </section>

        {/* HOY */}
        <section>
            <h2 className="text-lg font-bold flex items-center gap-2 text-orange-600 mb-4">
                <Clock className="h-5 w-5" /> Vencen Hoy ({groupedTasks.dueToday.length})
            </h2>
            <div className="grid gap-2">
                {groupedTasks.dueToday.length > 0 ? (
                    groupedTasks.dueToday.map(task => (
                        <TaskCard key={task.id} task={task} colorClass="border-l-4 border-l-orange-500" />
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground italic">No hay tareas programadas para hoy.</p>
                )}
            </div>
        </section>

        {/* FUTURAS */}
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

      </main>
    </div>
  );
