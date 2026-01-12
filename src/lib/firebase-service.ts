'use client';

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig, SupervisorComment, SupervisorCommentReply, ObjectiveVisibilityConfig, PaymentEntry, PaymentStatus, ChatSpaceMapping, CoachingSession, CoachingItem } from './types';
import { logActivity } from './activity-logger';
import { format, parseISO, differenceInCalendarDays, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { defaultPermissions } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


const SUPER_ADMIN_EMAIL = 'lchena@airedesantafe.com.ar';
const PERMISSIONS_DOC_ID = 'area_permissions';
const OBJECTIVE_VISIBILITY_DOC_ID = 'objective_visibility';

const collections = {
    clients: collection(db, 'clients'),
    people: collection(db, 'people'),
    opportunities: collection(db, 'opportunities'),
    activities: collection(db, 'activities'),
    clientActivities: collection(db, 'client-activities'),
    users: collection(db, 'users'),
    agencies: collection(db, 'agencies'),
    invoices: collection(db, 'invoices'),
    canjes: collection(db, 'canjes'),
    programs: collection(db, 'programs'),
    commercialItems: collection(db, 'commercial_items'),
    prospects: collection(db, 'prospects'),
    licenses: collection(db, 'licencias'),
    systemConfig: collection(db, 'system_config'),
    supervisorComments: collection(db, 'supervisor_comments'),
    paymentEntries: collection(db, 'payment_entries'),
    chatSpaces: collection(db, 'chat_spaces'),
    coachingSessions: collection(db, 'coaching_sessions'),
};

const cache: {
    [key: string]: {
        data: any;
        timestamp: number;
    }
} = {};

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const CHAT_SPACES_CACHE_KEY = 'chat_spaces_cache';

const getFromCache = (key: string) => {
    const cached = cache[key];
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        return cached.data;
    }
    return null;
};

const setInCache = (key: string, data: any) => {
    cache[key] = {
        data,
        timestamp: Date.now(),
    };
};

const timestampToISO = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') {
        return value;
    }
    if (value instanceof Timestamp) {
        return value.toDate().toISOString();
    }
    return undefined;
};

export const invalidateCache = (key?: string) => {
    if (key) {
        delete cache[key];
    } else {
        Object.keys(cache).forEach(k => delete cache[k]);
    }
}

// ... (Resto de funciones existentes...)
// NOTA: Para no saturar la respuesta, omito el código que no ha cambiado. 
// ASUME QUE TODO EL CÓDIGO PREVIO DE CLIENTS, USERS, ETC ESTÁ AQUÍ.
// SOLO MODIFICAMOS/AGREGAMOS LA SECCIÓN COACHING AL FINAL.

// --- Coaching / Seguimiento Functions ---

export const getCoachingSessions = async (advisorId: string): Promise<CoachingSession[]> => {
    const q = query(
        collections.coachingSessions, 
        where('advisorId', '==', advisorId),
        orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
            id: doc.id, 
            ...data,
            createdAt: timestampToISO(data.createdAt) || new Date().toISOString(),
        } as CoachingSession;
    });
};

export const createCoachingSession = async (
    sessionData: Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
    userId: string, 
    userName: string
): Promise<string> => {
    const docRef = await addDoc(collections.coachingSessions, {
        ...sessionData,
        status: 'Open',
        createdAt: serverTimestamp(),
        // Generar IDs si no vienen (ej: al arrastrar tareas, ya vienen con ID y taskId)
        items: sessionData.items.map(item => ({
            ...item, 
            id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2),
            taskId: item.taskId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
            originalCreatedAt: item.originalCreatedAt || new Date().toISOString()
        }))
    });
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'user', 
        entityId: sessionData.advisorId,
        entityName: 'Sesión de Seguimiento',
        details: `inició una nueva sesión de seguimiento para <strong>${sessionData.advisorName}</strong>`,
        ownerName: sessionData.advisorName
    });

    return docRef.id;
};

export const deleteCoachingSession = async (sessionId: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'coaching_sessions', sessionId);
    await deleteDoc(docRef);
    
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'user', 
        entityId: sessionId,
        entityName: 'Sesión de Seguimiento',
        details: `eliminó una sesión de seguimiento`,
        ownerName: 'Sistema' 
    });
};

export const updateCoachingSession = async (sessionId: string, data: Partial<CoachingSession>, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'coaching_sessions', sessionId);
    await updateDoc(docRef, data);
};

export const updateCoachingItem = async (
    sessionId: string,
    itemId: string,
    updates: { status?: string, advisorNotes?: string },
    userId: string,
    userName: string,
    taskId?: string, // Para sincronización
    advisorId?: string // Para búsqueda en historial
): Promise<void> => {
    // 1. Actualizar la sesión actual
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");
    
    const sessionData = sessionSnap.data() as CoachingSession;
    const updatedItems = sessionData.items.map(item => {
        if (item.id === itemId) {
            return { 
                ...item, 
                ...updates,
                lastUpdate: new Date().toISOString() 
            };
        }
        return item;
    });

    await updateDoc(sessionRef, { items: updatedItems });

    // 2. Si hay cambio de estado y tenemos taskId y advisorId, propagar a otras sesiones
    if (updates.status && taskId && advisorId) {
        const historyQuery = query(
            collections.coachingSessions, 
            where('advisorId', '==', advisorId)
        );
        const historySnap = await getDocs(historyQuery);
        
        const batch = writeBatch(db);
        let batchCount = 0;

        historySnap.forEach((docSnap) => {
            if (docSnap.id === sessionId) return; // Ya actualizada

            const sData = docSnap.data() as CoachingSession;
            const itemsToUpdate = sData.items.map(i => {
                if (i.taskId === taskId) {
                    return { ...i, status: updates.status! };
                }
                return i;
            });

            // Solo actualizar si hubo cambios
            if (JSON.stringify(itemsToUpdate) !== JSON.stringify(sData.items)) {
                batch.update(docSnap.ref, { items: itemsToUpdate });
                batchCount++;
            }
        });

        if (batchCount > 0) {
            await batch.commit();
        }
    }
    
    // Loguear solo si se completa
    if (updates.status === 'Completado') {
         await logActivity({
            userId,
            userName,
            type: 'update',
            entityType: 'user',
            entityId: sessionId,
            entityName: 'Tarea de Seguimiento',
            details: `completó una tarea de la sesión de seguimiento.`,
            ownerName: sessionData.advisorName
        });
    }
};

export const deleteCoachingItem = async (sessionId: string, itemId: string) => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");
    
    const sessionData = sessionSnap.data() as CoachingSession;
    const updatedItems = sessionData.items.filter(item => item.id !== itemId);

    await updateDoc(sessionRef, { items: updatedItems });
};

export const addItemsToSession = async (sessionId: string, newItems: CoachingItem[]) => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    const itemsWithIds = newItems.map(i => ({
        ...i, 
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        taskId: i.taskId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
        originalCreatedAt: i.originalCreatedAt || new Date().toISOString()
    }));
    
    await updateDoc(sessionRef, {
        items: arrayUnion(...itemsWithIds)
    });
};
