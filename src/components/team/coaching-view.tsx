'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { User, CoachingSession, CoachingItem, CoachingFollowUpEntry, Client, Prospect } from '@/lib/types';
import { getCoachingSessions, createCoachingSession, updateCoachingItem, appendCoachingFollowUpEntry, updateCoachingFollowUpEntry, deleteCoachingFollowUpEntry, addItemsToSession, deleteCoachingSession, updateCoachingSession, deleteCoachingItem, invalidateCache, getClients, getProspects, createProspect, updateProspect } from '@/lib/firebase-service';
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
import { Loader2, Plus, Save, UserCheck, MoreVertical, Trash2, Archive, ArchiveRestore, ChevronDown, ChevronUp, History, Briefcase, Pencil, X, Check, RefreshCw, Building2, Search, Target, UserPlus, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClientFormDialog } from '@/components/clients/client-form-dialog';

const COACHING_STATUS_ORDER: Record<string, number> = {
    Completado: 1,
    'En Proceso': 2,
    Pendiente: 3,
    Cancelado: 4,
};

type CommercialEntryMode = 'new_company' | 'existing_client' | 'existing_prospect' | 'general';
type CommercialIntent = NonNullable<CoachingItem['commercialIntent']>;

const COMMERCIAL_ENTRY_LABELS: Record<CommercialEntryMode, string> = {
    new_company: 'Nueva empresa',
    existing_client: 'Cliente existente',
    existing_prospect: 'Prospecto existente',
    general: 'Gestion general',
};

const COMMERCIAL_INTENT_LABELS: Record<CommercialIntent, string> = {
    new_contact: 'Primer contacto',
    renegotiation: 'Renegociar pauta/valores',
    new_proposal: 'Presentar nueva propuesta',
    renewal: 'Renovar acuerdo',
    recovery: 'Recuperar cuenta',
    follow_up: 'Seguimiento comercial',
    general: 'Gestion general',
};

export function CoachingView({ advisor }: { advisor: User }) {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Estados para nueva sesión / items
    const [newItemEntity, setNewItemEntity] = useState('');
    const [newItemAction, setNewItemAction] = useState('');
    const [newItemType, setNewItemType] = useState<'client' | 'prospect' | 'general'>('client');
    const [entryMode, setEntryMode] = useState<CommercialEntryMode>('new_company');
    const [commercialIntent, setCommercialIntent] = useState<CommercialIntent>('new_contact');
    const [selectedEntityId, setSelectedEntityId] = useState('');
    const [entitySearch, setEntitySearch] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [businessLine, setBusinessLine] = useState('');
    const [nextActionDate, setNextActionDate] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [referenceLoading, setReferenceLoading] = useState(false);
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
        field: 'action' | 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        entryId?: string;
        legacyIndex?: number;
        legacy?: boolean;
    } | null>(null);
    const [editingLegacy, setEditingLegacy] = useState<{
        session: CoachingSession;
        item: CoachingItem;
        field: 'action' | 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        legacyIndex?: number;
        text: string;
    } | null>(null);
    const [savingEntry, setSavingEntry] = useState(false);
    const [convertingItemId, setConvertingItemId] = useState<string | null>(null);
    const [clientConversion, setClientConversion] = useState<{ session: CoachingSession; item: CoachingItem } | null>(null);

    const canManage = isBoss || userInfo?.role === 'Gerencia' || userInfo?.role === 'Jefe' || userInfo?.role === 'Admin';
    const selectedClient = useMemo(() => clients.find(client => client.id === selectedEntityId), [clients, selectedEntityId]);
    const selectedProspect = useMemo(() => prospects.find(prospect => prospect.id === selectedEntityId), [prospects, selectedEntityId]);
    const normalizedSearch = entitySearch.trim().toLowerCase();
    const filteredClients = useMemo(() => {
        if (!normalizedSearch) return clients.slice(0, 30);
        return clients
            .filter(client => `${client.denominacion || ''} ${client.razonSocial || ''}`.toLowerCase().includes(normalizedSearch))
            .slice(0, 30);
    }, [clients, normalizedSearch]);
    const filteredProspects = useMemo(() => {
        if (!normalizedSearch) return prospects.slice(0, 30);
        return prospects
            .filter(prospect => `${prospect.companyName || ''} ${prospect.contactName || ''}`.toLowerCase().includes(normalizedSearch))
            .slice(0, 30);
    }, [prospects, normalizedSearch]);

    useEffect(() => {
        const shouldLoadClients = entryMode === 'existing_client' && clients.length === 0;
        const shouldLoadProspects = entryMode === 'existing_prospect' && prospects.length === 0;
        if (!shouldLoadClients && !shouldLoadProspects) return;

        let cancelled = false;
        const loadReferences = async () => {
            setReferenceLoading(true);
            try {
                if (shouldLoadClients) {
                    const loadedClients = await getClients();
                    if (!cancelled) setClients(loadedClients);
                }
                if (shouldLoadProspects) {
                    const loadedProspects = await getProspects();
                    if (!cancelled) setProspects(loadedProspects);
                }
            } catch (error) {
                console.error('Error loading commercial references:', error);
                toast({ title: 'No se pudieron cargar las opciones', variant: 'destructive' });
            } finally {
                if (!cancelled) setReferenceLoading(false);
            }
        };
        loadReferences();
        return () => {
            cancelled = true;
        };
    }, [clients.length, entryMode, prospects.length, toast]);

    const getLatestItemUpdate = useCallback((item: CoachingItem) => {
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
    }, []);

    const sortItemsForInitialLoad = useCallback((items: CoachingItem[]) => {
        return [...items].sort((a, b) => {
            const statusDiff = (COACHING_STATUS_ORDER[a.status] ?? 99) - (COACHING_STATUS_ORDER[b.status] ?? 99);
            if (statusDiff !== 0) return statusDiff;
            const dateDiff = getLatestItemUpdate(b) - getLatestItemUpdate(a);
            if (dateDiff !== 0) return dateDiff;
            return a.entityName.localeCompare(b.entityName);
        });
    }, [getLatestItemUpdate]);

    const normalizeLoadedSessions = useCallback((data: CoachingSession[]) => {
        return data.map(session => ({
            ...session,
            items: sortItemsForInitialLoad(session.items),
        }));
    }, [sortItemsForInitialLoad]);

    const updateLocalItem = (sessionId: string, itemId: string, updater: (item: CoachingItem) => CoachingItem) => {
        setSessions(prev => prev.map(session => {
            if (session.id !== sessionId) return session;
            return {
                ...session,
                items: session.items.map(item => item.id === itemId ? updater(item) : item),
            };
        }));
    };

    const loadData = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        if (forceRefresh) {
            setRefreshing(true);
            invalidateCache();
        }
        try {
            const data = normalizeLoadedSessions(await getCoachingSessions(advisor.id));
            setSessions(data);
            
            // Expandir automáticamente solo las sesiones "Open"
            const initialOpenState: Record<string, boolean> = {};
            data.forEach(s => {
                if (s.status === 'Open') initialOpenState[s.id] = true;
            });
            setOpenSessions(initialOpenState);
            return true;

        } catch (error) {
            console.error("Error loading coaching sessions:", error);
            toast({ title: "Error al actualizar seguimiento", variant: "destructive" });
            return false;
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [advisor.id, normalizeLoadedSessions, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleForceRefresh = async () => {
        const success = await loadData(true);
        if (success) {
            toast({ title: "Datos actualizados", description: "Se descartó el caché local y se volvió a leer el seguimiento." });
        }
    };

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

    const resetCommercialEntryForm = () => {
        setNewItemEntity('');
        setNewItemAction('');
        setSelectedEntityId('');
        setEntitySearch('');
        setContactName('');
        setContactPhone('');
        setContactEmail('');
        setBusinessLine('');
        setNextActionDate('');
    };

    const handleEntryModeChange = (value: CommercialEntryMode) => {
        setEntryMode(value);
        setSelectedEntityId('');
        setEntitySearch('');
        if (value === 'new_company') setCommercialIntent('new_contact');
        if (value === 'general') setCommercialIntent('general');
        if (value === 'existing_client' || value === 'existing_prospect') setCommercialIntent('follow_up');
    };

    const buildInitialActionText = () => {
        const lines = [
            `Tipo de gestion: ${COMMERCIAL_ENTRY_LABELS[entryMode]}`,
            `Objetivo: ${COMMERCIAL_INTENT_LABELS[commercialIntent]}`,
            newItemAction.trim() ? `Detalle inicial: ${newItemAction.trim()}` : '',
            contactName.trim() ? `Contacto: ${contactName.trim()}` : '',
            contactPhone.trim() ? `Telefono: ${contactPhone.trim()}` : '',
            contactEmail.trim() ? `Correo: ${contactEmail.trim()}` : '',
            businessLine.trim() ? `Rubro/actividad: ${businessLine.trim()}` : '',
            nextActionDate ? `Proxima accion: ${format(parseISO(nextActionDate), 'dd/MM/yyyy')}` : '',
        ].filter(Boolean);
        return lines.join('\n');
    };

    const handleAddCommercialItem = async (sessionId: string) => {
        if (!newItemAction.trim()) {
            toast({ title: 'Falta el detalle de la gestion', variant: 'destructive' });
            return;
        }

        const selectedExistingName = entryMode === 'existing_client'
            ? (selectedClient?.denominacion || selectedClient?.razonSocial || '')
            : (selectedProspect?.companyName || '');
        const entityName = entryMode === 'general'
            ? (newItemEntity.trim() || 'Gestion comercial general')
            : entryMode === 'new_company'
                ? newItemEntity.trim()
                : selectedExistingName;

        if (!entityName) {
            toast({
                title: entryMode === 'new_company' ? 'Falta el nombre de la empresa' : 'Selecciona una empresa',
                variant: 'destructive',
            });
            return;
        }

        const entityType: CoachingItem['entityType'] = entryMode === 'existing_client'
            ? 'client'
            : entryMode === 'general'
                ? 'general'
                : 'prospect';
        const entityId = entryMode === 'existing_client' || entryMode === 'existing_prospect'
            ? selectedEntityId
            : `manual_${entryMode}_${entityName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            const existsOpen = session.items.some(i =>
                (
                    (entityId && i.entityId === entityId) ||
                    i.entityName.toLowerCase() === entityName.toLowerCase()
                ) &&
                i.status !== 'Completado' &&
                i.status !== 'Cancelado'
            );

            if (existsOpen) {
                toast({
                    title: 'Ya existe un seguimiento',
                    description: `Ya hay una gestion abierta para "${entityName}". Agrega la novedad en ese mismo registro.`,
                    variant: 'destructive',
                });
                return;
            }
        }

        const item: CoachingItem = {
            id: '',
            taskId: '',
            originalCreatedAt: new Date().toISOString(),
            entityType,
            entityId,
            entityName,
            action: buildInitialActionText(),
            status: 'Pendiente',
            advisorNotes: '',
            commercialWorkType: entryMode,
            commercialIntent,
            contactName: contactName.trim() || undefined,
            contactPhone: contactPhone.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            businessLine: businessLine.trim() || undefined,
            nextActionDate: nextActionDate || undefined,
            origin: canManage ? 'manager' : 'advisor',
        };

        try {
            await addItemsToSession(sessionId, [item]);
            resetCommercialEntryForm();
            loadData();
            toast({ title: canManage ? 'Gestion asignada' : 'Gestion agregada' });
        } catch (error) {
            toast({ title: 'Error al agregar', variant: 'destructive' });
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

    const handleConvertToProspect = async (session: CoachingSession, item: CoachingItem) => {
        if (!userInfo) return;
        if (item.entityType !== 'prospect' || item.commercialWorkType !== 'new_company') return;

        setConvertingItemId(item.id);
        try {
            const prospectId = await createProspect({
                companyName: item.entityName,
                contactName: item.contactName || '',
                contactPhone: item.contactPhone || '',
                contactEmail: item.contactEmail || '',
                notes: `Creado desde Seguimiento.\n\n${item.action || ''}`.trim(),
                sector: item.businessLine || '',
                status: 'Nuevo',
            }, userInfo.id, userInfo.name, { skipCoachingUpdate: true });

            const now = new Date().toISOString();
            await updateCoachingItem(session.id, item.id, {
                entityId: prospectId,
                entityType: 'prospect',
                commercialWorkType: 'existing_prospect',
                lastUpdate: now,
            } as any, userInfo.id, userInfo.name, item.taskId, session.advisorId);

            const entry = await appendCoachingFollowUpEntry(
                session.id,
                item.id,
                'followUpDone',
                `Se convirtio la empresa en prospecto del CRM.`,
                userInfo.id,
                userInfo.name,
            );

            updateLocalItem(session.id, item.id, current => ({
                ...current,
                entityId: prospectId,
                entityType: 'prospect',
                commercialWorkType: 'existing_prospect',
                followUpDoneEntries: entry ? [...(current.followUpDoneEntries || []), entry] : current.followUpDoneEntries,
                followUpDoneUpdatedAt: entry?.createdAt || now,
                lastUpdate: entry?.createdAt || now,
            }));
            setProspects(prev => [{
                id: prospectId,
                companyName: item.entityName,
                contactName: item.contactName,
                contactPhone: item.contactPhone,
                contactEmail: item.contactEmail,
                createdAt: now,
                creatorId: userInfo.id,
                creatorName: userInfo.name,
                ownerId: userInfo.id,
                ownerName: userInfo.name,
                sector: item.businessLine,
                status: 'Nuevo',
            }, ...prev]);
            toast({ title: 'Prospecto creado', description: `${item.entityName} ya quedo vinculado al seguimiento.` });
        } catch (error) {
            console.error('Error converting coaching item to prospect:', error);
            toast({ title: 'No se pudo crear el prospecto', variant: 'destructive' });
        } finally {
            setConvertingItemId(null);
        }
    };

    const buildClientDraftFromCoaching = (item: CoachingItem): Partial<Client> => ({
        denominacion: item.entityName,
        razonSocial: item.entityName,
        rubro: item.businessLine || '',
        email: item.contactEmail || '',
        phone: item.contactPhone || '',
        observaciones: [
            'Cliente creado desde Seguimiento.',
            item.contactName ? `Contacto inicial: ${item.contactName}` : '',
            item.action || '',
        ].filter(Boolean).join('\n\n'),
        ownerId: userInfo?.id || advisor.id,
        ownerName: userInfo?.name || advisor.name,
        isNewClient: true,
    });

    const validateClientCuit = async (cuit: string): Promise<string | false> => {
        if (!cuit) return false;
        const currentClients = clients.length > 0 ? clients : await getClients();
        if (clients.length === 0) setClients(currentClients);
        const duplicate = currentClients.find(client => client.cuit === cuit);
        return duplicate ? `Ya existe un cliente con ese CUIT: ${duplicate.denominacion || duplicate.razonSocial}` : false;
    };

    const handleClientConversionSaved = async (clientData?: Partial<Client> & { id?: string }) => {
        if (!clientConversion || !userInfo || !clientData?.id) return;

        const { session, item } = clientConversion;
        const now = new Date().toISOString();
        try {
            if (item.entityType === 'prospect' && item.entityId && !item.entityId.startsWith('manual_')) {
                await updateProspect(item.entityId, { status: 'Convertido', statusChangedAt: now }, userInfo.id, userInfo.name);
            }

            await updateCoachingItem(session.id, item.id, {
                entityId: clientData.id,
                entityType: 'client',
                entityName: clientData.denominacion || item.entityName,
                commercialWorkType: 'existing_client',
                lastUpdate: now,
            } as any, userInfo.id, userInfo.name, item.taskId, session.advisorId);

            const entry = await appendCoachingFollowUpEntry(
                session.id,
                item.id,
                'followUpDone',
                `Se convirtio la gestion en cliente del CRM.`,
                userInfo.id,
                userInfo.name,
            );

            updateLocalItem(session.id, item.id, current => ({
                ...current,
                entityId: clientData.id,
                entityType: 'client',
                entityName: clientData.denominacion || current.entityName,
                commercialWorkType: 'existing_client',
                followUpDoneEntries: entry ? [...(current.followUpDoneEntries || []), entry] : current.followUpDoneEntries,
                followUpDoneUpdatedAt: entry?.createdAt || now,
                lastUpdate: entry?.createdAt || now,
            }));
            setClients(prev => [{ ...(clientData as Client) }, ...prev.filter(client => client.id !== clientData.id)]);
            setClientConversion(null);
            toast({ title: 'Cliente creado', description: 'La gestion ya quedo vinculada al cliente.' });
        } catch (error) {
            console.error('Error linking converted client to coaching:', error);
            toast({ title: 'Cliente creado con advertencia', description: 'Se creo el cliente, pero no se pudo vincular al seguimiento.', variant: 'destructive' });
        }
    };

    const keepCurrentItemOrder = (items: CoachingItem[]) => items;

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
            const entry = await appendCoachingFollowUpEntry(session.id, item.id, 'followUpDone', value, userInfo.id, userInfo.name);
            const now = entry?.createdAt || new Date().toISOString();
            setFollowUpDrafts(prev => ({ ...prev, [item.id]: '' }));
            updateLocalItem(session.id, item.id, current => ({
                ...current,
                followUpDoneEntries: entry ? [...(current.followUpDoneEntries || []), entry] : current.followUpDoneEntries,
                followUpDoneUpdatedAt: now,
                lastUpdate: now,
            }));
            toast({ title: "Asiento guardado" });
        } catch (error) {
            console.error("Error saving coaching entry:", error);
            toast({ title: "No se pudo guardar el asiento", variant: "destructive" });
        }
    };

    type TimelineEntry = CoachingFollowUpEntry & {
        field: 'action' | 'followUpDone' | 'followUpCurrent' | 'followUpNext';
        legacy?: boolean;
        legacyIndex?: number;
        label?: string;
    };

    const parseLegacyEntryDate = (text: string, fallback?: string) => {
        const match = text.match(/\[(?:Jefatura\s+|Del\s+)?(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\]/i);
        if (!match) return fallback || new Date().toISOString();
        const year = fallback ? new Date(fallback).getFullYear() : new Date().getFullYear();
        const date = new Date(
            year,
            Number(match[2]) - 1,
            Number(match[1]),
            Number(match[3] || 0),
            Number(match[4] || 0),
        );
        return Number.isNaN(date.getTime()) ? (fallback || new Date().toISOString()) : date.toISOString();
    };

    const buildLegacyTimelineEntries = (
        field: TimelineEntry['field'],
        text: string,
        updatedAt: string | undefined,
        fallbackAt: string | undefined,
        label: string,
    ): TimelineEntry[] => {
        if (!text?.trim()) return [];
        const fallback = updatedAt || fallbackAt || new Date().toISOString();
        return text
            .split(/\n{2,}/)
            .map(chunk => chunk.trim())
            .filter(Boolean)
            .map((chunk, index) => ({
                id: `legacy-${field}-${index}`,
                text: chunk,
                createdAt: parseLegacyEntryDate(chunk, fallback),
                createdById: '',
                createdByName: 'Historial anterior',
                field,
                legacy: true,
                legacyIndex: index,
                label,
            }));
    };

    const getLegacyFieldText = (item: CoachingItem, field: TimelineEntry['field']) => {
        if (field === 'action') return item.action || '';
        if (field === 'followUpDone') return item.followUpDone || item.advisorNotes || '';
        if (field === 'followUpCurrent') return item.followUpCurrent || '';
        return item.followUpNext || '';
    };

    const updateLegacyTextAtIndex = (item: CoachingItem, field: TimelineEntry['field'], index: number | undefined, nextText: string | null) => {
        const parts = getLegacyFieldText(item, field)
            .split(/\n{2,}/)
            .map(chunk => chunk.trim())
            .filter(Boolean);
        if (index === undefined || index < 0 || index >= parts.length) return nextText ?? '';
        const nextParts = nextText === null
            ? parts.filter((_, partIndex) => partIndex !== index)
            : parts.map((part, partIndex) => partIndex === index ? nextText.trim() : part);
        return nextParts.filter(Boolean).join('\n\n');
    };

    const getFollowUpTimeline = (item: CoachingItem): TimelineEntry[] => {
        const fields = [
            { field: 'action' as const, entries: [], text: item.action || '', updatedAt: item.originalCreatedAt || item.lastUpdate, label: 'Acción / indicación' },
            { field: 'followUpDone' as const, entries: item.followUpDoneEntries || [], text: item.followUpDone || item.advisorNotes || '', updatedAt: item.followUpDoneUpdatedAt, label: 'Bitácora' },
            { field: 'followUpCurrent' as const, entries: item.followUpCurrentEntries || [], text: item.followUpCurrent || '', updatedAt: item.followUpCurrentUpdatedAt, label: 'En qué estamos' },
            { field: 'followUpNext' as const, entries: item.followUpNextEntries || [], text: item.followUpNext || '', updatedAt: item.followUpNextUpdatedAt, label: 'Qué sigue' },
        ];

        return fields.flatMap(({ field, entries, text, updatedAt, label }) => [
            ...entries.map(entry => ({ ...entry, field, label })),
            ...buildLegacyTimelineEntries(field, text, updatedAt, item.lastUpdate || item.originalCreatedAt, label),
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
            const editedAt = new Date().toISOString();
            updateLocalItem(editingEntry.sessionId, editingEntry.itemId, current => {
                const entriesField = `${editingEntry.field}Entries` as 'followUpDoneEntries' | 'followUpCurrentEntries' | 'followUpNextEntries';
                const updatedAtField = `${editingEntry.field}UpdatedAt` as keyof CoachingItem;
                return {
                    ...current,
                    [entriesField]: (current[entriesField] || []).map(entry => entry.id === editingEntry.entryId ? {
                        ...entry,
                        text: editingEntry.text,
                        updatedAt: editedAt,
                        updatedById: userInfo.id,
                        updatedByName: userInfo.name,
                    } : entry),
                    [updatedAtField]: editedAt,
                    lastUpdate: editedAt,
                };
            });
            setEditingEntry(null);
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
                if (entryToDelete.field === 'action' && session && item) {
                    const now = new Date().toISOString();
                    const nextAction = updateLegacyTextAtIndex(item, 'action', entryToDelete.legacyIndex, null);
                    await updateCoachingItem(session.id, item.id, { action: nextAction, lastUpdate: now } as any, userInfo.id, userInfo.name, item.taskId, session.advisorId);
                    updateLocalItem(session.id, item.id, current => ({ ...current, action: nextAction, lastUpdate: now }));
                    setEntryToDelete(null);
                    toast({ title: "Asiento eliminado" });
                    return;
                }
                if (!session || !item) throw new Error("Registro histórico no encontrado");
                const updatedAtField = `${entryToDelete.field}UpdatedAt` as keyof CoachingItem;
                const now = new Date().toISOString();
                const nextLegacyText = updateLegacyTextAtIndex(item, entryToDelete.field, entryToDelete.legacyIndex, null);
                await updateCoachingItem(
                    session.id,
                    item.id,
                    {
                        [entryToDelete.field]: nextLegacyText,
                        [updatedAtField]: now,
                        ...(entryToDelete.field === 'followUpDone' ? { advisorNotes: nextLegacyText } : {}),
                    },
                    userInfo.id,
                    userInfo.name,
                    item.taskId,
                    session.advisorId,
                );
                updateLocalItem(session.id, item.id, current => ({
                    ...current,
                    [entryToDelete.field]: nextLegacyText,
                    [updatedAtField]: now,
                    ...(entryToDelete.field === 'followUpDone' ? { advisorNotes: nextLegacyText } : {}),
                    lastUpdate: now,
                }));
            } else if (entryToDelete.entryId) {
                await deleteCoachingFollowUpEntry(
                    entryToDelete.sessionId,
                    entryToDelete.itemId,
                    entryToDelete.field as 'followUpDone' | 'followUpCurrent' | 'followUpNext',
                    entryToDelete.entryId,
                    userInfo.id,
                    userInfo.name,
                );
                updateLocalItem(entryToDelete.sessionId, entryToDelete.itemId, current => {
                    const entriesField = `${entryToDelete.field}Entries` as 'followUpDoneEntries' | 'followUpCurrentEntries' | 'followUpNextEntries';
                    const updatedAtField = `${entryToDelete.field}UpdatedAt` as keyof CoachingItem;
                    const now = new Date().toISOString();
                    return {
                        ...current,
                        [entriesField]: (current[entriesField] || []).filter(entry => entry.id !== entryToDelete.entryId),
                        [updatedAtField]: now,
                        lastUpdate: now,
                    };
                });
            }
            setEntryToDelete(null);
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
            const now = new Date().toISOString();
            const nextLegacyText = updateLegacyTextAtIndex(editingLegacy.item, editingLegacy.field, editingLegacy.legacyIndex, editingLegacy.text.trim());
            if (editingLegacy.field === 'action') {
                await handleUpdateItem(editingLegacy.session, editingLegacy.item, {
                    action: nextLegacyText,
                    lastUpdate: now,
                } as any);
            } else {
                const updatedAtField = `${editingLegacy.field}UpdatedAt` as keyof CoachingItem;
                await handleUpdateItem(editingLegacy.session, editingLegacy.item, {
                    [editingLegacy.field]: nextLegacyText,
                    [updatedAtField]: now,
                    ...(editingLegacy.field === 'followUpDone' ? { advisorNotes: nextLegacyText } : {}),
                });
            }
            setEditingLegacy(null);
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
        const canConvertToProspect = session.status === 'Open'
            && item.entityType === 'prospect'
            && item.commercialWorkType === 'new_company'
            && item.status !== 'Cancelado'
            && item.status !== 'Completado';
        const canConvertToClient = session.status === 'Open'
            && item.entityType !== 'client'
            && item.status !== 'Cancelado'
            && item.status !== 'Completado';

        return (
        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[45%_55%] gap-4 p-4 border rounded-lg bg-card/50 shadow-sm transition-shadow">
            
            <div className="space-y-3 border-r md:pr-4 border-dashed md:border-solid border-border/50 relative">
                <div className="flex flex-wrap items-center gap-2 pr-6">
                    <Badge variant="outline" className="capitalize bg-background text-[10px]">
                        {item.commercialWorkType ? COMMERCIAL_ENTRY_LABELS[item.commercialWorkType] : (item.entityType === 'general' ? 'General' : 'Cliente/Prospecto')}
                    </Badge>
                    {item.commercialIntent && (
                        <Badge variant="secondary" className="text-[10px]">
                            {COMMERCIAL_INTENT_LABELS[item.commercialIntent]}
                        </Badge>
                    )}
                    <span className="font-semibold text-sm truncate block max-w-full" title={item.entityName}>{item.entityName}</span>
                </div>

                {(item.contactName || item.contactPhone || item.contactEmail || item.businessLine || item.nextActionDate) && (
                    <div className="grid gap-1 rounded-md border bg-background/80 p-2 text-[11px] text-muted-foreground">
                        {item.businessLine && <span><strong>Rubro:</strong> {item.businessLine}</span>}
                        {item.contactName && <span><strong>Contacto:</strong> {item.contactName}</span>}
                        {item.contactPhone && <span><strong>Telefono:</strong> {item.contactPhone}</span>}
                        {item.contactEmail && <span><strong>Correo:</strong> {item.contactEmail}</span>}
                        {item.nextActionDate && <span><strong>Proxima accion:</strong> {format(parseISO(item.nextActionDate), 'dd/MM/yyyy')}</span>}
                    </div>
                )}

                {canConvertToProspect && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-start text-xs"
                        onClick={() => handleConvertToProspect(session, item)}
                        disabled={convertingItemId === item.id}
                    >
                        {convertingItemId === item.id ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <UserPlus className="mr-2 h-3.5 w-3.5" />
                        )}
                        Convertir en prospecto
                    </Button>
                )}

                {canConvertToClient && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-start text-xs"
                        onClick={() => setClientConversion({ session, item })}
                    >
                        <Building className="mr-2 h-3.5 w-3.5" />
                        Convertir en cliente
                    </Button>
                )}
                
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
                                {entry.legacy && editingLegacy?.item.id === item.id && editingLegacy.field === entry.field && editingLegacy.legacyIndex === entry.legacyIndex ? (
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
                                                    <div className="min-w-0 flex-1">
                                                        {entry.label && (
                                                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{entry.label}</p>
                                                        )}
                                                        <p className="whitespace-pre-wrap">{entry.text}</p>
                                                    </div>
                                                    {canManage && (
                                                        <div className="flex shrink-0 gap-1">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6"
                                                                onClick={() => entry.legacy
                                                                    ? setEditingLegacy({ session, item, field: entry.field, legacyIndex: entry.legacyIndex, text: entry.text })
                                                                    : setEditingEntry({ sessionId: session.id, itemId: item.id, field: entry.field as 'followUpDone' | 'followUpCurrent' | 'followUpNext', entryId: entry.id, text: entry.text })
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
                                                                    legacyIndex: entry.legacyIndex,
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
            <div className="flex items-center gap-2 shrink-0 pb-4 pr-4">
                <div className="flex-1">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-primary"/> 
                        Centro de actividad comercial
                    </h2>
                    <p className="text-muted-foreground text-sm">Ingreso y seguimiento diario de gestiones de {advisor.name}</p>
                </div>
                <Button variant="outline" onClick={handleForceRefresh} size="sm" disabled={loading || refreshing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Recargar datos
                </Button>
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
                            <p>No hay actividad comercial registrada.</p>
                            {canManage && <p className="text-sm mt-2">Inicia una nueva reunión para comenzar a asignar tareas.</p>}
                        </CardContent>
                    </Card>
                )}

                {sessions.map((session) => {
                    const managerItems = keepCurrentItemOrder(session.items.filter(i => !i.origin || i.origin === 'manager'));
                    const advisorItems = keepCurrentItemOrder(session.items.filter(i => i.origin === 'advisor'));
                    const newCompanyItems = advisorItems.filter(item => item.commercialWorkType === 'new_company' || (!item.commercialWorkType && item.entityType === 'prospect'));
                    const existingClientItems = advisorItems.filter(item => item.commercialWorkType === 'existing_client' || (!item.commercialWorkType && item.entityType === 'client'));
                    const existingProspectItems = advisorItems.filter(item => item.commercialWorkType === 'existing_prospect');
                    const generalCommercialItems = advisorItems.filter(item => item.commercialWorkType === 'general' || (!item.commercialWorkType && item.entityType === 'general'));

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

                                {newCompanyItems.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <h4 className="text-xs uppercase font-bold text-primary flex items-center gap-2 border-t pt-4">
                                            <Building2 className="h-3 w-3" /> Empresas nuevas / prospectos en gestion
                                        </h4>
                                        {newCompanyItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {existingClientItems.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <h4 className="text-xs uppercase font-bold text-emerald-700 flex items-center gap-2 border-t pt-4">
                                            <Briefcase className="h-3 w-3" /> Clientes existentes en gestion
                                        </h4>
                                        {existingClientItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {existingProspectItems.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <h4 className="text-xs uppercase font-bold text-sky-700 flex items-center gap-2 border-t pt-4">
                                            <UserCheck className="h-3 w-3" /> Prospectos existentes en gestion
                                        </h4>
                                        {existingProspectItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {generalCommercialItems.length > 0 && (
                                    <div className="space-y-3 mt-6">
                                        <h4 className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2 border-t pt-4">
                                            <Target className="h-3 w-3" /> Gestiones comerciales generales
                                        </h4>
                                        {generalCommercialItems.map(item => renderItemRow(session, item))}
                                    </div>
                                )}

                                {session.items.length === 0 && session.status === 'Open' && (
                                    <div className="text-center text-sm text-muted-foreground italic py-2">
                                        Aún no hay compromisos asignados para esta semana.
                                    </div>
                                )}

                                {session.status === 'Open' && (
                                    <div className={`rounded-lg border border-dashed p-4 mt-4 ${canManage ? 'bg-muted/40' : 'bg-blue-50/50 border-blue-200'}`}>
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-semibold">
                                                    <Target className="h-4 w-4 text-primary" />
                                                    Nueva gestion comercial
                                                </h4>
                                                <p className="text-xs text-muted-foreground">Registra el inicio de una accion sobre una empresa nueva o una cuenta existente.</p>
                                            </div>
                                            {referenceLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                        </div>

                                        <div className="grid gap-3 lg:grid-cols-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Origen</Label>
                                                <Select value={entryMode} onValueChange={(value) => handleEntryModeChange(value as CommercialEntryMode)}>
                                                    <SelectTrigger className="h-9 bg-background text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="new_company">Nueva empresa</SelectItem>
                                                        <SelectItem value="existing_client">Cliente existente</SelectItem>
                                                        <SelectItem value="existing_prospect">Prospecto existente</SelectItem>
                                                        <SelectItem value="general">Gestion general</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs">Objetivo</Label>
                                                <Select value={commercialIntent} onValueChange={(value) => setCommercialIntent(value as CommercialIntent)}>
                                                    <SelectTrigger className="h-9 bg-background text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="new_contact">Primer contacto</SelectItem>
                                                        <SelectItem value="renegotiation">Renegociar pauta/valores</SelectItem>
                                                        <SelectItem value="new_proposal">Presentar nueva propuesta</SelectItem>
                                                        <SelectItem value="renewal">Renovar acuerdo</SelectItem>
                                                        <SelectItem value="recovery">Recuperar cuenta</SelectItem>
                                                        <SelectItem value="follow_up">Seguimiento comercial</SelectItem>
                                                        <SelectItem value="general">Gestion general</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {(entryMode === 'new_company' || entryMode === 'general') ? (
                                                <div className="space-y-1 lg:col-span-2">
                                                    <Label className="text-xs">{entryMode === 'general' ? 'Titulo interno' : 'Empresa/persona'}</Label>
                                                    <Input
                                                        className="h-9 bg-background text-xs"
                                                        placeholder={entryMode === 'general' ? 'Ej: Revision de cartera' : 'Ej: Nueva empresa a contactar'}
                                                        value={newItemEntity}
                                                        onChange={event => setNewItemEntity(event.target.value)}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="space-y-1 lg:col-span-2">
                                                    <Label className="text-xs">{entryMode === 'existing_client' ? 'Buscar cliente' : 'Buscar prospecto'}</Label>
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            className="h-9 bg-background pl-8 text-xs"
                                                            placeholder="Escribi parte del nombre o razon social..."
                                                            value={entitySearch}
                                                            onChange={event => {
                                                                setEntitySearch(event.target.value);
                                                                setSelectedEntityId('');
                                                            }}
                                                        />
                                                    </div>
                                                    <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                                                        <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                        <SelectContent>
                                                            {(entryMode === 'existing_client' ? filteredClients : filteredProspects).map(entity => (
                                                                <SelectItem key={entity.id} value={entity.id}>
                                                                    {'denominacion' in entity
                                                                        ? (entity.denominacion || entity.razonSocial)
                                                                        : entity.companyName}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Contacto</Label>
                                                <Input className="h-9 bg-background text-xs" value={contactName} onChange={event => setContactName(event.target.value)} placeholder="Nombre" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Telefono</Label>
                                                <Input className="h-9 bg-background text-xs" value={contactPhone} onChange={event => setContactPhone(event.target.value)} placeholder="Telefono" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Correo</Label>
                                                <Input className="h-9 bg-background text-xs" value={contactEmail} onChange={event => setContactEmail(event.target.value)} placeholder="mail@empresa.com" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Proxima accion</Label>
                                                <Input className="h-9 bg-background text-xs" type="date" value={nextActionDate} onChange={event => setNextActionDate(event.target.value)} />
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Rubro / actividad</Label>
                                                <Input className="h-9 bg-background text-xs" value={businessLine} onChange={event => setBusinessLine(event.target.value)} placeholder="Rubro" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Detalle inicial</Label>
                                                <Input
                                                    className="h-9 bg-background text-xs"
                                                    placeholder={canManage ? 'Ej: Pedir renegociacion de pauta...' : 'Ej: Llamar para presentar propuesta...'}
                                                    value={newItemAction}
                                                    onChange={event => setNewItemAction(event.target.value)}
                                                    onKeyDown={event => event.key === 'Enter' && handleAddCommercialItem(session.id)}
                                                />
                                            </div>
                                            <Button size="sm" onClick={() => handleAddCommercialItem(session.id)} className="h-9 shrink-0 px-3">
                                                <Plus className="mr-2 h-4 w-4" /> {canManage ? 'Asignar gestion' : 'Agregar gestion'}
                                            </Button>
                                        </div>
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

            <ClientFormDialog
                isOpen={!!clientConversion}
                onOpenChange={(open) => !open && setClientConversion(null)}
                client={clientConversion ? buildClientDraftFromCoaching(clientConversion.item) : null}
                onValidateCuit={validateClientCuit}
                onSaveSuccess={handleClientConversionSaved}
                createOptions={{ skipCoachingUpdate: true }}
            />
        </div>
    );
}
