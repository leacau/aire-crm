'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { User, CoachingSession, CoachingItem } from '@/lib/types';
import { getCoachingSessions, createCoachingSession, updateCoachingItem, addItemsToSession, deleteCoachingSession, updateCoachingSession, deleteCoachingItem } from '@/lib/firebase-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Plus, Save, UserCheck, MoreVertical, Trash2, Archive, ArchiveRestore, ChevronDown, ChevronUp, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function CoachingView({ advisor }: { advisor: User }) {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Estados para nueva sesión / items
    const [newItemEntity, setNewItemEntity] = useState('');
    const [newItemAction, setNewItemAction] = useState('');
    const [newItemType, setNewItemType] = useState<'client' | 'prospect' | 'general'>('client');
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [openSessions, setOpenSessions] = useState<Record<string, boolean>>({});

    const canManage = isBoss || userInfo?.role === 'Gerencia' || userInfo?.role === 'Jefe';

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getCoachingSessions(advisor.id);
            setSessions(data);
            
            // Expandir automáticamente solo las sesiones "Open"
            const initialOpenState: Record<string, boolean> = {};
            data.forEach(s => {
                if (s.status === 'Open') initialOpenState[s.id] = true;
            });
            setOpenSessions(initialOpenState);

        } catch (error) {
            console.error("Error loading coaching sessions:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [advisor.id]);

    const handleCreateSession = async () => {
        if (!userInfo) return;
        
        // 1. Identificar tareas pendientes de sesiones anteriores (ordenadas por fecha descendente, la 0 es la última)
        let pendingItems: CoachingItem[] = [];
        
        // Buscamos en todas las sesiones las tareas que no estén completadas ni canceladas
        // Usamos un Map para no duplicar taskIds (si una tarea aparece en varias sesiones antiguas, tomamos la más reciente)
        const pendingMap = new Map<string, CoachingItem>();
        
        // Recorremos desde la más antigua a la más nueva para que la versión más reciente sobrescriba
        [...sessions].reverse().forEach(session => {
            session.items.forEach(item => {
                if (item.status !== 'Completado' && item.status !== 'Cancelado') {
                    // Creamos una copia limpia para la nueva sesión
                    pendingMap.set(item.taskId, {
                        ...item,
                        id: '', // Se generará uno nuevo
                        // Mantenemos taskId y originalCreatedAt
                        status: item.status, // Mantenemos estado (Pendiente/En Proceso)
                        advisorNotes: item.advisorNotes // Mantenemos notas previas
                    });
                } else {
                    // Si se completó en algún momento, la quitamos del mapa de pendientes
                    pendingMap.delete(item.taskId);
                }
            });
        });

        pendingItems = Array.from(pendingMap.values());

        try {
            await createCoachingSession({
                advisorId: advisor.id,
                advisorName: advisor.name,
                managerId: userInfo.id,
                managerName: userInfo.name,
                date: new Date().toISOString(),
                items: pendingItems, // Tareas arrastradas
                generalNotes: ''
            }, userInfo.id, userInfo.name);
            
            const msg = pendingItems.length > 0 
                ? `Se ha creado una nueva acta con ${pendingItems.length} tareas pendientes arrastradas.`
                : "Se ha creado una nueva acta de reunión.";

            toast({ title: "Sesión iniciada", description: msg });
            loadData();
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo crear la sesión.", variant: "destructive" });
        }
    };

    const handleAddItem = async (sessionId: string) => {
        if (!newItemEntity.trim() || !newItemAction.trim()) return;
        
        const item: CoachingItem = {
            id: '', 
            taskId: '', // Se genera en backend
            originalCreatedAt: new Date().toISOString(),
            entityType: newItemType,
            entityName: newItemEntity,
            action: newItemAction,
            status: 'Pendiente',
            advisorNotes: ''
        };

        try {
            await addItemsToSession(sessionId, [item]);
            setNewItemEntity('');
            setNewItemAction('');
            loadData();
            toast({ title: "Compromiso agregado" });
        } catch (error) {
            toast({ title: "Error al agregar", variant: "destructive" });
        }
    };

    const handleUpdateItem = async (session: CoachingSession, item: CoachingItem, updates: { status?: string, advisorNotes?: string }) => {
        if (!userInfo) return;
        try {
            // Pasamos taskId y advisorId para la propagación
            await updateCoachingItem(session.id, item.id, updates, userInfo.id, userInfo.name, item.taskId, session.advisorId);
            
            // Update local optimista (recargamos todo para ver sync pero actualizamos local rápido)
            setSessions(prev => prev.map(s => {
                // Actualizar en la sesión actual
                let newItems = s.items;
                if (s.id === session.id) {
                    newItems = s.items.map(i => i.id === item.id ? { ...i, ...updates, lastUpdate: new Date().toISOString() } : i);
                } 
                // Actualizar en otras sesiones si hay cambio de estado (Visualmente)
                else if (updates.status && item.taskId) {
                    newItems = s.items.map(i => i.taskId === item.taskId ? { ...i, status: updates.status as any } : i);
                }
                return { ...s, items: newItems };
            }));

            toast({ title: "Actualizado" });
        } catch (error) {
            toast({ title: "Error al actualizar", variant: "destructive" });
        }
    };

    const handleDeleteSession = async () => {
        if (!sessionToDelete || !userInfo) return;
        try {
            await deleteCoachingSession(sessionToDelete, userInfo.id, userInfo.name);
            setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
            toast({ title: "Sesión eliminada" });
        } catch (error) {
            console.error(error);
            toast({ title: "Error al eliminar", variant: "destructive" });
        } finally {
            setSessionToDelete(null);
        }
    };

    const handleDeleteItem = async (sessionId: string, itemId: string) => {
        if (!userInfo) return;
        try {
            await deleteCoachingItem(sessionId, itemId);
            setSessions(prev => prev.map(s => {
                if (s.id === sessionId) {
                    return { ...s, items: s.items.filter(i => i.id !== itemId) };
                }
                return s;
            }));
            toast({ title: "Tarea eliminada" });
        } catch (error) {
            toast({ title: "Error al eliminar tarea", variant: "destructive" });
        }
    };

    const handleToggleStatus = async (session: CoachingSession) => {
        if (!userInfo) return;
        const newStatus = session.status === 'Open' ? 'Closed' : 'Open';
        try {
            await updateCoachingSession(session.id, { status: newStatus }, userInfo.id, userInfo.name);
            setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: newStatus } : s));
            
            // Si cerramos, colapsamos
            if (newStatus === 'Closed') {
                setOpenSessions(prev => ({ ...prev, [session.id]: false }));
            } else {
                setOpenSessions(prev => ({ ...prev, [session.id]: true }));
            }

            toast({ title: newStatus === 'Closed' ? "Sesión cerrada" : "Sesión reabierta" });
        } catch (error) {
            toast({ title: "Error al actualizar estado", variant: "destructive" });
        }
    };

    const toggleCollapse = (sessionId: string) => {
        setOpenSessions(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6 h-full flex flex-col pt-2"> 
            <div className="flex justify-between items-center shrink-0 pb-4 pr-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-primary"/> 
                        Historial de Reuniones
                    </h2>
                    <p className="text-muted-foreground text-sm">Compromisos con {advisor.name}</p>
                </div>
                {canManage && (
                    <Button onClick={handleCreateSession} size="sm">
                        <Plus className="mr-2 h-4 w-4" /> Nueva Reunión
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-20">
                {sessions.length === 0 && (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <p>No hay sesiones de seguimiento registradas.</p>
                            {canManage && <p className="text-sm mt-2">Inicia una nueva reunión para comenzar a asignar tareas.</p>}
                        </CardContent>
                    </Card>
                )}

                {sessions.map((session) => (
                    <Collapsible 
                        key={session.id} 
                        open={openSessions[session.id]} 
                        onOpenChange={() => toggleCollapse(session.id)}
                        className={`border rounded-lg bg-card transition-all ${session.status === 'Open' ? 'border-primary/50 shadow-sm' : 'border-border/60 opacity-90'}`}
                    >
                        <div className="flex items-center justify-between p-4">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-4 hover:bg-transparent p-0 h-auto font-normal text-left w-full justify-start">
                                    {openSessions[session.id] ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                    
                                    <div className="flex flex-col items-start">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-base">
                                                Reunión del {format(parseISO(session.date), "d 'de' MMMM", { locale: es })}
                                            </span>
                                            <Badge variant={session.status === 'Open' ? 'default' : 'secondary'} className="text-[10px] h-5">
                                                {session.status === 'Open' ? 'En curso' : 'Cerrada'}
                                            </Badge>
                                        </div>
                                        {!openSessions[session.id] && (
                                            <span className="text-xs text-muted-foreground">
                                                {session.items.length} tareas · Liderada por {session.managerName}
                                            </span>
                                        )}
                                    </div>
                                </Button>
                            </CollapsibleTrigger>

                            {canManage && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0 shrink-0">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleToggleStatus(session)}>
                                            {session.status === 'Open' ? (
                                                <>
                                                    <Archive className="mr-2 h-4 w-4" /> Cerrar Sesión
                                                </>
                                            ) : (
                                                <>
                                                    <ArchiveRestore className="mr-2 h-4 w-4" /> Reabrir Sesión
                                                </>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onClick={() => setSessionToDelete(session.id)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar Sesión
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>

                        <CollapsibleContent>
                            <div className="px-4 pb-4 pt-0 space-y-6">
                                {/* Lista de Compromisos */}
                                <div className="space-y-4">
                                    {session.items.length === 0 && session.status === 'Open' && (
                                        <div className="text-center text-sm text-muted-foreground italic py-2">
                                            Aún no hay compromisos asignados para esta semana.
                                        </div>
                                    )}
                                    {session.items.map((item) => (
                                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[40%_60%] gap-4 p-4 border rounded-lg bg-card/50 shadow-sm transition-shadow">
                                            
                                            {/* Columna Izquierda: La Tarea (Definida por Jefe) */}
                                            <div className="space-y-3 border-r md:pr-4 border-dashed md:border-solid border-border/50 relative">
                                                <div className="flex flex-wrap items-center gap-2 pr-6">
                                                    <Badge variant="outline" className="capitalize bg-background text-[10px]">{item.entityType === 'general' ? 'General' : 'Cliente/Prospecto'}</Badge>
                                                    <span className="font-semibold text-sm truncate block max-w-full" title={item.entityName}>{item.entityName}</span>
                                                </div>
                                                
                                                {canManage && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6 absolute top-0 right-0 text-muted-foreground hover:text-destructive"
                                                        onClick={() => handleDeleteItem(session.id, item.id)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}

                                                <div className="bg-muted/30 p-2 rounded text-sm font-medium text-foreground/90 border">
                                                    {item.action}
                                                </div>
                                                
                                                {/* Estado Visual */}
                                                <div className="pt-1 flex items-center justify-between">
                                                    <Select 
                                                        value={item.status} 
                                                        onValueChange={(val) => handleUpdateItem(session, item, { status: val })}
                                                        disabled={session.status === 'Closed' && !canManage}
                                                    >
                                                        <SelectTrigger className={`w-full md:w-[160px] h-8 text-xs font-medium border ${
                                                            item.status === 'Completado' ? 'bg-green-50 text-green-700 border-green-200' : 
                                                            item.status === 'En Proceso' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                                            item.status === 'Cancelado' ? 'bg-red-50 text-red-700 border-red-200' : ''
                                                        }`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Pendiente">Pendiente</SelectItem>
                                                            <SelectItem value="En Proceso">En Proceso</SelectItem>
                                                            <SelectItem value="Completado">Completado</SelectItem>
                                                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    
                                                    {item.originalCreatedAt && (
                                                        <div className="flex items-center text-[10px] text-muted-foreground" title={`Creada el ${format(parseISO(item.originalCreatedAt), 'dd/MM/yyyy')}`}>
                                                            <History className="h-3 w-3 mr-1" />
                                                            {format(parseISO(item.originalCreatedAt), 'dd/MM')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Columna Derecha: Bitácora (Escribida por Asesor) */}
                                            <div className="space-y-2 flex flex-col h-full">
                                                <Label className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
                                                    <Save className="h-3 w-3" /> Bitácora de Avance (Asesor)
                                                </Label>
                                                <Textarea 
                                                    className="flex-1 min-h-[80px] text-sm resize-none bg-yellow-50/50 focus:bg-background transition-colors border-yellow-100 focus:border-primary"
                                                    placeholder="Escribe aquí los avances diarios..."
                                                    defaultValue={item.advisorNotes}
                                                    disabled={session.status === 'Closed'}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== item.advisorNotes) {
                                                            handleUpdateItem(session, item, { advisorNotes: e.target.value });
                                                        }
                                                    }}
                                                />
                                                {item.lastUpdate && (
                                                    <p className="text-[10px] text-muted-foreground text-right italic">
                                                        Última act: {format(parseISO(item.lastUpdate), "dd/MM HH:mm")}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Formulario para agregar items (Solo visible para jefes si está abierta) */}
                                {canManage && session.status === 'Open' && (
                                    <div className="bg-muted/40 p-3 rounded-lg border border-dashed flex flex-col md:flex-row gap-3 items-end mt-4">
                                        <div className="w-full md:w-[120px] space-y-1">
                                            <Label className="text-xs">Tipo</Label>
                                            <Select value={newItemType} onValueChange={(v: any) => setNewItemType(v)}>
                                                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="client">Cliente</SelectItem>
                                                    <SelectItem value="prospect">Prospecto</SelectItem>
                                                    <SelectItem value="general">General</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-full md:w-[200px] space-y-1">
                                            <Label className="text-xs">Nombre</Label>
                                            <Input 
                                                className="h-8 text-xs bg-background"
                                                placeholder="Ej: Coca Cola" 
                                                value={newItemEntity}
                                                onChange={e => setNewItemEntity(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1 w-full space-y-1">
                                            <Label className="text-xs">Acción a realizar</Label>
                                            <Input 
                                                className="h-8 text-xs bg-background"
                                                placeholder="Ej: Presentar propuesta..." 
                                                value={newItemAction}
                                                onChange={e => setNewItemAction(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddItem(session.id)}
                                            />
                                        </div>
                                        <Button size="sm" onClick={() => handleAddItem(session.id)} className="shrink-0 h-8 px-3">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                ))}
            </div>

            <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se perderán todos los compromisos y notas asociadas a esta fecha.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
