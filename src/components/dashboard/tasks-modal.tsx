'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ClientActivity, User } from '@/lib/types';
import { AlertTriangle, CalendarCheck, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';

interface TasksModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    overdueTasks: ClientActivity[];
    dueTodayTasks: ClientActivity[];
    dueTomorrowTasks: ClientActivity[];
    usersMap?: Record<string, User>;
}

const TaskListSection = ({ title, tasks, icon }: { title: string, tasks: ClientActivity[], icon: React.ReactNode }) => {
    if (tasks.length === 0) {
        return null;
    }
    return (
        <div>
            <h4 className="flex items-center font-semibold mb-3 text-md border-b pb-2">
                {icon}
                <span className='ml-2'>{title} ({tasks.length})</span>
            </h4>
            <ul className="space-y-3">
                {tasks.map(task => (
                    <li key={task.id} className="text-sm">
                        <p className="font-medium">{task.observation}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                            {task.clientId ? (
                                <Link href={`/clients/${task.clientId}`} className="hover:underline text-primary">
                                    Cliente: {task.clientName || 'Sin nombre'}
                                </Link>
                            ) : task.prospectId ? (
                                <Link href={`/prospects?prospectId=${task.prospectId}`} className="hover:underline text-primary">
                                    Prospecto: {task.prospectName || 'Sin nombre'}
                                </Link>
                            ) : (
                                <span>Sin entidad</span>
                            )}
                            
                            {task.dueDate && (
                                <span>Vence: {format(new Date(task.dueDate), 'P p', { locale: es })}</span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export function TasksModal({ isOpen, onOpenChange, overdueTasks, dueTodayTasks, dueTomorrowTasks }: TasksModalProps) {
    const { userInfo } = useAuth();

    // Lógica para ocultar el modal a Jefes/Gerentes/Admins
    // Si el usuario tiene uno de estos roles, retornamos null para no renderizar nada.
    if (userInfo && ['Jefe', 'Gerencia', 'Admin', 'Administracion'].includes(userInfo.role)) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarCheck className="h-6 w-6 text-primary"/>
                        Resumen de Tareas Pendientes
                    </DialogTitle>
                    <DialogDescription>
                        Aquí tienes un resumen de tus tareas más próximas y las que ya han vencido.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <TaskListSection 
                        title="Vencidas"
                        tasks={overdueTasks}
                        icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
                    />
                    <TaskListSection 
                        title="Vencen Hoy"
                        tasks={dueTodayTasks}
                        icon={<CalendarCheck className="h-5 w-5 text-blue-500" />}
                    />
                     <TaskListSection 
                        title="Vencen Mañana"
                        tasks={dueTomorrowTasks}
                        icon={<CalendarClock className="h-5 w-5 text-yellow-500" />}
                    />
                     {overdueTasks.length === 0 && dueTodayTasks.length === 0 && dueTomorrowTasks.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">¡Excelente! No tienes tareas pendientes.</p>
                     )}
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
