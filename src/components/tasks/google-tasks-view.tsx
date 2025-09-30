
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getTaskLists, getTasks, createTask, updateTask } from '@/lib/google-tasks-service';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PlusCircle } from 'lucide-react';

interface TaskList {
    id: string;
    title: string;
}

interface Task {
    id: string;
    title: string;
    status: 'needsAction' | 'completed';
    due?: string;
    notes?: string;
}

const TasksView = () => {
    const { getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    
    const [taskLists, setTaskLists] = useState<TaskList[]>([]);
    const [selectedTaskListId, setSelectedTaskListId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const [loading, setLoading] = useState(true);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTaskLists = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getGoogleAccessToken();
            if (!token) throw new Error("No se pudo obtener el token de acceso.");
            
            const lists = await getTaskLists(token);
            setTaskLists(lists);

            if (lists.length > 0) {
                const primaryList = lists.find((l: TaskList) => l.title.includes('My Tasks')) || lists[0];
                setSelectedTaskListId(primaryList.id);
            }

        } catch (err: any) {
            setError(`Error al cargar las listas de tareas: ${err.message}`);
            toast({ title: "Error", description: err.message, variant: 'destructive'});
        } finally {
            setLoading(false);
        }
    }, [getGoogleAccessToken, toast]);

    useEffect(() => {
        fetchTaskLists();
    }, [fetchTaskLists]);

    const fetchTasks = useCallback(async (listId: string) => {
        setLoadingTasks(true);
        try {
            const token = await getGoogleAccessToken();
            if (!token) throw new Error("No se pudo obtener el token de acceso.");

            const fetchedTasks = await getTasks(token, listId);
            setTasks(fetchedTasks.filter((t: Task) => t.status === 'needsAction'));
        } catch (err: any) {
            setError(`Error al cargar las tareas: ${err.message}`);
            toast({ title: "Error", description: err.message, variant: 'destructive'});
        } finally {
            setLoadingTasks(false);
        }
    }, [getGoogleAccessToken, toast]);

    useEffect(() => {
        if (selectedTaskListId) {
            fetchTasks(selectedTaskListId);
        }
    }, [selectedTaskListId, fetchTasks]);

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim() || !selectedTaskListId) return;

        setIsCreatingTask(true);
        try {
            const token = await getGoogleAccessToken();
            if (!token) throw new Error("No se pudo obtener el token de acceso.");

            await createTask(token, selectedTaskListId, { title: newTaskTitle });
            setNewTaskTitle('');
            toast({ title: 'Tarea creada' });
            fetchTasks(selectedTaskListId); // Refresh list
        } catch (err: any) {
            toast({ title: "Error al crear la tarea", description: err.message, variant: 'destructive'});
        } finally {
            setIsCreatingTask(false);
        }
    }
    
    const handleTaskToggle = async (task: Task) => {
        if (!selectedTaskListId) return;

        const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';
        const originalTasks = [...tasks];
        
        setTasks(prev => prev.filter(t => t.id !== task.id));

        try {
            const token = await getGoogleAccessToken();
            if (!token) throw new Error("No se pudo obtener el token de acceso.");
            
            await updateTask(token, selectedTaskListId, task.id, { ...task, status: newStatus });
            toast({ title: `Tarea ${newStatus === 'completed' ? 'completada' : 'reactivada'}` });
            
            // Refetch to be sure
            fetchTasks(selectedTaskListId);

        } catch (err: any) {
            setTasks(originalTasks); // Revert on error
            toast({ title: "Error al actualizar la tarea", description: err.message, variant: 'destructive'});
        }
    }

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size="large" /></div>;
    }
     if (error) {
        return <p className="text-destructive text-center py-8">{error}</p>;
    }
    
    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <CardTitle>Mis Tareas de Google</CardTitle>
                {taskLists.length > 0 && selectedTaskListId && (
                     <Select value={selectedTaskListId} onValueChange={setSelectedTaskListId}>
                        <SelectTrigger className="w-full sm:w-[280px]">
                            <SelectValue placeholder="Seleccionar lista de tareas" />
                        </SelectTrigger>
                        <SelectContent>
                            {taskLists.map(list => (
                                <SelectItem key={list.id} value={list.id}>{list.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <form onSubmit={handleCreateTask} className="flex items-center gap-2 mb-4">
                <Input 
                    placeholder="Añadir una nueva tarea..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    disabled={isCreatingTask}
                />
                <Button type="submit" disabled={isCreatingTask}>
                    {isCreatingTask ? <Spinner size="small" color="white"/> : <PlusCircle />}
                </Button>
            </form>

            {loadingTasks ? (
                <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
                <div className="space-y-3">
                    {tasks.length > 0 ? tasks.map(task => (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-md border bg-background hover:bg-muted/50">
                            <Checkbox
                                id={`task-${task.id}`}
                                checked={task.status === 'completed'}
                                onCheckedChange={() => handleTaskToggle(task)}
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <label htmlFor={`task-${task.id}`} className="font-medium text-sm leading-none cursor-pointer">
                                    {task.title}
                                </label>
                                {task.notes && <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>}
                            </div>
                        </div>
                    )) : (
                        <p className="text-center text-muted-foreground py-6">No hay tareas pendientes en esta lista.</p>
                    )}
                </div>
            )}
        </>
    );
};


export function GoogleTasksView() {
    const { hasGoogleAccessToken, getGoogleAccessToken } = useAuth();
    const [hasToken, setHasToken] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkToken = async () => {
            setIsLoading(true);
            const tokenExists = await hasGoogleAccessToken();
            setHasToken(tokenExists);
            setIsLoading(false);
        };
        checkToken();
    }, []);

    const handleConnect = async () => {
        setIsLoading(true);
        await getGoogleAccessToken();
        const tokenExists = await hasGoogleAccessToken();
        setHasToken(tokenExists);
        setIsLoading(false);
    };

    if (isLoading) {
         return (
            <div className="flex h-full w-full items-center justify-center">
                <Spinner size="large" />
            </div>
        );
    }
    
    return (
        <Card className="max-w-3xl mx-auto">
            <CardHeader>
                 <CardDescription>Visualiza y gestiona tus tareas de Google directamente desde el CRM.</CardDescription>
            </CardHeader>
            <CardContent>
                {hasToken ? (
                    <TasksView />
                ) : (
                    <div className="text-center py-10">
                        <h3 className="text-lg font-semibold mb-2">Conecta tu cuenta de Google</h3>
                        <p className="text-muted-foreground mb-4">Para gestionar tus tareas, necesitas dar permiso a la aplicación.</p>
                        <Button onClick={handleConnect}>Conectar con Google Tasks</Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

