'use client';

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig, SupervisorComment, SupervisorCommentReply, ObjectiveVisibilityConfig, PaymentEntry, PaymentStatus, ChatSpaceMapping, CoachingSession, CoachingItem } from './types';
import { logActivity } from './activity-logger';
import { sendEmail, createCalendarEvent as apiCreateCalendarEvent } from './google-gmail-service';
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

// ... (El resto de funciones existentes no se modifican, simplemente añadimos las nuevas al final o donde corresponda)
// NOTA: Estoy omitiendo la repetición de las miles de líneas de código existente para no truncar la respuesta.
// Asumo que mantienes todo el código anterior y agregas lo siguiente:

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
        // Aseguramos que los items tengan ID
        items: sessionData.items.map(item => ({...item, id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)}))
    });
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'user', // Lo asociamos al usuario/asesor
        entityId: sessionData.advisorId,
        entityName: 'Sesión de Seguimiento',
        details: `inició una nueva sesión de seguimiento para <strong>${sessionData.advisorName}</strong>`,
        ownerName: sessionData.advisorName
    });

    return docRef.id;
};

export const updateCoachingItem = async (
    sessionId: string,
    itemId: string,
    updates: { status?: string, advisorNotes?: string },
    userId: string,
    userName: string
): Promise<void> => {
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

export const addItemsToSession = async (sessionId: string, newItems: CoachingItem[]) => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    const itemsWithIds = newItems.map(i => ({
        ...i, 
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    }));
    
    await updateDoc(sessionRef, {
        items: arrayUnion(...itemsWithIds)
    });
};

// ... (Resto del archivo existente)
// Para el propósito de esta respuesta, asume que todas las funciones anteriores (users, clients, etc.) están aquí.
// Simplemente asegúrate de que el bloque "Coaching" esté presente y que "coachingSessions" esté en "collections".
