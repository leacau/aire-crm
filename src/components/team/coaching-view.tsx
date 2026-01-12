'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { User, CoachingSession, CoachingItem } from '@/lib/types';
import { getCoachingSessions, createCoachingSession, updateCoachingItem, addItemsToSession } from '@/lib/firebase-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Plus, Save, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function CoachingView({ advisor }: { advisor: User }) {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Estados para nueva sesión / items
    const [newItemEntity, setNewItemEntity] = useState('');
    const [newItemAction, setNewItemAction] = useState('');
    const [newItemType, setNewItemType] = useState<'client' | 'prospect' | 'general'>('client');

    const canManage = isBoss || userInfo?.role === 'Gerencia' || userInfo?.role === 'Jefe';

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getCoachingSessions(advisor.id);
            setSessions(data);
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
        try {
            await createCoachingSession({
                advisorId: advisor.id,
                advisorName: advisor.name,
                managerId: userInfo.id,
                managerName: userInfo.name,
                date: new Date().toISOString(),
                items: [],
                generalNotes: ''
            }, userInfo.id, userInfo.name);
            
            toast({ title: "Sesión iniciada", description: "Se ha creado una nueva acta de reunión." });
            loadData();
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo crear la sesión. Revisa la consola por errores de permisos o índices.", variant: "destructive" });
        }
    };

    const handleAddItem = async (sessionId: string) => {
        if (!newItemEntity.trim() || !newItemAction.trim()) return;
        
        const item: CoachingItem = {
            id: '', // Se genera en backend
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

    const handleUpdateItem = async (sessionId: string, itemId: string, updates: { status?: string, advisorNotes?: string }) => {
        if (!userInfo) return;
        try {
            await updateCoachingItem(sessionId, itemId, updates, userInfo.id, userInfo.name);
            // Optimistic update
            setSessions(prev => prev.map(s => {
                if (s.id === sessionId) {
                    return {
                        ...s,
                        items: s.items.map(i => i.id === itemId ? { ...i, ...updates, lastUpdate: new Date().toISOString() } : i)
                    };
                }
                return s;
            }));
            toast({ title: "Actualizado" });
        } catch (error) {
            toast({ title: "Error al actualizar", variant: "destructive" });
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6 h-full flex flex-col pt-2"> 
            <div className="flex justify-between items-center shrink-0 pb-4">
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

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 pb-20">
                {sessions.length === 0 && (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <p>No hay sesiones de seguimiento registradas.</p>
                            {canManage && <p className="text-sm mt-2">Inicia una nueva reunión para comenzar a asignar tareas.</p>}
                        </CardContent>
                    </Card>
                )}

                {sessions.map((session) => (
                    <Card key={session.id} className="overflow-hidden border-l-4 border-l-primary/50">
                        <CardHeader className="bg-muted/30 pb-3 pt-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle className="text-base">Reunión del {format(parseISO(session.date), "d 'de' MMMM, yyyy", { locale: es })}</CardTitle>
                                    <CardDescription className="text-xs">Liderada por: {session.managerName}</CardDescription>
                                </div>
                                <Badge variant={session.status === 'Open' ? 'default' : 'secondary'}>
                                    {session.status === 'Open' ? 'En curso' : 'Cerrada'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-6">
                            {/* Lista de Compromisos */}
                            <div className="space-y-4">
                                {session.items.length === 0 && session.status === 'Open' && (
                                    <div className="text-center text-sm text-muted-foreground italic py-2">
                                        Aún no hay compromisos asignados para esta semana.
                                    </div>
                                )}
                                {session.items.map((item) => (
                                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-[40%_60%] gap-4 p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
                                        
                                        {/* Columna Izquierda: La Tarea (Definida por Jefe) */}
                                        <div className="space-y-3 border-r md:pr-4 border-dashed md:border-solid border-border/50">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className="capitalize bg-background">{item.entityType === 'general' ? 'General' : 'Cliente/Prospecto'}</Badge>
                                                <span className="font-semibold text-sm truncate block max-w-full" title={item.entityName}>{item.entityName}</span>
                                            </div>
                                            <div className="bg-muted/30 p-2 rounded text-sm font-medium text-foreground/90 border">
                                                {item.action}
                                            </div>
                                            
                                            {/* Estado Visual */}
                                            <div className="pt-1">
                                                <Select 
                                                    value={item.status} 
                                                    onValueChange={(val) => handleUpdateItem(session.id, item.id, { status: val })}
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
                                                onBlur={(e) => {
                                                    if (e.target.value !== item.advisorNotes) {
                                                        handleUpdateItem(session.id, item.id, { advisorNotes: e.target.value });
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
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
