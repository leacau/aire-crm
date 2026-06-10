'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { User, CoachingSession, CoachingItem, CoachingFollowUpEntry } from '@/lib/types';
import { getCoachingSessions, createCoachingSession, updateCoachingItem, appendCoachingFollowUpEntry, updateCoachingFollowUpEntry, deleteCoachingFollowUpEntry, addItemsToSession, deleteCoachingSession, updateCoachingSession, deleteCoachingItem } from '@/lib/firebase-service';
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
import { Loader2, Plus, Save, UserCheck, MoreVertical, Trash2, Archive, ArchiveRestore, ChevronDown, ChevronUp, History, Briefcase, Pencil, X, Check } from 'lucide-react';
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

    // Estado local para los inputs de "Nueva Nota" y "Nueva Acción" por cada item
    const [inputStates, setInputStates] = useState<Record<string, { action?: string, note?: string }>>({});
    const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
    const [editingEntry, setEditingEntry] = useState<{
        sessionId: string;
        itemId: string;
        field: 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        entryId: string;
        text: string;
    } | null>(null);
    const [entryToDelete, setEntryToDelete] = useState<{
        sessionId: string;
        itemId: string;
        field: 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        entryId?: string;
        legacy?: boolean;
    } | null>(null);
    const [editingLegacy, setEditingLegacy] = useState<{
        session: CoachingSession;
        item: CoachingItem;
        field: 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        text: string;
    } | null>(null);
    const [savingEntry, setSavingEntry] = useState(false);

    const canManage = isBoss || userInfo?.role === 'Gerencia' || userInfo?.role === 'Jefe' || userInfo?.role === 'Admin';

    const loadData = useCallback(async () => {
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
    }, [advisor.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const drafts: Record<string, string> = {};
        sessions.forEach(session => {
            session.items.forEach(item => {
                drafts[item.id] = '';
            });
        });
        setFollowUpDrafts(drafts);
    }, [sessions]);

    const handleCreateSession = async () => {
        if (!userInfo) return;
        
        let pendingItems: CoachingItem[] = [];
        const pendingMap = new Map<string, CoachingItem>();
        
        const chronologicalSessions = [...sessions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        chronologicalSessions.forEach(session => {
            const sessionDateStr = format(parseISO(session.date), 'dd/MM');

            session.items.forEach(item => {
                const carryKey = item.entityId
                    ? `${item.entityType}:${item.entityId}`
                    : `task:${item.taskId}`;

                if (item.status !== 'Completado' && item.status !== 'Cancelado') {
                    const isManagerOrigin = !item.origin || item.origin === 'manager';
                    let actionWithHistory = item.action;
                    
                    if (isManagerOrigin) {
                         actionWithHistory = `[Del ${sessionDateStr}] ${item.action}`;
                    }

                    pendingMap.set(carryKey, {
                        ...item,
                        id: '', // Se generará uno nuevo
                        action: actionWithHistory, 
                        status: item.status, 
                        advisorNotes: item.advisorNotes,
                        origin: item.origin || 'manager' 
                    });
                } else {
                    pendingMap.delete(carryKey);
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
                items: pendingItems, 
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
        
        // 🟢 VALIDACIÓN DE UNIDAD (Evitar que creen manual un cliente que ya está en la lista activa de la sesión)
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            const existsOpen = session.items.some(i => 
                i.entityName.toLowerCase() === newItemEntity.trim().toLowerCase() && 
                (i.status === 'Pendiente' || i.status === 'En Proceso')
            );

            if (existsOpen) {
                toast({ 
                    title: "Ya existe un seguimiento", 
                    description: `Ya hay un ítem abierto para "${newItemEntity}". Por favor, agrega tus notas o pedidos a ese mismo ítem.`, 
                    variant: "destructive" 
                });
                return;
            }
        }

        const origin = canManage ? 'manager' : 'advisor';

        const item: CoachingItem = {
            id: '', 
            taskId: '', 
            originalCreatedAt: new Date().toISOString(),
            entityType: newItemType,
            // 🟢 SOLUCIÓN AL BUG: Agregamos un entityId único basado en el nombre para evitar que Firebase fusione las tareas manuales
            entityId: `manual_${newItemEntity.trim().toLowerCase()}_${Date.now()}`,
            entityName: newItemEntity,
            action: newItemAction,
            status: 'Pendiente',
            advisorNotes: '',
            origin: origin 
        };

        try {
            await addItemsToSession(sessionId, [item]);
            setNewItemEntity('');
            setNewItemAction('');
            loadData();
            toast({ title: canManage ? "Tarea asignada" : "Agregado a cartera" });
        } catch (error) {
            toast({ title: "Error al agregar", variant: "destructive" });
        }
    };

    const handleUpdateItem = async (session: CoachingSession, item: CoachingItem, updates: Partial<CoachingItem>) => {
        if (!userInfo) return;
        try {
            await updateCoachingItem(session.id, item.id, updates as any, userInfo.id, userInfo.name, item.taskId, session.advisorId);
            
            setSessions(prev => prev.map(s => {
                let newItems = s.items;
                if (s.id === session.id) {
                    newItems = s.items.map(i => i.id === item.id ? { ...i, ...updates, lastUpdate: new Date().toISOString() } : i);
                } 
                return { ...s, items: newItems };
            }));

            toast({ title: "Actualizado" });
        } catch (error) {
            toast({ title: "Error al actualizar", variant: "destructive" });
        }
    };

    const statusOrder: Record<string, number> = {
        Completado: 1,
        'En Proceso': 2,
        Pendiente: 3,
        Cancelado: 4,
    };

    const sortItemsByStatus = (items: CoachingItem[]) => {
        return [...items].sort((a, b) => {
            const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
            if (statusDiff !== 0) return statusDiff;
            const getLatestUpdate = (item: CoachingItem) => {
                const entryDates = [
                    ...(item.followUpDoneEntries || []),
                    ...(item.followUpCurrentEntries || []),
                    ...(item.followUpNextEntries || []),
                ].map(entry => entry.createdAt);
                const dates = [
                    ...entryDates,
                    item.followUpDoneUpdatedAt,
                    item.followUpCurrentUpdatedAt,
                    item.followUpNextUpdatedAt,
                    item.lastUpdate,
                    item.originalCreatedAt,
                ].filter(Boolean) as string[];
                return Math.max(...dates.map(value => new Date(value).getTime()).filter(Number.isFinite), 0);
            };
            const dateDiff = getLatestUpdate(b) - getLatestUpdate(a);
            if (dateDiff !== 0) return dateDiff;
            return a.entityName.localeCompare(b.entityName);
        });
    };

    const formatUpdateDate = (value?: string) => {
        if (!value) return 'Sin fecha registrada';
        try {
            return format(parseISO(value), "dd/MM HH:mm");
        } catch {
            return value;
        }
    };

    const updateFollowUpDraft = (itemId: string, value: string) => {
        setFollowUpDrafts(prev => ({ ...prev, [itemId]: value }));
    };

    const saveFollowUpEntry = async (session: CoachingSession, item: CoachingItem) => {
        const value = followUpDrafts[item.id]?.trim() ?? '';
        if (!value || !userInfo) return;
        try {
            await appendCoachingFollowUpEntry(session.id, item.id, 'followUpDone', value, userInfo.id, userInfo.name);
            setFollowUpDrafts(prev => ({ ...prev, [item.id]: '' }));
            await loadData();
            toast({ title: "Asiento guardado" });
        } catch (error) {
            console.error("Error saving coaching entry:", error);
            toast({ title: "No se pudo guardar el asiento", variant: "destructive" });
        }
    };

    type TimelineEntry = CoachingFollowUpEntry & {
        field: 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        legacy?: boolean;
    };

    const getFollowUpTimeline = (item: CoachingItem): TimelineEntry[] => {
        const fields = [
            { field: 'followUpDone' as const, entries: item.followUpDoneEntries || [], text: item.followUpDone || item.advisorNotes || '', updatedAt: item.followUpDoneUpdatedAt },
            { field: 'followUpCurrent' as const, entries: item.followUpCurrentEntries || [], text: item.followUpCurrent || '', updatedAt: item.followUpCurrentUpdatedAt },
            { field: 'followUpNext' as const, entries: item.followUpNextEntries || [], text: item.followUpNext || '', updatedAt: item.followUpNextUpdatedAt },
        ];

        return fields.flatMap(({ field, entries, text, updatedAt }) => [
            ...entries.map(entry => ({ ...entry, field })),
            ...(text ? [{
                id: `legacy-${field}`,
                text,
                createdAt: updatedAt || item.lastUpdate || item.originalCreatedAt,
                createdById: '',
                createdByName: 'Historial anterior',
                field,
                legacy: true,
            }] : []),
        ]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    const saveEditedEntry = async () => {
        if (!editingEntry || !userInfo || !editingEntry.text.trim() || !canManage) return;
        setSavingEntry(true);
        try {
            await updateCoachingFollowUpEntry(
                editingEntry.sessionId,
                editingEntry.itemId,
                editingEntry.field,
                editingEntry.entryId,
                editingEntry.text,
                userInfo.id,
                userInfo.name,
            );
            setEditingEntry(null);
            await loadData();
            toast({ title: "Asiento actualizado" });
        } catch (error) {
            console.error("Error updating coaching entry:", error);
            toast({ title: "No se pudo actualizar el asiento", variant: "destructive" });
        } finally {
            setSavingEntry(false);
        }
    };

    const confirmDeleteEntry = async () => {
        if (!entryToDelete || !userInfo || !canManage) return;
        setSavingEntry(true);
        try {
            if (entryToDelete.legacy) {
                const session = sessions.find(candidate => candidate.id === entryToDelete.sessionId);
                const item = session?.items.find(candidate => candidate.id === entryToDelete.itemId);
                if (!session || !item) throw new Error("Registro histórico no encontrado");
                const updatedAtField = `${entryToDelete.field}UpdatedAt` as keyof CoachingItem;
                await updateCoachingItem(
                    session.id,
                    item.id,
                    {
                        [entryToDelete.field]: '',
                        [updatedAtField]: new Date().toISOString(),
                        ...(entryToDelete.field === 'followUpDone' ? { advisorNotes: '' } : {}),
                    },
                    userInfo.id,
                    userInfo.name,
                    item.taskId,
                    session.advisorId,
                );
            } else if (entryToDelete.entryId) {
                await deleteCoachingFollowUpEntry(
                    entryToDelete.sessionId,
                    entryToDelete.itemId,
                    entryToDelete.field,
                    entryToDelete.entryId,
                    userInfo.id,
                    userInfo.name,
                );
            }
            setEntryToDelete(null);
            await loadData();
            toast({ title: "Asiento eliminado" });
        } catch (error) {
            console.error("Error deleting coaching entry:", error);
            toast({ title: "No se pudo eliminar el asiento", variant: "destructive" });
        } finally {
            setSavingEntry(false);
        }
    };

    const saveEditedLegacy = async () => {
        if (!editingLegacy || !userInfo || !canManage) return;
        setSavingEntry(true);
        try {
            const updatedAtField = `${editingLegacy.field}UpdatedAt` as keyof CoachingItem;
            await handleUpdateItem(editingLegacy.session, editingLegacy.item, {
                [editingLegacy.field]: editingLegacy.text.trim(),
                [updatedAtField]: new Date().toISOString(),
                ...(editingLegacy.field === 'followUpDone' ? { advisorNotes: editingLegacy.text.trim() } : {}),
            });
            setEditingLegacy(null);
            await loadData();
        } finally {
            setSavingEntry(false);
        }
    };

    const commitNote = async (session: CoachingSession, item: CoachingItem) => {
        const newVal = inputStates[item.id]?.note;
        if (!newVal?.trim()) return;
        
        const dateStr = format(new Date(), "dd/MM HH:mm");
        const toAppend = `[${dateStr}] ${newVal.trim()}`;
        
        const updatedNotes = item.advisorNotes 
            ? `${item.advisorNotes}\n\n${toAppend}` 
            : toAppend;
        
        await handleUpdateItem(session, item, { advisorNotes: updatedNotes });
        setInputStates(prev => ({...prev, [item.id]: { ...prev[item.id], note: '' }}));
    };

    const commitAction = async (session: CoachingSession, item: CoachingItem) => {
        const newVal = inputStates[item.id]?.action;
        if (!newVal?.trim()) return;
        
        const dateStr = format(new Date(), "dd/MM");
        const toAppend = `[Jefatura ${dateStr}] ${newVal.trim()}`;
        
        const updatedAction = item.action 
            ? `${item.action}\n\n${toAppend}` 
            : toAppend;
        
        await handleUpdateItem(session, item, { action: updatedAction });
        setInputStates(prev => ({...prev, [item.id]: { ...prev[item.id], action: '' }}));
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

    const renderItemRow = (session: CoachingSession, item: CoachingItem) => {
        const timeline = getFollowUpTimeline(item);

        return (
        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[45%_55%] gap-4 p-4 border rounded-lg bg-card/50 shadow-sm transition-shadow">
            
            <div className="space-y-3 border-r md:pr-4 border-dashed md:border-solid border-border/50 relative">
                <div className="flex flex-wrap items-center gap-2 pr-6">
                    <Badge variant="outline" className="capitalize bg-background text-[10px]">{item.entityType === 'general' ? 'General' : 'Cliente/Prospecto'}</Badge>
                    <span className="font-semibold text-sm truncate block max-w-full" title={item.entityName}>{item.entityName}</span>
                </div>
                
                {(canManage || (item.origin === 'advisor' && session.status === 'Open')) && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 absolute top-0 right-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteItem(session.id, item.id)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                )}

                <div className="bg-muted/30 p-2 rounded text-sm font-medium text-foreground/90 border whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                    {item.action}
                </div>

                {canManage && session.status === 'Open' && (
                     <div className="flex gap-2 items-center">
                        <Input 
                            className="h-8 text-xs bg-background"
                            placeholder="Nueva indicación..."
                            value={inputStates[item.id]?.action || ''}
                            onChange={e => setInputStates(prev => ({...prev, [item.id]: {...prev[item.id], action: e.target.value}}))}
                            onKeyDown={e => e.key === 'Enter' && commitAction(session, item)}
                        />
                        <Button size="icon" variant="secondary" className="h-8 w-8 shrink-0" onClick={() => commitAction(session, item)}>
                            <Plus className="h-4 w-4" />
                        </Button>
                     </div>
                )}
                
                <div className="pt-1 flex items-center justify-between">
                    <Select 
                        value={item.status} 
                        onValueChange={(val) => handleUpdateItem(session, item, { status: val as any })}
                        disabled={session.status === 'Closed' && !canManage && !(item.origin === 'advisor')}
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

            <div className="flex h-full flex-col space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4" /> Bitácora
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                        {timeline.length} {timeline.length === 1 ? 'asiento' : 'asientos'}
                    </span>
                </div>

                {timeline.length > 0 ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
                        {timeline.map(entry => (
                            <div key={`${entry.field}-${entry.id}`} className="rounded border bg-background px-3 py-2 text-sm">
                                {entry.legacy && editingLegacy?.item.id === item.id && editingLegacy.field === entry.field ? (
                                    <div className="space-y-2">
                                        <Textarea
                                            value={editingLegacy.text}
                                            onChange={event => setEditingLegacy({ ...editingLegacy, text: event.target.value })}
                                            className="min-h-[72px] resize-y"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-1">
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingLegacy(null)} disabled={savingEntry}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="icon" className="h-7 w-7" onClick={saveEditedLegacy} disabled={savingEntry || !editingLegacy.text.trim()}>
                                                {savingEntry ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>
                                    </div>
                                ) : editingEntry?.entryId === entry.id ? (
                                            <div className="space-y-2">
                                                <Textarea
                                                    value={editingEntry.text}
                                                    onChange={event => setEditingEntry({ ...editingEntry, text: event.target.value })}
                                                    className="min-h-[72px] resize-y"
                                                    autoFocus
                                                />
                                                <div className="flex justify-end gap-1">
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingEntry(null)} disabled={savingEntry} title="Cancelar edición">
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button size="icon" className="h-7 w-7" onClick={saveEditedEntry} disabled={savingEntry || !editingEntry.text.trim()} title="Guardar cambios">
                                                        {savingEntry ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-start gap-2">
                                                    <p className="min-w-0 flex-1 whitespace-pre-wrap">{entry.text}</p>
                                                    {canManage && (
                                                        <div className="flex shrink-0 gap-1">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6"
                                                                onClick={() => entry.legacy
                                                                    ? setEditingLegacy({ session, item, field: entry.field, text: entry.text })
                                                                    : setEditingEntry({ sessionId: session.id, itemId: item.id, field: entry.field, entryId: entry.id, text: entry.text })
                                                                }
                                                                title="Editar asiento"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6 text-destructive hover:text-destructive"
                                                                onClick={() => setEntryToDelete({
                                                                    sessionId: session.id,
                                                                    itemId: item.id,
                                                                    field: entry.field,
                                                                    entryId: entry.legacy ? undefined : entry.id,
                                                                    legacy: entry.legacy,
                                                                })}
                                                                title="Eliminar asiento"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-[10px] text-muted-foreground">
                                                    {formatUpdateDate(entry.createdAt)} · {entry.createdByName || 'Sistema'}
                                                    {entry.updatedAt && <> · Editado {formatUpdateDate(entry.updatedAt)} por {entry.updatedByName || 'Jefatura'}</>}
                                                </p>
                                            </>
                                        )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Todavía no hay movimientos registrados.
                    </div>
                )}

                <Textarea
                    className="min-h-[84px] resize-none bg-background text-sm"
                    placeholder={session.status === 'Closed' ? "Reunión cerrada" : "Agregar un nuevo comentario a la bitácora..."}
                    value={followUpDrafts[item.id] ?? ''}
                    onChange={event => updateFollowUpDraft(item.id, event.target.value)}
                    disabled={session.status === 'Closed'}
                />
                {session.status === 'Open' && (
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveFollowUpEntry(session, item)}
                            disabled={!followUpDrafts[item.id]?.trim()}
                        >
                            <Save className="mr-2 h-3.5 w-3.5" /> Agregar a la bitácora
                        </Button>
                    </div>
                )}

                {item.lastUpdate && (
                    <p className="text-[10px] text-muted-foreground text-right italic">
                        Última act: {format(parseISO(item.lastUpdate), "dd/MM HH:mm")}
                    </p>
                )}
            </div>
        </div>
        );
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

                {sessions.map((session) => {
                    const managerItems = sortItemsByStatus(session.items.filter(i => !i.origin || i.origin === 'manager'));
                    const advisorItems = sortItemsByStatus(session.items.filter(i => i.origin === 'advisor'));

                    return (
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
                                                {session.items.length} tareas ({managerItems.length} Jefatura / {advisorItems.length} Propias)
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
                                {managerItems.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                                            <Briefcase className="h-3 w-3" /> Solicitudes de Jefatura
                                        </h4>
                                        {managerItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {advisorItems.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <h4 className="text-xs uppercase font-bold text-primary flex items-center gap-2 border-t pt-4">
                                            <UserCheck className="h-3 w-3" /> Cartera Autogenerada (Asesor)
                                        </h4>
                                        {advisorItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {session.items.length === 0 && session.status === 'Open' && (
                                    <div className="text-center text-sm text-muted-foreground italic py-2">
                                        Aún no hay compromisos asignados para esta semana.
                                    </div>
                                )}

                                {session.status === 'Open' && (
                                    <div className={`p-3 rounded-lg border border-dashed flex flex-col md:flex-row gap-3 items-end mt-4 ${canManage ? 'bg-muted/40' : 'bg-blue-50/50 border-blue-200'}`}>
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
                                            <Label className="text-xs">{canManage ? 'Solicitud / Pedido' : 'Propuesta / Tarea'}</Label>
                                            <Input 
                                                className="h-8 text-xs bg-background"
                                                placeholder={canManage ? "Ej: Pedir propuesta..." : "Ej: Llamar para ofrecer..."}
                                                value={newItemAction}
                                                onChange={e => setNewItemAction(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddItem(session.id)}
                                            />
                                        </div>
                                        <Button size="sm" onClick={() => handleAddItem(session.id)} className="shrink-0 h-8 px-3">
                                            <Plus className="h-4 w-4" /> {canManage ? 'Asignar' : 'Agregar'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )})}
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

            <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar este asiento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se quitará de la bitácora del asesor. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={savingEntry}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteEntry}
                            disabled={savingEntry}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {savingEntry && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
