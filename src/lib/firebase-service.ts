'use client';

import { auth, db } from './firebase';
import { collection, getDocs, getDocsFromCache, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction, startAfter, QueryDocumentSnapshot, increment } from 'firebase/firestore';
import type { Client, Person, Opportunity, OpportunityPeriod, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig, SupervisorComment, SupervisorCommentReply, ObjectiveVisibilityConfig, PaymentEntry, PaymentStatus, ChatSpaceMapping, CoachingSession, CoachingItem, CoachingFollowUpEntry, CoachingActiveIndex, CoachingActiveIndexEntry, CommercialNote, SystemHolidays, AdvertisingOrder, WebNote, BillingRequest, SocialMediaRequest, ConvenioCanje, SasProductConfig, PipelineInteraction, ApprovalHistoryItem } from './types';
import { logActivity } from './activity-logger';
import { es } from 'date-fns/locale';
import { defaultPermissions } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { differenceInCalendarDays, isSaturday, isSunday, parseISO, format, parse } from 'date-fns';
import { sendEmail } from './google-gmail-service';
import { toTitleCase } from './utils';
import { buildAdvertisingOrderChanges } from './advertising-order-history';
import { getAdvertisingOrderFinancialSummary } from './advertising-order-utils';

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
    coachingSessions: collection(db, 'coaching_sessions'),
    coachingActiveIndex: collection(db, 'coaching_active_index'),
    commercialNotes: collection(db, 'commercial_notes'),
    billingRequests: collection(db, 'billing_requests'),
    socialMediaRequests: collection(db, 'social_media_requests'),
    convenios: collection(db, 'convenios'),
    webNotes: collection(db, 'web_notes'),
    pipelineInteractions: collection(db, 'pipeline_interactions'),
};

const cache: { [key: string]: { data: any; timestamp: number } } = {};
const pendingReads: { [key: string]: Promise<any> | undefined } = {};
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

// 🟢 CACHÉ OPTIMIZADO EN RAM (Previene QuotaExceededError en LocalStorage)
const getFromCache = (key: string) => {
    let cached = cache[key];
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        return cached.data;
    }
    return null;
};

const setInCache = (key: string, data: any) => {
    cache[key] = { data, timestamp: Date.now() };
    // Eliminamos basura vieja del localStorage si existiera para liberar espacio a Firebase
    if (typeof window !== 'undefined') {
        try { localStorage.removeItem(`crm_cache_${key}`); } catch (e) {}
    }
};

const getDocsPreferCache = async (source: any): Promise<any> => {
    try {
        const cachedSnapshot = await getDocsFromCache(source);
        if (cachedSnapshot.empty && cachedSnapshot.metadata?.fromCache) {
            return await getDocs(source);
        }
        return cachedSnapshot;
    } catch {
        return getDocs(source);
    }
};

const getCachedOrLoad = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
    const cached = getFromCache(key);
    if (cached) return cached as T;
    if (pendingReads[key]) return pendingReads[key] as Promise<T>;

    pendingReads[key] = loader()
        .then((data) => {
            setInCache(key, data);
            return data;
        })
        .finally(() => {
            delete pendingReads[key];
        });

    return pendingReads[key] as Promise<T>;
};

const timestampToISO = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (value instanceof Timestamp) return value.toDate().toISOString();
    return undefined;
};

type LoadOptions = {
    forceServer?: boolean;
};

export const invalidateCache = (key?: string) => {
    if (key) {
        if (key === 'users') {
            Object.keys(cache).forEach(k => {
                if (k.startsWith('all_users_') || k.startsWith('user_') || k === 'users') {
                    delete cache[k];
                }
            });
        } else if (key === PAYMENT_CACHE_KEY || key === PENDING_PAYMENT_CACHE_KEY) {
            delete cache[PAYMENT_CACHE_KEY];
            delete cache[PENDING_PAYMENT_CACHE_KEY];
        } else {
            delete cache[key];
        }
    } else {
        Object.keys(cache).forEach(k => delete cache[k]);
    }
    if (key) {
        Object.keys(pendingReads).forEach(k => {
            if (k === key || (key === 'users' && (k.startsWith('all_users_') || k.startsWith('user_')))) {
                delete pendingReads[k];
            }
        });
    } else {
        Object.keys(pendingReads).forEach(k => delete pendingReads[k]);
    }
    // Vaciamos el localStorage problemático viejo
    if (typeof window !== 'undefined') {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('crm_cache_')) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch(e) {}
    }
};

const parseDateWithTimezone = (dateString: string) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
};

export const mutateCacheArray = (
    cacheKey: string, 
    itemId: string, 
    newData: any | null, 
    action: 'add' | 'update' | 'delete',
    sortFn?: (a: any, b: any) => number 
) => {
    let cached = cache[cacheKey]?.data;
    if (!cached || !Array.isArray(cached)) return;

    let items = [...cached];

    if (action === 'delete') {
        items = items.filter(i => i.id !== itemId);
    } else if (action === 'update') {
        const index = items.findIndex(i => i.id === itemId);
        if (index > -1) items[index] = { ...items[index], ...newData };
    } else if (action === 'add' && newData) {
        items.unshift({ id: itemId, ...newData });
        if (sortFn) items.sort(sortFn);
    }

    setInCache(cacheKey, items);
};

const invalidateCacheByPrefix = (prefix: string) => {
    Object.keys(cache).forEach((key) => {
        if (key.startsWith(prefix)) {
            delete cache[key];
        }
    });
};

const invalidateInvoiceDetailCaches = () => {
    invalidateCacheByPrefix('invoices_opportunity_');
    invalidateCacheByPrefix('invoices_client_');
    delete cache.dashboard_invoices;
};

const invalidateOpportunityCaches = (clientIds: Array<string | undefined | null> = []) => {
    invalidateCache('all_opportunities');
    invalidateCacheByPrefix('opportunities_user_');
    clientIds.filter(Boolean).forEach(clientId => invalidateCache(`opportunities_client_${clientId}`));
};



export type ClientTangoUpdate = {
    cuit?: string; tangoCompanyId?: string; idTango?: string; email?: string; phone?: string; rubro?: string; razonSocial?: string; razonSocialTango?: string; denominacion?: string; idAireSrl?: string; idAireDigital?: string; idAire?: string; condicionIVA?: string; provincia?: string; localidad?: string; tipoEntidad?: string; observaciones?: string;
};

export type ClientTangoIdField = 'idAire' | 'idAireSrl' | 'idAireDigital';
export type ClientTangoSyncedField = 'isTangoSyncedAire' | 'isTangoSyncedSrl' | 'isTangoSyncedSas';
export type ClientTangoMappingOptions = {
    markSyncedField?: ClientTangoSyncedField;
};

// --- Commercial Notes Functions ---

export const saveCommercialNote = async (
    noteData: Omit<CommercialNote, 'id' | 'createdAt'>,
    userId: string,
    userName: string
): Promise<string> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.saveCommercialNote(noteData);
};

export async function getCommercialNotesByClientId(clientId: string): Promise<CommercialNote[]> {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.getCommercialNotesByClientId(clientId);
}

// Obtener notas de un asesor especifico
export const getCommercialNotesForAdvisor = async (advisorId: string): Promise<CommercialNote[]> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.getCommercialNotesForAdvisor(advisorId);
};

export const getAllCommercialNotes = async (): Promise<CommercialNote[]> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.getAllCommercialNotes();
};

export const getCommercialNotesByOrderId = async (orderId: string): Promise<CommercialNote[]> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.getCommercialNotesByOrderId(orderId);
};

export const linkCommercialNoteToOrder = async (
    noteId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    await commercialNotesApi.linkCommercialNoteToOrder(noteId, orderId, orderTitle);
};

export const unlinkCommercialNoteFromOrder = async (
    noteId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    await commercialNotesApi.unlinkCommercialNoteFromOrder(noteId, reason);
};

export const getCommercialNote = async (noteId: string): Promise<CommercialNote | null> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    return commercialNotesApi.getCommercialNote(noteId);
};

export const deleteCommercialNote = async (noteId: string, userId: string, userName: string): Promise<void> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    await commercialNotesApi.deleteCommercialNote(noteId);
};

export const updateCommercialNote = async (
    noteId: string,
    noteData: Partial<Omit<CommercialNote, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const commercialNotesApi = await import('@/lib/api/commercial-notes');
    await commercialNotesApi.updateCommercialNote(noteId, noteData);
};
export const bulkReleaseProspects = async (
    prospectIds: string[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!prospectIds || prospectIds.length === 0) return;
    const batch = writeBatch(db);
    prospectIds.forEach((id) => {
        const docRef = doc(db, 'prospects', id);
        batch.update(docRef, {
            ownerId: '',            
            ownerName: 'Sin Asignar',
            updatedAt: serverTimestamp(),
        });
    });
    await batch.commit();
    invalidateCache('prospects'); 
    
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: 'multiple_release',
        entityName: `${prospectIds.length} prospectos`,
        details: `liberó automáticamente <strong>${prospectIds.length}</strong> prospectos por inactividad.`,
        ownerName: 'Sistema',
    });
};

// --- Config Functions ---

export const getOpportunityAlertsConfig = async (): Promise<OpportunityAlertsConfig> => {
    const docRef = doc(collections.systemConfig, 'opportunity_alerts');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return {};
};

export const getObjectiveVisibilityConfig = async (): Promise<ObjectiveVisibilityConfig> => {
    const cached = getFromCache(OBJECTIVE_VISIBILITY_DOC_ID);
    if (cached) return cached;

    const docRef = doc(collections.systemConfig, OBJECTIVE_VISIBILITY_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data() as ObjectiveVisibilityConfig;
        const parsed: ObjectiveVisibilityConfig = {
            activeMonthKey: data.activeMonthKey,
            visibleUntil: typeof data.visibleUntil === 'string' ? data.visibleUntil : undefined,
            updatedByName: data.updatedByName,
            updatedAt: timestampToISO((data as any).updatedAt) || data.updatedAt,
        };
        setInCache(OBJECTIVE_VISIBILITY_DOC_ID, parsed);
        return parsed;
    }

    return {};
};

export const updateOpportunityAlertsConfig = async (config: OpportunityAlertsConfig, userId: string, userName: string) => {
    const docRef = doc(collections.systemConfig, 'opportunity_alerts');
    await setDoc(docRef, config, { merge: true });
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'opportunity_alerts_config' as any,
        entityId: 'opportunity_alerts',
        entityName: 'Configuración de Alertas de Oportunidades',
        details: 'actualizó la configuración de alertas de oportunidades.',
        ownerName: userName,
    });
};


export const updateObjectiveVisibilityConfig = async (
    config: ObjectiveVisibilityConfig,
    userId: string,
    userName: string
) => {
    const docRef = doc(collections.systemConfig, OBJECTIVE_VISIBILITY_DOC_ID);
    await setDoc(
        docRef,
        { ...config, updatedAt: serverTimestamp(), updatedByName: userName },
        { merge: true }
    );
    invalidateCache(OBJECTIVE_VISIBILITY_DOC_ID);

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'objective_visibility' as any,
        entityId: OBJECTIVE_VISIBILITY_DOC_ID,
        entityName: 'Visibilidad de objetivos',
        details: 'actualizó la fecha de visibilidad de objetivos.',
        ownerName: userName,
    });
};

export const getAreaPermissions = async (): Promise<Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>> => {
    const cachedData = getFromCache('permissions');
    if (cachedData) return cachedData;

    const { getAreaPermissions } = await import('@/lib/api/system');
    const permissions = await getAreaPermissions();
    setInCache('permissions', permissions);
    return permissions;
};

export const updateAreaPermissions = async (permissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>): Promise<void> => {
    const { updateAreaPermissions } = await import('@/lib/api/system');
    await updateAreaPermissions(permissions);
    invalidateCache('permissions');
};

export const saveMonthlyClosure = async (advisorId: string, month: string, value: number, managerId: string) => {
    const { saveMonthlyClosure } = await import('@/lib/api/users');
    await saveMonthlyClosure(advisorId, month, value);
    invalidateCache('users');
};
// --- Supervisor Comments ---
const mapCommentDoc = (snapshot: any): SupervisorComment => {
    const data = snapshot.data();
    const replies = Array.isArray(data.replies) ? data.replies.map((reply: SupervisorCommentReply) => ({
        ...reply,
        createdAt: timestampToISO((reply as any).createdAt) || new Date().toISOString(),
    })) : [];

    const lastSeenAtBy: Record<string, string> | undefined = data.lastSeenAtBy
        ? Object.entries(data.lastSeenAtBy).reduce((acc, [userId, value]) => {
            const parsed = timestampToISO(value) || (typeof value === 'string' ? value : undefined);
            if (parsed) acc[userId] = parsed;
            return acc;
        }, {} as Record<string, string>)
        : undefined;

    return {
        id: snapshot.id,
        ...data,
        createdAt: timestampToISO(data.createdAt) || new Date().toISOString(),
        replies,
        lastMessageAt: timestampToISO(data.lastMessageAt),
        lastSeenAtBy,
    } as SupervisorComment;
};

export const getSupervisorCommentsForEntity = async (entityType: 'client' | 'opportunity', entityId: string): Promise<SupervisorComment[]> => {
    const q = query(
        collections.supervisorComments,
        where('entityType', '==', entityType),
        where('entityId', '==', entityId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(mapCommentDoc)
        .sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
};

export const getSupervisorCommentThreadsForUser = async (userId: string): Promise<SupervisorComment[]> => {
    const q = query(
        collections.supervisorComments,
        where('lastMessageRecipientId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(mapCommentDoc)
        .sort((a, b) => {
            if (!a.lastMessageAt || !b.lastMessageAt) return 0;
            return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        });
};

interface CreateSupervisorCommentInput {
    entityType: 'client' | 'opportunity';
    entityId: string;
    entityName: string;
    ownerId: string;
    ownerName: string;
    authorId: string;
    authorName: string;
    message: string;
    recipientId?: string;
    recipientName?: string;
}

export const createSupervisorComment = async (input: CreateSupervisorCommentInput): Promise<string> => {
    const docRef = await addDoc(collections.supervisorComments, {
        ...input,
        createdAt: serverTimestamp(),
        replies: [],
        lastMessageAuthorId: input.authorId,
        lastMessageAuthorName: input.authorName,
        lastMessageRecipientId: input.recipientId || input.ownerId,
        lastMessageRecipientName: input.recipientName || input.ownerName,
        lastMessageText: input.message,
        lastMessageAt: serverTimestamp(),
        lastSeenAtBy: {
            [input.authorId]: serverTimestamp(),
        },
    });
    invalidateCache(`comments_${input.entityType}_${input.entityId}`);
    invalidateCache(`commentThreads_${input.recipientId || input.ownerId}`);
    return docRef.id;
};

interface ReplySupervisorCommentInput {
    commentId: string;
    authorId: string;
    authorName: string;
    message: string;
    recipientId?: string;
    recipientName?: string;
}

export const replyToSupervisorComment = async ({ commentId, authorId, authorName, message, recipientId, recipientName }: ReplySupervisorCommentInput): Promise<void> => {
    const commentRef = doc(collections.supervisorComments, commentId);
    const replyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const reply: SupervisorCommentReply = {
        id: replyId,
        authorId,
        authorName,
        message,
        recipientId,
        recipientName,
        createdAt: new Date().toISOString(),
    };

    await updateDoc(commentRef, {
        replies: arrayUnion(reply),
        lastMessageAuthorId: authorId,
        lastMessageAuthorName: authorName,
        lastMessageRecipientId: recipientId,
        lastMessageRecipientName: recipientName,
        lastMessageText: message,
        lastMessageAt: serverTimestamp(),
        [`lastSeenAtBy.${authorId}`]: serverTimestamp(),
    });
};

export const markSupervisorCommentThreadSeen = async (commentId: string, userId: string): Promise<void> => {
    const commentRef = doc(collections.supervisorComments, commentId);
    await updateDoc(commentRef, {
        [`lastSeenAtBy.${userId}`]: serverTimestamp(),
    });
};

export const deleteSupervisorCommentThread = async (
    commentId: string,
    entityType: 'client' | 'opportunity',
    entityId: string,
    ownerId: string,
    recipientId?: string
): Promise<void> => {
    const commentRef = doc(collections.supervisorComments, commentId);
    await deleteDoc(commentRef);
    invalidateCache(`comments_${entityType}_${entityId}`);
    invalidateCache(`commentThreads_${recipientId || ownerId}`);
};


// --- Vacation Request (License) Functions ---

export const getVacationRequests = async (): Promise<VacationRequest[]> => {
    const cachedData = getFromCache('licenses');
    if(cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.licenses, orderBy("requestDate", "desc")));
    const requests = snapshot.docs.map(doc => {
        const data = doc.data();
        const convertTimestamp = (field: any): string | undefined => {
            if (!field) return undefined;
            if (field instanceof Timestamp) {
                return field.toDate().toISOString();
            }
            if (typeof field === 'string') {
                return field; // Asumimos ISO string si ya es string
            }
            return undefined;
        };

        return {
            id: doc.id,
            ...data,
            requestDate: convertTimestamp(data.requestDate)!,
            approvedAt: convertTimestamp(data.approvedAt),
            cancelledAt: convertTimestamp(data.cancelledAt),
        } as VacationRequest;
    });
    setInCache('licenses', requests);
    return requests;
};

export const createVacationRequest = async (
    requestData: Omit<VacationRequest, 'id' | 'status'>,
    managerEmail: string | null
): Promise<{ docId: string; emailPayload: { to: string, subject: string, body: string } | null }> => {
    
    // 1. Obtener feriados para calcular días reales (seguridad backend)
    const holidays = await getSystemHolidays();
    const calculatedDays = calculateBusinessDays(requestData.startDate, requestData.returnDate, holidays);

    const finalDaysRequested = calculatedDays;

    if (finalDaysRequested <= 0) {
        throw new Error("El rango de fechas seleccionado no consume días hábiles.");
    }

    const userRef = doc(db, 'users', requestData.userId);
    const newLicenciaRef = doc(collections.licenses);

    await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("Usuario no encontrado.");
        
        const userData = userDoc.data() as User;
        const currentDays = userData.vacationDays || 0;

        if (currentDays < finalDaysRequested) {
            throw new Error(`No tienes suficientes días disponibles. Solicitas ${finalDaysRequested} y tienes ${currentDays}.`);
        }

        // DESCUENTO PROVISORIO INMEDIATO
        transaction.update(userRef, {
            vacationDays: currentDays - finalDaysRequested
        });

        const dataToSave = {
            ...requestData,
            daysRequested: finalDaysRequested, // Guardamos el valor calculado real
            status: 'Pendiente',
            requestDate: serverTimestamp(),
            holidays: holidays, // Guardamos qué feriados se consideraron (snapshot)
        };

        transaction.set(newLicenciaRef, dataToSave);
    });

    invalidateCache('licenses');
    invalidateCache('users');
    
    let emailPayload: { to: string, subject: string, body: string } | null = null;

    if (managerEmail) {
        emailPayload = {
            to: managerEmail,
            subject: `Nueva Solicitud de Licencia de ${requestData.userName}`,
            body: `
                <p>Hola,</p>
                <p>Has recibido una nueva solicitud de licencia de <strong>${requestData.userName}</strong>.</p>
                <p><strong>Salida:</strong> ${format(parseISO(requestData.startDate), 'P', { locale: es })}</p>
                <p><strong>Retorno:</strong> ${format(parseISO(requestData.returnDate), 'P', { locale: es })}</p>
                <p><strong>Días a consumir:</strong> ${finalDaysRequested}</p>
                <p><em>Estos días ya han sido descontados provisoriamente del saldo del asesor.</em></p>
                <p>Para aprobar o rechazar esta solicitud, por favor ingresa a la sección "Licencias" del CRM.</p>
            `,
        };
    }

    return { docId: newLicenciaRef.id, emailPayload };
};

export const updateVacationRequest = async (
    requestId: string,
    updates: Partial<VacationRequest>
): Promise<void> => {
    const holidays = await getSystemHolidays();

    await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, 'licencias', requestId);
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error("Solicitud no encontrada");
        const oldRequest = requestSnap.data() as VacationRequest;

        const userRef = doc(db, 'users', oldRequest.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("Usuario no encontrado");
        const userData = userSnap.data() as User;

        let newDaysRequested = oldRequest.daysRequested;

        const newStartDate = updates.startDate || oldRequest.startDate;
        const newReturnDate = updates.returnDate || oldRequest.returnDate;

        if (newStartDate !== oldRequest.startDate || newReturnDate !== oldRequest.returnDate) {
             newDaysRequested = calculateBusinessDays(newStartDate, newReturnDate, holidays);
        }

        if (newDaysRequested <= 0) throw new Error("El rango no consume días hábiles.");

        const currentBalance = userData.vacationDays || 0;
        let balanceBeforeThisRequest = currentBalance;
        if (oldRequest.status === 'Pendiente' || oldRequest.status === 'Aprobado') {
            balanceBeforeThisRequest += oldRequest.daysRequested;
        }

        if (balanceBeforeThisRequest < newDaysRequested) {
             throw new Error(`Saldo insuficiente.`);
        }

        const finalBalance = balanceBeforeThisRequest - newDaysRequested;

        if (finalBalance !== currentBalance) {
            transaction.update(userRef, { vacationDays: finalBalance });
        }

        transaction.update(requestRef, {
            ...updates,
            daysRequested: newDaysRequested,
            holidays: holidays,
            updatedAt: serverTimestamp()
        });
    });
    
    invalidateCache('licenses');
    invalidateCache('users');
};

export const adjustVacationDays = async (userId: string, days: number, updatedBy: string, updatedByName: string): Promise<void> => {
    if (days === 0) {
        throw new Error('La cantidad de días a ajustar debe ser distinta de cero.');
    }

    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
            throw new Error('Usuario no encontrado.');
        }

        const userData = userSnap.data() as User;
        const currentDays = userData.vacationDays || 0;
        const newVacationDays = currentDays + days;

        transaction.update(userRef, {
            vacationDays: newVacationDays,
            updatedAt: serverTimestamp(),
            updatedBy,
        });
    });

    invalidateCache('users');

    const updatedUser = await getDoc(userRef);
    const action = days > 0 ? 'agregó' : 'quitó';
    const amount = Math.abs(days);

    await logActivity({
        userId: updatedBy,
        userName: updatedByName,
        type: 'update',
        entityType: 'user',
        entityId: userId,
        entityName: (updatedUser.data() as User)?.name || 'Usuario',
        details: `${action} <strong>${amount}</strong> días de licencia a <strong>${(updatedUser.data() as User)?.name || 'un usuario'}</strong>`,
    });
};

export const addVacationDays = async (userId: string, daysToAdd: number, updatedBy: string, updatedByName: string): Promise<void> => {
    if (daysToAdd <= 0) {
        throw new Error('La cantidad de días a agregar debe ser mayor a cero.');
    }

    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
            throw new Error('Usuario no encontrado.');
        }

        const userData = userSnap.data() as User;
        const currentDays = userData.vacationDays || 0;
        const newVacationDays = currentDays + daysToAdd;

        transaction.update(userRef, {
            vacationDays: newVacationDays,
            updatedAt: serverTimestamp(),
            updatedBy,
        });
    });

    invalidateCache('users');

    const updatedUser = await getDoc(userRef);
    await logActivity({
        userId: updatedBy,
        userName: updatedByName,
        type: 'update',
        entityType: 'user',
        entityId: userId,
        entityName: (updatedUser.data() as User)?.name || 'Usuario',
        details: `agregó <strong>${daysToAdd}</strong> días de licencia a <strong>${(updatedUser.data() as User)?.name || 'un usuario'}</strong>`,
    });
};

export const approveVacationRequest = async (
    requestId: string,
    newStatus: VacationRequestStatus,
    approverId: string,
    applicantEmail: string | null,
): Promise<{ emailPayload: { to: string, subject: string, body: string } | null }> => {
    const requestRef = doc(db, 'licencias', requestId);

    let pendingDaysAfterUpdate: number | null = null;

    await runTransaction(db, async (transaction) => {
        const requestDoc = await transaction.get(requestRef);
        if (!requestDoc.exists()) {
            throw "Solicitud no encontrada.";
        }
        const requestData = requestDoc.data() as VacationRequest;
        
        // Evitar doble procesamiento si ya está en el estado deseado
        if (requestData.status === newStatus) return;

        const userRef = doc(db, 'users', requestData.userId);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw "Usuario solicitante no encontrado.";
        
        const userData = userDoc.data() as User;
        let newVacationDays = userData.vacationDays || 0;

        // LÓGICA DE REVERSIÓN O CONFIRMACIÓN
        
        // Caso 1: Estaba Pendiente y se RECHAZA -> Devolver días (Rollback)
        if (requestData.status === 'Pendiente' && newStatus === 'Rechazado') {
            newVacationDays += requestData.daysRequested;
        }
        // Caso 2: Estaba Aprobado y se pasa a Rechazado (Cancelación tardía) -> Devolver días
        else if (requestData.status === 'Aprobado' && newStatus === 'Rechazado') {
            newVacationDays += requestData.daysRequested;
        }
        // Caso 3: Estaba Rechazado y se pasa a Aprobado/Pendiente -> Volver a descontar
        else if (requestData.status === 'Rechazado' && (newStatus === 'Aprobado' || newStatus === 'Pendiente')) {
            newVacationDays -= requestData.daysRequested;
        }
        
        // Si pasa de Pendiente a Aprobado: NO HACEMOS NADA con el saldo, 
        // porque ya se descontó en la creación (consumo provisorio).

        if (newVacationDays !== (userData.vacationDays || 0)) {
            transaction.update(userRef, { vacationDays: newVacationDays });
            invalidateCache('users');
        }
        pendingDaysAfterUpdate = newVacationDays;
        
        transaction.update(requestRef, {
            status: newStatus,
            approvedBy: approverId,
            approvedAt: new Date().toISOString(),
        });
    });

    invalidateCache('licenses');
    const requestAfterUpdate = (await getDoc(requestRef)).data() as VacationRequest;
    
    let emailPayload: { to: string, subject: string, body: string } | null = null;
    if (applicantEmail) {
        if (newStatus === 'Aprobado') {
            const today = new Date();
            const start = format(parseISO(requestAfterUpdate.startDate), "d 'de' MMMM 'de' yyyy", { locale: es });
            const returnDate = format(parseISO(requestAfterUpdate.returnDate), "d 'de' MMMM 'de' yyyy", { locale: es });
            const todayFormatted = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
            const pending = pendingDaysAfterUpdate ?? 0;

           emailPayload = {
                to: applicantEmail,
                subject: `Autorización de licencia`,
                body: `<p>Tu licencia del ${start} (retorno el ${returnDate}) ha sido aprobada.</p>`, // Simplificado para el ejemplo
            };
        } else if (newStatus === 'Rechazado') {
             emailPayload = {
                to: applicantEmail,
                subject: `Solicitud Rechazada`,
                body: `<p>Tu solicitud de licencia ha sido rechazada. Los días se han reintegrado a tu saldo.</p>`,
            };
        }
    }
    
    return { emailPayload };
};

export const annulVacationRequest = async (
    requestId: string,
    reason: string,
    managerId: string,
    managerName: string,
    applicantEmail: string | null
): Promise<{ emailPayload: { to: string, subject: string, body: string } | null }> => {
    if (!reason.trim()) throw new Error("El motivo de anulación es obligatorio.");

    const requestRef = doc(db, 'licencias', requestId);

    await runTransaction(db, async (transaction) => {
        const requestDoc = await transaction.get(requestRef);
        if (!requestDoc.exists()) throw "Solicitud no encontrada.";
        const requestData = requestDoc.data() as VacationRequest;
        
        if (requestData.status !== 'Aprobado') {
             throw "Solo se pueden anular licencias que ya han sido aprobadas.";
        }

        const userRef = doc(db, 'users', requestData.userId);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw "Usuario solicitante no encontrado.";
        
        const userData = userDoc.data() as User;
        const currentDays = userData.vacationDays || 0;
        
        transaction.update(userRef, { vacationDays: currentDays + requestData.daysRequested });
        
        transaction.update(requestRef, {
            status: 'Anulado',
            cancellationReason: reason,
            cancelledBy: managerId,
            cancelledByName: managerName,
            cancelledAt: new Date().toISOString(),
        });
    });

    invalidateCache('licenses');
    invalidateCache('users');
    
    let emailPayload = null;
    if (applicantEmail) {
        emailPayload = {
            to: applicantEmail,
            subject: `Anulación de licencia aprobada`,
            body: `<p>Tu licencia aprobada ha sido <strong>ANULADA</strong> por ${managerName}. Motivo: ${reason}</p>`,
        };
    }
    
    return { emailPayload };
};

export const deleteVacationRequest = async (requestId: string): Promise<void> => {
    const docRef = doc(db, 'licencias', requestId);
    await deleteDoc(docRef);
    invalidateCache('licenses');
};

// --- Helper: Cálculo de días hábiles ---
export const calculateBusinessDays = (startDateStr: string, returnDateStr: string, holidays: string[]): number => {
    const start = parseISO(startDateStr);
    const end = parseISO(returnDateStr); // Fecha de retorno (no se cuenta)
    const holidaySet = new Set(holidays);
    
    let count = 0;
    let current = start;

    // Iteramos mientras current sea ANTERIOR a end (el día de retorno no se cuenta)
    while (current < end) {
        const dateStr = format(current, 'yyyy-MM-dd');
        // Chequear fin de semana
        if (!isSaturday(current) && !isSunday(current)) {
            // Chequear feriado
            if (!holidaySet.has(dateStr)) {
                count++;
            }
        }
        // Avanzar un día
        current = new Date(current);
        current.setDate(current.getDate() + 1);
    }
    return count;
};

// --- Gestión de Feriados ---

export const getSystemHolidays = async (): Promise<string[]> => {
    const cached = getFromCache('system_holidays');
    if (cached) return cached as string[];

    const { getSystemHolidays } = await import('@/lib/api/system');
    const dates = await getSystemHolidays();
    setInCache('system_holidays', dates);
    return dates;
};

export const saveSystemHolidays = async (dates: string[], userId: string, userName: string) => {
    const { saveSystemHolidays } = await import('@/lib/api/system');
    await saveSystemHolidays(dates);
    invalidateCache('system_holidays');
};
// --- Prospect Functions ---
export const getProspects = async (): Promise<Prospect[]> => {
    const cachedData = getFromCache('prospects');
    if (cachedData) return cachedData;

    const { getProspects } = await import('@/lib/api/prospects');
    const prospects = await getProspects();
    setInCache('prospects', prospects);
    return prospects;
};

export const createProspect = async (
    prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>,
    userId: string,
    userName: string,
    options?: { skipCoachingUpdate?: boolean },
): Promise<string> => {
    const { createProspect } = await import('@/lib/api/prospects');
    const id = await createProspect(prospectData);

    const cacheData = {
        ...prospectData,
        id,
        ownerId: userId,
        ownerName: userName,
        creatorId: userId,
        creatorName: userName,
        createdAt: new Date().toISOString(),
    } as Prospect;

    mutateCacheArray('prospects', id, cacheData, 'add', (a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });

    if (!options?.skipCoachingUpdate) {
        try {
            await autoUpdateCoachingSession(userId, userName, 'prospect', id, prospectData.companyName, 'Nuevo prospecto cargado en el sistema.');
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }
    return id;
};

export const updateProspect = async (id: string, data: Partial<Omit<Prospect, 'id'>>, userId: string, userName: string): Promise<void> => {
    const { updateProspect } = await import('@/lib/api/prospects');
    const result = await updateProspect(id, data);
    const prospectData = result.originalData;

    mutateCacheArray('prospects', id, { ...data, updatedAt: new Date().toISOString() }, 'update');

    const coachingNotes = [
        data.status && data.status !== prospectData.status ? `Estado: ${data.status}` : null,
        data.notes && data.notes !== prospectData.notes ? `Notas: ${data.notes}` : null,
    ].filter(Boolean).join(' - ');

    if (coachingNotes) {
        try {
            await autoUpdateCoachingSession(userId, userName, 'prospect', id, prospectData.companyName, `Actualizacion de prospecto - ${coachingNotes}`);
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }
};

export const deleteProspect = async (id: string, userId: string, userName: string): Promise<void> => {
    const { deleteProspect } = await import('@/lib/api/prospects');
    await deleteProspect(id);
    mutateCacheArray('prospects', id, null, 'delete');
};
export const recordProspectNotifications = async (
    prospectIds: string[],
    userId: string,
    userName: string,
): Promise<void> => {
    if (prospectIds.length === 0) return;

    const batch = writeBatch(db);
    prospectIds.forEach(prospectId => {
        const prospectRef = doc(db, 'prospects', prospectId);
        batch.update(prospectRef, { lastProspectNotificationAt: serverTimestamp() });
    });

    await batch.commit();
    invalidateCache('prospects');

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: 'prospect_notifications',
        entityName: 'Notificaciones de prospectos',
        details: `envió recordatorios de seguimiento para ${prospectIds.length} prospecto(s).`,
        ownerName: userName,
    });
};

// --- Task Functions ---

export const completeActivityTask = async (activityId: string, userId: string, userName: string): Promise<void> => {
    const { completeActivityTask } = await import('@/lib/api/client-activities');
    await completeActivityTask(activityId);
    invalidateCache('client_activities');
};

export const rescheduleActivityTask = async (activityId: string, newDate: Date, userId: string, userName: string): Promise<void> => {
    const { rescheduleActivityTask } = await import('@/lib/api/client-activities');
    await rescheduleActivityTask(activityId, newDate);
    invalidateCache('client_activities');
};

// --- Grilla Comercial Functions ---

export const getPrograms = async (): Promise<Program[]> => {
    const cachedData = getFromCache('programs');
    if (cachedData) return cachedData;

    const { getPrograms } = await import('@/lib/api/programs');
    const programs = await getPrograms();
    setInCache('programs', programs);
    return programs;
};

export const getProgram = async (id: string): Promise<Program | null> => {
    const { getProgram } = await import('@/lib/api/programs');
    return getProgram(id);
}

export const saveProgram = async (programData: Omit<Program, 'id'>, userId: string): Promise<string> => {
    const { saveProgram } = await import('@/lib/api/programs');
    const programId = await saveProgram(programData);
    invalidateCache('programs');
    return programId;
};

export const updateProgram = async (programId: string, programData: Partial<Omit<Program, 'id'>>, userId: string): Promise<void> => {
    const { updateProgram } = await import('@/lib/api/programs');
    await updateProgram(programId, programData);
    invalidateCache('programs');
};

export const deleteProgram = async (programId: string, userId: string): Promise<void> => {
    const { deleteProgram } = await import('@/lib/api/programs');
    await deleteProgram(programId);
    invalidateCache('programs');
    invalidateCache();
};
export const getCommercialItems = async (date: string): Promise<CommercialItem[]> => {
    const cacheKey = `commercial_items_${date}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const { getCommercialItems } = await import('@/lib/api/commercial-items');
    const items = await getCommercialItems(date);
    setInCache(cacheKey, items);
    return items;
};

export const getCommercialItemsBySeries = async (seriesId: string): Promise<CommercialItem[]> => {
    const { getCommercialItemsBySeries } = await import('@/lib/api/commercial-items');
    return getCommercialItemsBySeries(seriesId);
};

export const saveCommercialItemSeries = async (item: Omit<CommercialItem, 'id' | 'date'>, dates: Date[], userId: string, isEditingSeries?: boolean): Promise<string | void> => {
    const { saveCommercialItemSeries } = await import('@/lib/api/commercial-items');
    const seriesId = await saveCommercialItemSeries(item, dates, isEditingSeries);
    invalidateCache(); // Invalidate all caches for simplicity
    return seriesId;
};

export const createCommercialItem = async (itemData: Omit<CommercialItem, 'id'>, userId: string, userName: string): Promise<string> => {
    const { createCommercialItem } = await import('@/lib/api/commercial-items');
    const id = await createCommercialItem(itemData);
    invalidateCache(); // Invalidate all for simplicity
    return id;
};


export const updateCommercialItem = async (itemId: string, itemData: Partial<Omit<CommercialItem, 'id'>>, userId: string, userName: string): Promise<void> => {
    const { updateCommercialItem } = await import('@/lib/api/commercial-items');
    await updateCommercialItem(itemId, itemData);
    invalidateCache();
};

export const deleteCommercialItem = async (itemIds: string[], userId?: string, userName?: string): Promise<void> => {
    if (!itemIds || itemIds.length === 0) return;

    const { deleteCommercialItem } = await import('@/lib/api/commercial-items');
    await deleteCommercialItem(itemIds, Boolean(userId && userName));
    invalidateCache(); // Invalidate all caches
};


// --- Canje Functions ---
export const getCanjes = async (): Promise<Canje[]> => {
    const cachedData = getFromCache('canjes');
    if (cachedData) return cachedData;

    const { getCanjes } = await import('@/lib/api/canjes');
    const canjes = await getCanjes();
    setInCache('canjes', canjes);
    return canjes;
};

export const getAdvertisingOrdersByCanjeId = async (canjeId: string, legacyOrderIds: string[] = []): Promise<AdvertisingOrder[]> => {
    if (!canjeId) return [];
    const { getAdvertisingOrdersByCanjeId } = await import('@/lib/api/canjes');
    return getAdvertisingOrdersByCanjeId(canjeId, legacyOrderIds);
};

export const getInvoicesByCanjeId = async (canjeId: string): Promise<Invoice[]> => {
    if (!canjeId) return [];
    const { getInvoicesByCanjeId } = await import('@/lib/api/canjes');
    return getInvoicesByCanjeId(canjeId);
};

export const createCanje = async (canjeData: Omit<Canje, 'id' | 'fechaCreacion'>, userId: string, userName: string): Promise<string> => {
    const { createCanje } = await import('@/lib/api/canjes');
    const id = await createCanje(canjeData);
    invalidateCache('canjes');
    return id;
};

export const updateCanje = async (
    id: string, 
    data: Partial<Omit<Canje, 'id'>>, 
    userId: string, 
    userName: string
): Promise<void> => {
    const { updateCanje } = await import('@/lib/api/canjes');
    await updateCanje(id, data);
    invalidateCache('canjes');
};

export const deleteCanje = async (id: string, userId: string, userName: string): Promise<void> => {
    const { deleteCanje } = await import('@/lib/api/canjes');
    await deleteCanje(id);
    invalidateCache('canjes');
};



// --- Invoice Functions ---
const normalizeInvoiceAmount = (rawAmount: unknown): number => {
    if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
        return rawAmount;
    }

    if (typeof rawAmount === 'string') {
        const sanitized = rawAmount.replace(/\s+/g, '').replace(',', '.');
        const parsed = Number(sanitized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    const fallback = Number(rawAmount ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
};

export const getInvoices = async (): Promise<Invoice[]> => {
    return getCachedOrLoad('invoices', async () => {
        const { getInvoices } = await import('@/lib/api/invoices');
        return getInvoices();
    });
};
export const getDashboardInvoices = async (): Promise<Invoice[]> => {
    const cachedData = getFromCache('dashboard_invoices');
    if (cachedData) return cachedData;

    // 🟢 Solo traemos facturas de los últimos 13 meses para el gráfico, ahorrando miles de lecturas.
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const dateStr = thirteenMonthsAgo.toISOString();

    const q = query(
        collections.invoices, 
        where("dateGenerated", ">=", dateStr), 
        orderBy("dateGenerated", "desc")
    );
    const snapshot = await getDocsPreferCache(q);
    
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        const validDate = data.date && typeof data.date === 'string' ? parseDateWithTimezone(data.date) : null;
        const validDatePaid = data.datePaid && typeof data.datePaid === 'string' ? parseDateWithTimezone(data.datePaid) : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            date: validDate ? format(validDate, 'yyyy-MM-dd') : undefined,
            dateGenerated: data.dateGenerated instanceof Timestamp ? data.dateGenerated.toDate().toISOString() : data.dateGenerated,
            datePaid: validDatePaid ? format(validDatePaid, 'yyyy-MM-dd') : undefined,
            isCreditNote: Boolean(data.isCreditNote),
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            orderDate: data.orderDate,
            orderNumber: data.orderNumber,
        } as Invoice;
    });

    setInCache('dashboard_invoices', invoices);
    return invoices;
};

export const getDashboardTasks = async (): Promise<ClientActivity[]> => {
    const cachedData = getFromCache('dashboard_tasks');
    if (cachedData) return cachedData;

    // 🟢 ESTRATEGIA LIGERA: Traemos exclusivamente las que son tareas.
    const q = query(
        collections.clientActivities, 
        where('isTask', '==', true), 
        orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocsPreferCache(q);
    const tasks = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp,
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : data.dueDate,
            completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate().toISOString() : data.completedAt,
        } as ClientActivity;
    });
    setInCache('dashboard_tasks', tasks);
    return tasks;
};

export const getInvoicesPaginated = async (
    lastVisibleDoc: QueryDocumentSnapshot | null = null, 
    pageSize: number = 50
) => {
    let q;
    
    if (lastVisibleDoc) {
        q = query(
            collections.invoices, 
            orderBy("dateGenerated", "desc"), 
            startAfter(lastVisibleDoc), 
            limit(pageSize)
        );
    } else {
        q = query(
            collections.invoices, 
            orderBy("dateGenerated", "desc"), 
            limit(pageSize)
        );
    }

    const snapshot = await getDocs(q);
    
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data() as Partial<Invoice>;
        const validDate = data.date && typeof data.date === 'string' ? parseDateWithTimezone(data.date) : null;
        const validDatePaid = data.datePaid && typeof data.datePaid === 'string' ? parseDateWithTimezone(data.datePaid) : null;
        return { id: doc.id, ...data } as Invoice;
    });

    return {
        invoices,
        lastVisible: snapshot.docs[snapshot.docs.length - 1] || null // Guardamos el último documento para la siguiente página
    };
};

export const getInvoicesForOpportunity = async (opportunityId: string): Promise<Invoice[]> => {
    const cacheKey = `invoices_opportunity_${opportunityId}`;
    return getCachedOrLoad(cacheKey, async () => {
        const { getInvoicesForOpportunity } = await import('@/lib/api/invoices');
        return getInvoicesForOpportunity(opportunityId);
    });
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const cacheKey = `invoices_client_${clientId}`;
    return getCachedOrLoad(cacheKey, async () => {
        const { getInvoicesForClient } = await import('@/lib/api/clients');
        return getInvoicesForClient(clientId);
    });
};

export const createInvoice = async (invoiceData: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const { createInvoice } = await import('@/lib/api/invoices');
    const id = await createInvoice(invoiceData);
    invalidateCache('invoices');
    invalidateInvoiceDetailCaches();
    return id;
};

export const updateInvoice = async (id: string, data: Partial<Omit<Invoice, 'id'>>, userId: string, userName: string, ownerName: string): Promise<void> => {
    const { updateInvoice } = await import('@/lib/api/invoices');
    await updateInvoice(id, data);
    mutateCacheArray('invoices', id, data, 'update');
    invalidateInvoiceDetailCaches();
};

export const deleteInvoice = async (id: string, userId: string, userName: string, ownerName: string): Promise<void> => {
    const { deleteInvoice } = await import('@/lib/api/invoices');
    await deleteInvoice(id, ownerName);
    mutateCacheArray('invoices', id, null, 'delete');
    invalidateInvoiceDetailCaches();
};
export type InvoiceBatchDeleteResult = {
    deleted: string[];
    failed: { id: string; error: string }[];
};

export type InvoiceBatchDeleteProgress = InvoiceBatchDeleteResult & {
    total: number;
    processed: number;
    chunk: string[];
};

type InvoiceBatchDeleteOptions = {
    batchSize?: number;
    onProgress?: (progress: InvoiceBatchDeleteProgress) => void;
    resolveOwnerName?: (invoiceId: string) => string;
};

export const deleteInvoicesInBatches = async (
    ids: string[],
    userId: string,
    userName: string,
    options: InvoiceBatchDeleteOptions = {},
): Promise<InvoiceBatchDeleteResult> => {
    const { batchSize = 25, onProgress, resolveOwnerName } = options;
    const result: InvoiceBatchDeleteResult = { deleted: [], failed: [] };
    const total = ids.length;

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        chunks.push(ids.slice(i, i + batchSize));
    }

    for (const chunk of chunks) {
        const settled = await Promise.allSettled(
            chunk.map(async (invoiceId) => {
                const ownerName = resolveOwnerName?.(invoiceId) || 'Cliente';
                await deleteInvoice(invoiceId, userId, userName, ownerName);
            }),
        );

        settled.forEach((res, index) => {
            const invoiceId = chunk[index];
            if (res.status === 'fulfilled') {
                result.deleted.push(invoiceId);
            } else {
                const message = res.reason instanceof Error ? res.reason.message : String(res.reason);
                result.failed.push({ id: invoiceId, error: message });
            }
        });

        const processed = result.deleted.length + result.failed.length;
        onProgress?.({
            total,
            processed,
            chunk,
            deleted: [...result.deleted],
            failed: [...result.failed],
        });
    }

    return result;
};


// --- Payment entries ---

const PAYMENT_CACHE_KEY = 'paymentEntries';
const PENDING_PAYMENT_CACHE_KEY = 'pendingPaymentEntries';

export const getPaymentEntries = async (): Promise<PaymentEntry[]> => {
    return getCachedOrLoad(PAYMENT_CACHE_KEY, async () => {
        const { getPaymentEntries } = await import('@/lib/api/payments');
        return getPaymentEntries();
    });
};

export const getPendingPaymentEntries = async (): Promise<PaymentEntry[]> => {
    return getCachedOrLoad(PENDING_PAYMENT_CACHE_KEY, async () => {
        const { getPendingPaymentEntries } = await import('@/lib/api/payments');
        return getPendingPaymentEntries();
    });
};

export const replacePaymentEntriesForAdvisor = async (
    advisorId: string,
    advisorName: string,
    rows: Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[],
    userId: string,
    userName: string,
) => {
    const { replacePaymentEntriesForAdvisor } = await import('@/lib/api/payments');
    await replacePaymentEntriesForAdvisor(advisorId, advisorName, rows);
    invalidateCache(PAYMENT_CACHE_KEY);
};

export const updatePaymentEntry = async (
    paymentId: string,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
    audit?: { userId?: string; userName?: string; ownerName?: string; details?: string },
) => {
    const { updatePaymentEntry } = await import('@/lib/api/payments');
    await updatePaymentEntry(paymentId, updates, {
        ownerName: audit?.ownerName,
        details: audit?.details,
    });
    invalidateCache(PAYMENT_CACHE_KEY);
};

export const requestPaymentExplanation = async (
    paymentId: string,
    params: {
        advisorId: string;
        advisorName?: string;
        requestedById: string;
        requestedByName: string;
        note?: string;
        comprobanteNumber?: string | null;
    },
) => {
    const { requestPaymentExplanation } = await import('@/lib/api/payments');
    await requestPaymentExplanation(paymentId, {
        advisorName: params.advisorName,
        note: params.note,
        comprobanteNumber: params.comprobanteNumber,
    });
    invalidateCache(PAYMENT_CACHE_KEY);
};

export const deletePaymentEntries = async (paymentIds: string[]) => {
    if (paymentIds.length === 0) return;

    const { deletePaymentEntries } = await import('@/lib/api/payments');
    await deletePaymentEntries(paymentIds);
    invalidateCache(PAYMENT_CACHE_KEY);
};

// --- Agency Functions ---

export const getAgencies = async (): Promise<Agency[]> => {
    const cachedData = getFromCache('agencies');
    if (cachedData) return cachedData;

    const { getAgencies } = await import('@/lib/api/agencies');
    const agencies = await getAgencies();
    setInCache('agencies', agencies);
    return agencies;
};

export const createAgency = async (
    agencyData: Omit<Agency, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const { createAgency } = await import('@/lib/api/agencies');
    const agencyId = await createAgency(agencyData);
    invalidateCache('agencies');
    return agencyId;
};

// --- User Profile Functions ---

export const createUserProfile = async (uid: string, name: string, email: string, photoURL?: string): Promise<void> => {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
        name,
        email,
        role: 'Asesor',
        photoURL: photoURL || null,
        createdAt: serverTimestamp(),
    });
    invalidateCache('users');
};

export async function getUserProfile(uid: string): Promise<User | null> {
  const { getUserProfile } = await import('@/lib/api/users');
  const user = await getUserProfile(uid);
  if (user) setInCache(`user_${uid}`, user);
  return user;
}

export async function updateUserProfile(uid: string, data: Partial<User>) {
  const { updateUserProfile } = await import('@/lib/api/users');
  await updateUserProfile(uid, data);
  invalidateCache('users');
};

export const syncRegisteredUsersFromAuth = async (): Promise<{ total: number; created: number; updated: number }> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('No hay sesion activa para sincronizar usuarios.');

  const response = await fetch('/api/admin/users/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'No se pudo sincronizar usuarios registrados.');
  }

  const result = await response.json();
  invalidateCache('users');
  return result;
};

export const createExternalCanjeUser = async (data: { name: string; email: string; password: string }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Debes iniciar sesión.');
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/users/external', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta externa.');
  invalidateCache('users');
  return result;
};

export const getAllUsers = async (role?: UserRole): Promise<User[]> => {
  const cacheKey = `all_users_${role || 'all'}`;
  const cached = getFromCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return cached as User[];
  if (pendingReads[cacheKey]) return pendingReads[cacheKey] as Promise<User[]>;

  pendingReads[cacheKey] = (async () => {
    const { getAllUsers } = await import('@/lib/api/users');
    const sorted = await getAllUsers(role);
    if (sorted.length > 0) setInCache(cacheKey, sorted);
    return sorted;
  })().finally(() => {
    delete pendingReads[cacheKey];
  });

  return pendingReads[cacheKey] as Promise<User[]>;
};

export const getUserById = async (userId: string): Promise<User | null> => {
    const cacheKey = `user_${userId}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached as User;

    const { getUserById } = await import('@/lib/api/users');
    const user = await getUserById(userId);
    if (user) setInCache(cacheKey, user);
    return user;
};

export const getUsersByRole = async (role: UserRole): Promise<User[]> => {
    return getAllUsers(role);
};

export const deleteUserAndReassignEntities = async (
    userIdToDelete: string,
    adminUserId: string,
    adminUserName: string
): Promise<void> => {
    const userRef = doc(db, 'users', userIdToDelete);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Usuario no encontrado.");
    const userData = userSnap.data() as User;

    const batch = writeBatch(db);

    const clientsQuery = query(collections.clients, where('ownerId', '==', userIdToDelete));
    const clientsSnapshot = await getDocs(clientsQuery);
    clientsSnapshot.forEach(doc => {
        batch.update(doc.ref, {
            ownerId: deleteField(),
            ownerName: deleteField()
        });
    });

    const prospectsQuery = query(collections.prospects, where('ownerId', '==', userIdToDelete));
    const prospectsSnapshot = await getDocs(prospectsQuery);
    prospectsSnapshot.forEach(doc => {
        batch.update(doc.ref, {
            ownerId: deleteField(),
            ownerName: deleteField()
        });
    });
    
    batch.delete(userRef);

    await batch.commit();
    invalidateCache();

    await logActivity({
        userId: adminUserId,
        userName: adminUserName,
        type: 'delete',
        entityType: 'user',
        entityId: userIdToDelete,
        entityName: userData.name,
        details: `eliminó al usuario <strong>${userData.name}</strong> y desasignó ${clientsSnapshot.size} cliente(s) y ${prospectsSnapshot.size} prospecto(s).`,
        ownerName: adminUserName,
    });
};


// --- Client Functions ---

export const getClients = async (options: LoadOptions = {}): Promise<Client[]> => {
    const loader = async () => {
      const { getClients } = await import('@/lib/api/clients');
      return getClients();
    };

    if (options.forceServer) {
      invalidateCache('clients');
      const clients = await loader();
      setInCache('clients', clients);
      return clients;
    }

    return getCachedOrLoad('clients', loader);
};

export const getClient = async (id: string): Promise<Client | null> => {
    const { getClient } = await import('@/lib/api/clients');
    return getClient(id);
};

export const createClient = async (
    clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>,
    userId?: string,
    userName?: string
): Promise<string> => {
    const { createClient } = await import('@/lib/api/clients');
    const id = await createClient(clientData, userId, userName);
    invalidateCache('clients');
    return id;
};

export const updateClient = async (
    id: string,
    data: Partial<Omit<Client, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const { updateClient } = await import('@/lib/api/clients');
    await updateClient(id, data);
    mutateCacheArray('clients', id, data, 'update');
};
export const updateClientTangoMapping = async (
    id: string,
    data: ClientTangoUpdate,
    userId: string,
    userName: string,
    options: ClientTangoMappingOptions = {}
): Promise<void> => {
    const { updateClientTangoMapping } = await import('@/lib/api/clients');
    await updateClientTangoMapping(id, data, options);
    invalidateCache('clients');
};

export const undoClientTangoMapping = async (
    id: string,
    crmIdField: ClientTangoIdField,
    syncedField: ClientTangoSyncedField,
    userId: string,
    userName: string
): Promise<void> => {
    const { undoClientTangoMapping } = await import('@/lib/api/clients');
    await undoClientTangoMapping(id, crmIdField, syncedField);
    invalidateCache('clients');
};

export const deleteClient = async (
    id: string,
    userId: string,
    userName: string
): Promise<void> => {
    const { deleteClient } = await import('@/lib/api/clients');
    await deleteClient(id);
    mutateCacheArray('clients', id, null, 'delete');
};

export const bulkDeleteClients = async (clientIds: string[], userId: string, userName: string): Promise<void> => {
    if (!clientIds || clientIds.length === 0) return;
    const { bulkDeleteClients } = await import('@/lib/api/clients');
    await bulkDeleteClients(clientIds);
    clientIds.forEach(clientId => mutateCacheArray('clients', clientId, null, 'delete'));
};

export const bulkUpdateClients = async (
    updates: { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[],
    userId: string,
    userName: string
): Promise<void> => {
    const { bulkUpdateClients } = await import('@/lib/api/clients');
    await bulkUpdateClients(updates);
    invalidateCache('clients');
};
export const getPeopleByClientId = async (clientId: string): Promise<Person[]> => {
    const { getPeopleByClientId } = await import('@/lib/api/clients');
    return getPeopleByClientId(clientId);
}

export const createPerson = async (
    personData: Omit<Person, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const { createPerson } = await import('@/lib/api/people');
    const personId = await createPerson(personData);
    invalidateCache('people');
    invalidateCache('clients');
    return personId;
};

export const updatePerson = async (
    id: string,
    data: Partial<Omit<Person, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const { updatePerson } = await import('@/lib/api/people');
    await updatePerson(id, data);
    invalidateCache('people');
};

export const deletePerson = async (
    id: string,
    userId: string,
    userName: string
): Promise<void> => {
    const { deletePerson } = await import('@/lib/api/people');
    await deletePerson(id);
    invalidateCache('people');
};
const mapOpportunityDoc = (doc: any): Opportunity => {
    const data = doc.data();
    const opp: Opportunity = { id: doc.id, ...data } as Opportunity;

    const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;

    opp.createdAt = convertTimestamp(data.createdAt);

    if (data.updatedAt) {
        // @ts-ignore
        opp.updatedAt = convertTimestamp(data.updatedAt);
    }

    if (data.stageChangedAt) {
        // @ts-ignore
        opp.stageChangedAt = convertTimestamp(data.stageChangedAt);
    }

    if (data.manualUpdateDate) {
        // @ts-ignore
        opp.manualUpdateDate = convertTimestamp(data.manualUpdateDate);
    }

    if (Array.isArray(data.manualUpdateHistory)) {
        // @ts-ignore
        opp.manualUpdateHistory = data.manualUpdateHistory.map((entry: any) => convertTimestamp(entry));
    }

    if (data.closeDate && !(data.closeDate instanceof Timestamp)) {
        const validDate = parseDateWithTimezone(data.closeDate);
        opp.closeDate = validDate ? validDate.toISOString().split('T')[0] : '';
    } else if (data.closeDate instanceof Timestamp) {
        opp.closeDate = data.closeDate.toDate().toISOString().split('T')[0];
    }
    
    return opp;
};

export const getOpportunities = async (options: LoadOptions = {}): Promise<Opportunity[]> => {
    const cachedData = options.forceServer ? null : getFromCache('opportunities');
    if (cachedData) return cachedData;

    const { getOpportunities } = await import('@/lib/api/opportunities');
    const opportunities = await getOpportunities();
    setInCache('opportunities', opportunities);
    return opportunities;
};

export const getAllOpportunities = async (): Promise<Opportunity[]> => {
    return getCachedOrLoad('all_opportunities', async () => {
        const { getAllOpportunities } = await import('@/lib/api/opportunities');
        return getAllOpportunities();
    });
};

export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    return getCachedOrLoad(`opportunities_client_${clientId}`, async () => {
        const { getOpportunitiesByClientId } = await import('@/lib/api/clients');
        return getOpportunitiesByClientId(clientId);
    });
};

export const getOpportunitiesForUser = async (userId: string): Promise<Opportunity[]> => {
    return getCachedOrLoad(`opportunities_user_${userId}`, async () => {
        const { getOpportunitiesForUser } = await import('@/lib/api/opportunities');
        return getOpportunitiesForUser(userId);
    });
};
export const createOpportunity = async (
    opportunityData: Omit<Opportunity, 'id'>,
    userId: string,
    userName: string,
    ownerName: string
): Promise<string> => {
    const { createOpportunity } = await import('@/lib/api/opportunities');
    const id = await createOpportunity(opportunityData);

    invalidateOpportunityCaches([opportunityData.clientId]);

    try {
        const observationText = opportunityData.observaciones?.trim() ? ` - Observacion: ${opportunityData.observaciones.trim()}` : '';
        await autoUpdateCoachingSession(userId, userName, 'client', opportunityData.clientId, opportunityData.clientName, `Nueva propuesta: ${opportunityData.title} - Valor: $${opportunityData.value}${observationText}`);
    } catch (e) {
        console.error('Error auto-updating coaching:', e);
    }

    return id;
};
// Crear Oportunidad Rápida (para cuando el usuario escribe una nueva)
export const createQuickOpportunity = async (title: string, clientId: string, clientName: string, userId: string) => {
    const { createQuickOpportunity } = await import('@/lib/api/opportunities');
    const id = await createQuickOpportunity(title, clientId, clientName);
    invalidateOpportunityCaches([clientId]);
    return id;
}
export const updateOpportunity = async (
    id: string,
    data: Partial<Omit<Opportunity, 'id'>>,
    userId: string,
    userName: string,
    ownerName: string,
    pendingInvoices?: Omit<Invoice, 'id' | 'opportunityId'>[],
    options?: { manageContractPeriods?: boolean }
): Promise<void> => {
    const { updateOpportunity } = await import('@/lib/api/opportunities');
    const result = await updateOpportunity(id, data, pendingInvoices, options);
    const originalData = result.originalData;

    const cacheData: Partial<Opportunity> & { updatedAt: string; stageChangedAt?: string } = {
        ...data,
        updatedAt: new Date().toISOString(),
    };
    if (result.stageChanged) {
        cacheData.stageChangedAt = new Date().toISOString();
    }
    if (result.isRenewal || ('finalizationDate' in data && !data.finalizationDate)) {
        cacheData.finalizationDate = undefined;
    }

    mutateCacheArray('opportunities', id, cacheData, 'update');
    invalidateOpportunityCaches([originalData.clientId, data.clientId]);
    if ((pendingInvoices && pendingInvoices.length > 0) || result.createdInvoices > 0) {
        invalidateCache('invoices');
    }
    if (result.createdCommercialItems > 0) {
        invalidateCache();
    }

    if (result.isRenewal) {
        try {
            const latestRenewal = result.newRenewals[result.newRenewals.length - 1];
            const newStart = latestRenewal ? format(parseISO(latestRenewal.startDate), 'dd/MM/yyyy', { locale: es }) : '?';
            const newEnd = latestRenewal ? format(parseISO(latestRenewal.endDate), 'dd/MM/yyyy', { locale: es }) : '?';
            await autoUpdateCoachingSession(userId, userName, 'client', originalData.clientId, originalData.clientName, `Propuesta renovada: ${data.title || originalData.title} - Valor: $${data.value || originalData.value} - Periodo: ${newStart} al ${newEnd}`);
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }

    const coachingChanges = [
        result.stageChanged ? `Etapa: ${data.stage}` : null,
        data.value !== undefined && data.value !== originalData.value ? `Valor: $${data.value}` : null,
        data.observaciones !== undefined && data.observaciones !== originalData.observaciones ? `Observacion: ${data.observaciones || 'sin observaciones'}` : null,
        data.followUpDone !== undefined && data.followUpDone !== originalData.followUpDone ? `Que hice: ${data.followUpDone || 'sin detalle'}` : null,
        data.followUpCurrent !== undefined && data.followUpCurrent !== originalData.followUpCurrent ? `En que estamos: ${data.followUpCurrent || 'sin detalle'}` : null,
        data.followUpNext !== undefined && data.followUpNext !== originalData.followUpNext ? `Que sigue: ${data.followUpNext || 'sin detalle'}` : null,
    ].filter(Boolean).join(' - ');

    if (coachingChanges) {
        try {
            const isClosingWonProposal = result.stageChanged && data.stage === 'Cerrado - Ganado';
            await autoUpdateCoachingSession(
                userId,
                userName,
                'client',
                originalData.clientId,
                originalData.clientName,
                `Actualizacion de propuesta: ${data.title || originalData.title} - ${coachingChanges}`,
                isClosingWonProposal
                    ? {
                        createIfMissing: false,
                        completeIfActive: true,
                        updateExistingIfMissing: true,
                    }
                    : undefined
            );
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }
};

export const deleteOpportunity = async (
    id: string,
    userId: string,
    userName: string
): Promise<void> => {
    const { deleteOpportunity } = await import('@/lib/api/opportunities');
    await deleteOpportunity(id);
    mutateCacheArray('opportunities', id, null, 'delete');
    invalidateOpportunityCaches();
    invalidateCache('invoices');
};
const convertActivityLogDoc = (doc: any): ActivityLog => {
    const data = doc.data();
    if (data.timestamp instanceof Timestamp) {
        data.timestamp = data.timestamp.toDate().toISOString();
    }
    return { id: doc.id, ...data } as ActivityLog;
};

export const getActivities = async (activityLimit: number = 20): Promise<ActivityLog[]> => {
    const cachedData = getFromCache('activities_limit_100');
    if(cachedData) return cachedData;
    
    const q = query(collections.activities, orderBy('timestamp', 'desc'), limit(activityLimit));
    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(convertActivityLogDoc);
    setInCache('activities_limit_100', activities);
    return activities;
};


export const getPaymentActivities = async (paymentId: string, activityLimit: number = 50): Promise<ActivityLog[]> => {
    if (!paymentId) return [];

    const q = query(
        collections.activities,
        where('entityType', '==', 'payment'),
        where('entityId', '==', paymentId),
        orderBy('timestamp', 'desc'),
        limit(activityLimit),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertActivityLogDoc);
};


export const getActivitiesForEntity = async (entityId: string): Promise<ActivityLog[]> => {
    const clientRef = doc(db, 'clients', entityId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) return [];
    
    const clientOwnerId = clientSnap.data().ownerId;

    const directClientActivitiesQuery = query(
        collections.activities, 
        where('entityId', '==', entityId),
        where('entityType', '==', 'client')
    );

    const oppsOfClientSnap = await getDocs(query(collections.opportunities, where('clientId', '==', entityId)));
    const oppIds = oppsOfClientSnap.docs.map(doc => doc.id);

    const activities: ActivityLog[] = [];

    const directClientActivitiesSnap = await getDocs(directClientActivitiesQuery);
    directClientActivitiesSnap.forEach(doc => {
        activities.push(convertActivityLogDoc(doc));
    });
    
    if (oppIds.length > 0) {
        const oppActivitiesQuery = query(
            collections.activities, 
            where('entityType', '==', 'opportunity'), 
            where('entityId', 'in', oppIds)
        );
        const oppActivitiesSnap = await getDocs(oppActivitiesQuery);
        oppActivitiesSnap.forEach(doc => {
            activities.push(convertActivityLogDoc(doc));
        });
    }
    
    const peopleSnap = await getDocs(query(collections.people, where('clientIds', 'array-contains', entityId)));
    const personIds = peopleSnap.docs.map(p => p.id);
    if (personIds.length > 0) {
        const personActivitiesQuery = query(
            collections.activities, 
            where('entityType', '==', 'person'), 
            where('entityId', 'in', personIds)
        );
         const personActivitiesSnap = await getDocs(personActivitiesQuery);
         personActivitiesSnap.forEach(doc => {
            activities.push(convertActivityLogDoc(doc));
        });
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return activities;
  };

const convertActivityDoc = (doc: any): ClientActivity => {
    const data = doc.data();
    
    const activity: ClientActivity = {
        id: doc.id,
        ...data,
        timestamp: (data.timestamp as Timestamp).toDate().toISOString(),
    };

    if (data.dueDate && data.dueDate instanceof Timestamp) {
        activity.dueDate = data.dueDate.toDate().toISOString();
    }
    
    if (data.completedAt && data.completedAt instanceof Timestamp) {
        activity.completedAt = data.completedAt.toDate().toISOString();
    }

    return activity;
}


export const getClientActivities = async (clientId: string): Promise<ClientActivity[]> => {
    const { getClientActivities } = await import('@/lib/api/clients');
    return getClientActivities(clientId);
};

export const getAllClientActivities = async (): Promise<ClientActivity[]> => {
    const cachedData = getFromCache('client_activities');
    if (cachedData) return cachedData;

    const { getAllClientActivities } = await import('@/lib/api/client-activities');
    const activities = await getAllClientActivities();
    setInCache('client_activities', activities);
    return activities;
};


export const createClientActivity = async (
    activityData: Omit<ClientActivity, 'id' | 'timestamp'>
): Promise<string> => {
    const { createClientActivity } = await import('@/lib/api/client-activities');
    const id = await createClientActivity(activityData);
    invalidateCache('client_activities');
    if (activityData.userId && activityData.userName) {
        try {
            const entityType = activityData.clientId ? 'client' : 'prospect';
            const entityId = activityData.clientId || activityData.prospectId || '';
            const entityName = activityData.clientName || activityData.prospectName || '';
            if (entityId) {
                await autoUpdateCoachingSession(activityData.userId, activityData.userName, entityType, entityId, entityName, `Actividad (${activityData.type}): ${activityData.observation}`);
            }
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }
    return id;
};

export const updateClientActivity = async (
    id: string,
    data: Partial<Omit<ClientActivity, 'id'>>
): Promise<void> => {
    const { updateClientActivity } = await import('@/lib/api/client-activities');
    await updateClientActivity(id, data);
    invalidateCache('client_activities');
};
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

export const getOpenCoachingSession = async (advisorId: string): Promise<CoachingSession | null> => {
    const cacheKey = `open_session_${advisorId}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached as CoachingSession;

    // Si no está en caché, buscamos solo las últimas 5 para no consumir lecturas masivas
    const q = query(
        collections.coachingSessions, 
        where('advisorId', '==', advisorId),
        orderBy('date', 'desc'),
        limit(5)
    );
    const snapshot = await getDocs(q);
    
    let openSession = null;
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.status === 'Open') {
            openSession = { 
                id: docSnap.id, 
                ...data,
                createdAt: timestampToISO(data.createdAt) || new Date().toISOString(),
            } as CoachingSession;
            break;
        }
    }
    
    if (openSession) setInCache(cacheKey, openSession);
    return openSession;
};

const getCoachingEntityKey = (entityType: 'client' | 'prospect', entityId: string) => `${entityType}_${entityId}`;

const getCoachingActiveIndexRef = (advisorId: string) => doc(db, 'coaching_active_index', advisorId);

const buildCoachingActiveIndex = (session: CoachingSession): CoachingActiveIndex => {
    const entities = session.status === 'Open' ? (session.items || []).reduce((acc, item) => {
        if (
            (item.entityType === 'client' || item.entityType === 'prospect') &&
            item.entityId &&
            item.status !== 'Cancelado'
        ) {
            acc[getCoachingEntityKey(item.entityType, item.entityId)] = {
                entityType: item.entityType,
                entityId: item.entityId,
                entityName: item.entityName,
                sessionId: session.id,
                itemId: item.id,
                status: item.status,
                lastUpdate: item.lastUpdate || item.originalCreatedAt,
            };
        }
        return acc;
    }, {} as Record<string, CoachingActiveIndexEntry>) : {};

    return {
        advisorId: session.advisorId,
        advisorName: session.advisorName,
        openSessionId: session.status === 'Open' ? session.id : undefined,
        updatedAt: new Date().toISOString(),
        entities,
    };
};

const getCoachingActiveIndex = async (advisorId: string): Promise<CoachingActiveIndex | null> => {
    const cacheKey = `coaching_active_index_${advisorId}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached as CoachingActiveIndex;

    const indexSnap = await getDoc(getCoachingActiveIndexRef(advisorId));
    if (!indexSnap.exists()) return null;

    const index = indexSnap.data() as CoachingActiveIndex;
    setInCache(cacheKey, index);
    return index;
};

const saveCoachingActiveIndex = async (index: CoachingActiveIndex) => {
    const cacheIndex = { ...index, updatedAt: new Date().toISOString() };
    const payload: Record<string, unknown> = {
        advisorId: index.advisorId,
        entities: index.entities || {},
        updatedAt: serverTimestamp(),
    };

    if (index.advisorName) payload.advisorName = index.advisorName;
    payload.openSessionId = index.openSessionId || deleteField();

    await setDoc(getCoachingActiveIndexRef(index.advisorId), payload, { merge: true });
    setInCache(`coaching_active_index_${index.advisorId}`, cacheIndex);
};

const syncCoachingActiveIndexFromSession = async (session: CoachingSession) => {
    await saveCoachingActiveIndex(buildCoachingActiveIndex(session));
};

export const createCoachingSession = async (
    sessionData: Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
    userId: string, 
    userName: string
): Promise<string> => {
    const preparedItems = sessionData.items.map(item => ({
        ...item,
        id: item.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
        taskId: item.taskId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
        originalCreatedAt: item.originalCreatedAt || new Date().toISOString()
    }));

    const docRef = await addDoc(collections.coachingSessions, {
        ...sessionData,
        status: 'Open',
        createdAt: serverTimestamp(),
        items: preparedItems
    });
    
    // 🟢 LIMPIAMOS EL CACHÉ AL CREAR UNA NUEVA
    invalidateCache(`open_session_${sessionData.advisorId}`);
    await syncCoachingActiveIndexFromSession({
        ...sessionData,
        id: docRef.id,
        status: 'Open',
        createdAt: new Date().toISOString(),
        items: preparedItems,
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
    const sessionSnap = await getDoc(docRef);
    await deleteDoc(docRef);
    
    invalidateCache(); // Limpieza global por seguridad
    if (sessionSnap.exists()) {
        await syncCoachingActiveIndexFromSession({
            id: sessionSnap.id,
            ...(sessionSnap.data() as CoachingSession),
            status: 'Closed',
            items: [],
        });
    }

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
    const sessionSnap = await getDoc(docRef);
    await updateDoc(docRef, data);
    
    // 🟢 Limpiamos caché de sesión abierta si se cierra
    if (sessionSnap.exists()) {
        const previousSession = { id: sessionSnap.id, ...sessionSnap.data() } as CoachingSession;
        const updatedSession = { ...previousSession, ...data };
        invalidateCache(`open_session_${updatedSession.advisorId}`);
        await syncCoachingActiveIndexFromSession(updatedSession);
    } else {
        invalidateCache();
    }
};

export const updateCoachingItem = async (
    sessionId: string,
    itemId: string,
    updates: Partial<Pick<CoachingItem, 'status' | 'advisorNotes' | 'followUpDone' | 'followUpDoneUpdatedAt' | 'followUpCurrent' | 'followUpCurrentUpdatedAt' | 'followUpNext' | 'followUpNextUpdatedAt'>>,
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
    if (sessionData.status === 'Open') {
        setInCache(`open_session_${sessionData.advisorId}`, {
            ...sessionData,
            id: sessionId,
            items: updatedItems,
        });
    }
    await syncCoachingActiveIndexFromSession({
        ...sessionData,
        id: sessionId,
        items: updatedItems,
    });

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

export const appendCoachingFollowUpEntry = async (
    sessionId: string,
    itemId: string,
    field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
    text: string,
    userId: string,
    userName: string,
): Promise<CoachingFollowUpEntry | null> => {
    const trimmedText = text.trim();
    if (!trimmedText) return null;

    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    let sessionForIndex: CoachingSession | null = null;
    let createdEntry: CoachingFollowUpEntry | null = null;

    await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");

        const sessionData = sessionSnap.data() as CoachingSession;
        const now = new Date().toISOString();
        const entriesField = `${field}Entries` as 'followUpDoneEntries' | 'followUpCurrentEntries' | 'followUpNextEntries';
        const updatedAtField = `${field}UpdatedAt` as 'followUpDoneUpdatedAt' | 'followUpCurrentUpdatedAt' | 'followUpNextUpdatedAt';
        let itemFound = false;

        const updatedItems = sessionData.items.map(item => {
            if (item.id !== itemId) return item;
            itemFound = true;

            const entry = {
                id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                text: trimmedText,
                createdAt: now,
                createdById: userId,
                createdByName: userName,
            };
            createdEntry = entry;
            const previousEntries = item[entriesField] || [];

            return {
                ...item,
                [entriesField]: [...previousEntries, entry],
                [updatedAtField]: now,
                lastUpdate: now,
            };
        });

        if (!itemFound) throw new Error("Ítem de seguimiento no encontrado");
        transaction.update(sessionRef, { items: updatedItems });
        sessionForIndex = { ...sessionData, id: sessionId, items: updatedItems };
    });

    if (sessionForIndex) {
        if (sessionForIndex.status === 'Open') {
            setInCache(`open_session_${sessionForIndex.advisorId}`, sessionForIndex);
        }
        await syncCoachingActiveIndexFromSession(sessionForIndex);
    }
    return createdEntry;
};

export const updateCoachingFollowUpEntry = async (
    sessionId: string,
    itemId: string,
    field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
    entryId: string,
    text: string,
    userId: string,
    userName: string,
): Promise<void> => {
    const trimmedText = text.trim();
    if (!trimmedText) throw new Error("El asiento no puede quedar vacío");

    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    let sessionForIndex: CoachingSession | null = null;
    let advisorName = '';

    await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");

        const sessionData = sessionSnap.data() as CoachingSession;
        const now = new Date().toISOString();
        const entriesField = `${field}Entries` as 'followUpDoneEntries' | 'followUpCurrentEntries' | 'followUpNextEntries';
        const updatedAtField = `${field}UpdatedAt` as 'followUpDoneUpdatedAt' | 'followUpCurrentUpdatedAt' | 'followUpNextUpdatedAt';
        let entryFound = false;

        const updatedItems = sessionData.items.map(item => {
            if (item.id !== itemId) return item;
            const entries = (item[entriesField] || []).map(entry => {
                if (entry.id !== entryId) return entry;
                entryFound = true;
                return {
                    ...entry,
                    text: trimmedText,
                    updatedAt: now,
                    updatedById: userId,
                    updatedByName: userName,
                };
            });
            return {
                ...item,
                [entriesField]: entries,
                [updatedAtField]: now,
                lastUpdate: now,
            };
        });

        if (!entryFound) throw new Error("Asiento de seguimiento no encontrado");
        transaction.update(sessionRef, { items: updatedItems });
        advisorName = sessionData.advisorName;
        sessionForIndex = { ...sessionData, id: sessionId, items: updatedItems };
    });

    if (sessionForIndex) {
        if (sessionForIndex.status === 'Open') {
            setInCache(`open_session_${sessionForIndex.advisorId}`, sessionForIndex);
        }
        await syncCoachingActiveIndexFromSession(sessionForIndex);
    }
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'user',
        entityId: sessionId,
        entityName: 'Bitácora de seguimiento',
        details: `editó un asiento de seguimiento.`,
        ownerName: advisorName,
    });
};

export const deleteCoachingFollowUpEntry = async (
    sessionId: string,
    itemId: string,
    field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
    entryId: string,
    userId: string,
    userName: string,
): Promise<void> => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    let sessionForIndex: CoachingSession | null = null;
    let advisorName = '';

    await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");

        const sessionData = sessionSnap.data() as CoachingSession;
        const now = new Date().toISOString();
        const entriesField = `${field}Entries` as 'followUpDoneEntries' | 'followUpCurrentEntries' | 'followUpNextEntries';
        const updatedAtField = `${field}UpdatedAt` as 'followUpDoneUpdatedAt' | 'followUpCurrentUpdatedAt' | 'followUpNextUpdatedAt';
        let entryFound = false;

        const updatedItems = sessionData.items.map(item => {
            if (item.id !== itemId) return item;
            const previousEntries = item[entriesField] || [];
            const entries = previousEntries.filter(entry => entry.id !== entryId);
            entryFound = entries.length !== previousEntries.length;
            return {
                ...item,
                [entriesField]: entries,
                [updatedAtField]: now,
                lastUpdate: now,
            };
        });

        if (!entryFound) throw new Error("Asiento de seguimiento no encontrado");
        transaction.update(sessionRef, { items: updatedItems });
        advisorName = sessionData.advisorName;
        sessionForIndex = { ...sessionData, id: sessionId, items: updatedItems };
    });

    if (sessionForIndex) {
        if (sessionForIndex.status === 'Open') {
            setInCache(`open_session_${sessionForIndex.advisorId}`, sessionForIndex);
        }
        await syncCoachingActiveIndexFromSession(sessionForIndex);
    }
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'user',
        entityId: sessionId,
        entityName: 'Bitácora de seguimiento',
        details: `eliminó un asiento de seguimiento.`,
        ownerName: advisorName,
    });
};

export const deleteCoachingItem = async (sessionId: string, itemId: string) => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");
    
    const sessionData = sessionSnap.data() as CoachingSession;
    const updatedItems = sessionData.items.filter(item => item.id !== itemId);

    await updateDoc(sessionRef, { items: updatedItems });
    if (sessionData.status === 'Open') {
        setInCache(`open_session_${sessionData.advisorId}`, {
            ...sessionData,
            id: sessionId,
            items: updatedItems,
        });
    }
    await syncCoachingActiveIndexFromSession({
        ...sessionData,
        id: sessionId,
        items: updatedItems,
    });
};

export const addItemsToSession = async (sessionId: string, newItems: CoachingItem[]) => {
    const sessionRef = doc(db, 'coaching_sessions', sessionId);
    let sessionForIndex: CoachingSession | null = null;
    
    await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (!sessionSnap.exists()) throw new Error("Sesión no encontrada");
        
        const sessionData = sessionSnap.data() as CoachingSession;
        let currentItems = [...sessionData.items];
        let hasChanges = false;

        newItems.forEach(newItem => {
            // Buscamos si ya existe un item para esta misma entidad que esté abierto ('Pendiente' o 'En Proceso')
            const existingItemIndex = currentItems.findIndex(i => 
                i.entityId === newItem.entityId && 
                i.status !== 'Cancelado'
            );

            if (existingItemIndex >= 0) {
                // El ítem ya existe y está activo: agregamos una indicación o un asiento independiente.
                const existingItem = currentItems[existingItemIndex];
                const now = new Date().toISOString();
                const newEntry = {
                    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                    text: newItem.action,
                    createdAt: now,
                    createdById: sessionData.advisorId,
                    createdByName: sessionData.advisorName,
                };
                
                currentItems[existingItemIndex] = {
                    ...existingItem,
                    action: newItem.origin === 'manager' 
                        ? (existingItem.action ? `${existingItem.action}\n\n${newItem.action}` : newItem.action)
                        : existingItem.action,
                    followUpDoneEntries: newItem.origin === 'advisor'
                        ? [...(existingItem.followUpDoneEntries || []), newEntry]
                        : existingItem.followUpDoneEntries,
                    followUpDoneUpdatedAt: newItem.origin === 'advisor' ? now : existingItem.followUpDoneUpdatedAt,
                    lastUpdate: now,
                };
                hasChanges = true;
            } else {
                // No existe un ítem abierto para esta entidad, lo creamos como nuevo.
                currentItems.push({
                    ...newItem, 
                    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                    taskId: newItem.taskId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
                    originalCreatedAt: newItem.originalCreatedAt || new Date().toISOString()
                });
                hasChanges = true;
            }
        });

        if (hasChanges) {
            transaction.update(sessionRef, { items: currentItems });
            sessionForIndex = {
                ...sessionData,
                id: sessionId,
                items: currentItems,
            };
        }
    });

    if (sessionForIndex) {
        if (sessionForIndex.status === 'Open') {
            setInCache(`open_session_${sessionForIndex.advisorId}`, sessionForIndex);
        }
        await syncCoachingActiveIndexFromSession(sessionForIndex);
    }
};

export const claimProspect = async (prospect: Prospect, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', prospect.id);
    await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists()) throw new Error("El prospecto ya no existe.");

        const currentProspect = { id: snapshot.id, ...snapshot.data() } as Prospect;
        if (currentProspect.ownerId) {
            throw new Error("El prospecto ya fue asignado a otro asesor.");
        }
        if (currentProspect.claimStatus === 'Pendiente') {
            throw new Error(
                currentProspect.claimantId === userId
                    ? "Tu reclamo ya está pendiente de aprobación."
                    : "Otro asesor ya reclamó este prospecto."
            );
        }

        if (currentProspect.previousOwnerId === userId && currentProspect.unassignedAt) {
            const rawUnassignedAt = currentProspect.unassignedAt as any;
            const unassignedDate = typeof rawUnassignedAt === 'string'
                ? parseISO(rawUnassignedAt)
                : rawUnassignedAt?.toDate?.();
            if (unassignedDate) {
                const daysPassed = differenceInCalendarDays(new Date(), unassignedDate);
                if (daysPassed < 3) {
                    throw new Error(`Debes esperar ${3 - daysPassed} días más para volver a reclamar este prospecto.`);
                }
            }
        }

        transaction.update(docRef, {
            claimStatus: 'Pendiente',
            claimantId: userId,
            claimantName: userName,
            claimedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
    
    invalidateCache('prospects');

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: prospect.id,
        entityName: prospect.companyName,
        details: `solicitó reclamar el prospecto <strong>${prospect.companyName}</strong>`,
        ownerName: 'Sin Asignar'
    });
};

export const approveProspectClaim = async (prospect: Prospect, managerId: string, managerName: string): Promise<void> => {
    if (!prospect.claimantId || !prospect.claimantName) throw new Error("No hay reclamante válido.");

    const docRef = doc(db, 'prospects', prospect.id);
    
    await updateDoc(docRef, {
        ownerId: prospect.claimantId,
        ownerName: prospect.claimantName,
        status: 'Nuevo', 
        statusChangedAt: serverTimestamp(),
        
        // Limpiar campos de reclamo
        claimStatus: deleteField(),
        claimantId: deleteField(),
        claimantName: deleteField(),
        claimedAt: deleteField(),
        
        updatedAt: serverTimestamp()
    });
    
    invalidateCache('prospects');

    await logActivity({
        userId: managerId,
        userName: managerName,
        type: 'update',
        entityType: 'prospect',
        entityId: prospect.id,
        entityName: prospect.companyName,
        details: `aprobó el reclamo y asignó el prospecto a <strong>${prospect.claimantName}</strong>`,
        ownerName: prospect.claimantName
    });
};

export const rejectProspectClaim = async (prospect: Prospect, managerId: string, managerName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', prospect.id);
    
    await updateDoc(docRef, {
        claimStatus: deleteField(),
        claimantId: deleteField(),
        claimantName: deleteField(),
        claimedAt: deleteField(),
        updatedAt: serverTimestamp()
    });
    
    invalidateCache('prospects');

    await logActivity({
        userId: managerId,
        userName: managerName,
        type: 'update',
        entityType: 'prospect',
        entityId: prospect.id,
        entityName: prospect.companyName,
        details: `rechazó la solicitud de reclamo de <strong>${prospect.claimantName}</strong>`,
        ownerName: 'Sin Asignar'
    });
};

export const createAdvertisingOrder = async (orderData: Omit<AdvertisingOrder, 'id' | 'createdAt'>) => {
  try {
    const { billingRequestsSrl, billingRequestsSas, billingRequestsAvion, ...restOrderData } = orderData as typeof orderData & { billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[] };
    const docRef = await addDoc(collection(db, 'advertising_orders'), {
      ...restOrderData,
      createdAt: new Date().toISOString(),
    });
    
    const batch = writeBatch(db);
    let hasBilling = false;

    // 🟢 Guardar Fechas de Facturación SRL
    if (billingRequestsSrl && billingRequestsSrl.length > 0) {
        hasBilling = true;
        billingRequestsSrl.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: docRef.id,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'SRL',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                amount: br.amount,
                paymentType: br.paymentType || 'Se paga',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    // 🟢 Guardar Fechas de Facturación SAS
    if (billingRequestsSas && billingRequestsSas.length > 0) {
        hasBilling = true;
        billingRequestsSas.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: docRef.id,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'SAS',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                ivaSas: br.ivaSas,
                amount: br.amount,
                paymentType: br.paymentType || 'Se paga',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    if (billingRequestsAvion && billingRequestsAvion.length > 0) {
        hasBilling = true;
        billingRequestsAvion.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: docRef.id,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'AVION',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                amount: br.amount,
                paymentType: br.paymentType || 'Canje',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    if (hasBilling) {
        await batch.commit();
    }

    if (restOrderData.canjeId) {
        await updateDoc(doc(db, 'canjes', restOrderData.canjeId), {
            advertisingOrderIds: arrayUnion(docRef.id),
        });
        invalidateCache('canjes');
    }

    await logActivity({
      userId: restOrderData.createdBy, 
      userName: restOrderData.accountExecutive,
      entityType: 'client',
      entityId: restOrderData.clientId,
      entityName: restOrderData.clientName || 'Cliente',
      type: 'create', 
      details: `Creó un nuevo pedido de publicidad para el producto: ${restOrderData.product}`,
      timestamp: new Date().toISOString(),
    });

    return docRef.id;
  } catch (error) {
    console.error("Error creating advertising order:", error);
    throw error;
  }
};

export const getBillingRequestsByClient = async (clientId: string): Promise<BillingRequest[]> => {
    try {
        const { getBillingRequestsByClient } = await import('@/lib/api/clients');
        return getBillingRequestsByClient(clientId);
    } catch (e) {
        console.error(e);
        return [];
    }
};
export const getBillingRequestsByOrder = async (orderId: string) => {
    try {
        const { getBillingRequestsByOrder } = await import('@/lib/api/billing-requests');
        return getBillingRequestsByOrder(orderId);
    } catch (e) {
        console.error(e);
        return [];
    }
};

export const updateMonthlyBillingStat = async (
    monthKey: string, // Ej: "2026-04"
    amountToAdd: number, 
    advisorId: string
) => {
    // Creamos una referencia al documento de estadísticas de ese mes específico
    const statsRef = doc(db, 'estadisticas_mensuales', monthKey);
    
    // Usamos merge: true e increment() para sumar el valor al total existente
    // Si el documento no existe, Firebase lo crea automáticamente.
    await setDoc(statsRef, {
        totalGeneral: increment(amountToAdd),
        [`total_asesor_${advisorId}`]: increment(amountToAdd),
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const getAdvertisingOrdersByOpportunity = async (opportunityId: string): Promise<AdvertisingOrder[]> => {
    try {
        const { getAdvertisingOrdersByOpportunity } = await import('@/lib/api/advertising-orders');
        return getAdvertisingOrdersByOpportunity(opportunityId);
    } catch (error) {
        console.error("Error fetching ad orders:", error);
        return [];
    }
};

export const getAdvertisingOrdersByClientId = async (clientId: string): Promise<AdvertisingOrder[]> => {
    try {
        if (!clientId) return [];
        const { getAdvertisingOrdersByClientId } = await import('@/lib/api/clients');
        return getAdvertisingOrdersByClientId(clientId);
    } catch (error) {
        console.error("Error fetching ad orders by client:", error);
        return [];
    }
};

export const getAdvertisingOrdersWithEvent = async (): Promise<AdvertisingOrder[]> => {
    const { getAdvertisingOrdersWithEvent } = await import('@/lib/api/advertising-orders');
    return getAdvertisingOrdersWithEvent();
};

export const getAdvertisingOrder = async (id: string): Promise<AdvertisingOrder | null> => {
    try {
        const { getAdvertisingOrder } = await import('@/lib/api/advertising-orders');
        return getAdvertisingOrder(id);
    } catch (error) {
        console.error("Error fetching ad order:", error);
        return null;
    }
};

export const deleteAdvertisingOrder = async (id: string, userId: string, userName: string, clientName: string): Promise<void> => {
    try {
        const { deleteAdvertisingOrder } = await import('@/lib/api/advertising-orders');
        await deleteAdvertisingOrder(id);
    } catch (error) {
        console.error("Error deleting ad order:", error);
        throw error;
    }
};

export const getRecentAdvertisingOrders = async (): Promise<AdvertisingOrder[]> => {
    try {
        const { getRecentAdvertisingOrders } = await import('@/lib/api/advertising-orders');
        return getRecentAdvertisingOrders();
    } catch (error) {
        console.error("Error fetching recent ad orders:", error);
        return [];
    }
};

export const getAdvertisingOrdersForDateRange = async (rangeStart: Date, rangeEnd: Date): Promise<AdvertisingOrder[]> => {
    try {
        const { getAdvertisingOrdersForDateRange } = await import('@/lib/api/advertising-orders');
        return getAdvertisingOrdersForDateRange(rangeStart, rangeEnd);
    } catch (error) {
        console.error('Error fetching advertising orders by date range:', error);
        return [];
    }
};

export const updateAdvertisingOrder = async (
    orderId: string,
    orderData: Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>>,
    userId: string,
    userName: string,
    options?: {
        modificationReason?: string;
        userRole?: string;
        historyItem?: ApprovalHistoryItem;
    }
): Promise<void> => {
    const shouldReplaceBilling = ['billingRequestsSrl', 'billingRequestsSas', 'billingRequestsAvion']
        .some(field => Object.prototype.hasOwnProperty.call(orderData, field));
    const {
        billingRequestsSrl,
        billingRequestsSas,
        billingRequestsAvion,
        approvalHistory: _ignoredApprovalHistory,
        revisionHistory: _ignoredRevisionHistory,
        ...restOrderData
    } = orderData as typeof orderData & { billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[] };
    const docRef = doc(db, 'advertising_orders', orderId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Orden no encontrada");
    const previousOrder = { id: docSnap.id, ...docSnap.data() } as AdvertisingOrder;
    const existingBrQuery = query(collections.billingRequests, where('orderId', '==', orderId));
    const existingBrSnap = await getDocs(existingBrQuery);
    const previousBillingSrl: AdvertisingOrder['billingRequestsSrl'] = [];
    const previousBillingSas: AdvertisingOrder['billingRequestsSas'] = [];
    const previousBillingAvion: AdvertisingOrder['billingRequestsAvion'] = [];

    existingBrSnap.forEach(billingDoc => {
        const billing = billingDoc.data() as BillingRequest;
        const comparable = {
            date: billing.date,
            grossAmount: billing.grossAmount || 0,
            adjustment: billing.adjustment || 0,
            ivaSas: billing.ivaSas || 0,
            amount: billing.amount || 0,
            paymentType: billing.paymentType || (billing.company === 'AVION' ? 'Canje' : 'Se paga'),
            canjeDescription: billing.canjeDescription || '',
        };
        if (billing.company === 'SRL') previousBillingSrl.push(comparable);
        else if (billing.company === 'SAS') previousBillingSas.push(comparable);
        else if (billing.company === 'AVION') previousBillingAvion.push(comparable);
    });

    const wasEverApproved = previousOrder.status === 'Aprobado'
        || (previousOrder.approvalHistory || []).some(item => item.status === 'Aprobado');
    const updatePayload: Record<string, unknown> = {
        ...restOrderData,
        updatedAt: serverTimestamp(),
    };

    if (options?.historyItem) {
        updatePayload.approvalHistory = arrayUnion(options.historyItem);
    }

    if (wasEverApproved) {
        const reason = options?.modificationReason?.trim();
        if (!reason) {
            throw new Error('Debe indicar el motivo de la modificación de una orden aprobada.');
        }

        const previousComparableOrder = {
            ...previousOrder,
            billingRequestsSrl: previousBillingSrl,
            billingRequestsSas: previousBillingSas,
            billingRequestsAvion: previousBillingAvion,
        };
        const nextComparableOrder = {
            ...previousOrder,
            ...restOrderData,
            billingRequestsSrl: shouldReplaceBilling ? (billingRequestsSrl || []) : previousBillingSrl,
            billingRequestsSas: shouldReplaceBilling ? (billingRequestsSas || []) : previousBillingSas,
            billingRequestsAvion: shouldReplaceBilling ? (billingRequestsAvion || []) : previousBillingAvion,
        };
        const changes = buildAdvertisingOrderChanges(previousComparableOrder, nextComparableOrder);

        if (changes.length === 0) {
            throw new Error('No se detectaron cambios para registrar en la orden.');
        }

        updatePayload.status = 'Pendiente de Modificación';
        updatePayload.adminComments = deleteField();
        updatePayload.approvedAt = deleteField();
        updatePayload.approvedBy = deleteField();
        updatePayload.approvedByName = deleteField();
        updatePayload.revisionHistory = arrayUnion({
            timestamp: new Date().toISOString(),
            userId,
            userName,
            userRole: options?.userRole || '',
            reason,
            previousStatus: previousOrder.status || 'Aprobado',
            changes,
            financials: {
                before: getAdvertisingOrderFinancialSummary(previousComparableOrder),
                after: getAdvertisingOrderFinancialSummary(nextComparableOrder),
            },
            schedule: {
                before: {
                    startDate: previousComparableOrder.startDate,
                    endDate: previousComparableOrder.endDate,
                    srlItems: previousComparableOrder.srlItems || [],
                    sasItems: previousComparableOrder.sasItems || [],
                },
                after: {
                    startDate: nextComparableOrder.startDate,
                    endDate: nextComparableOrder.endDate,
                    srlItems: nextComparableOrder.srlItems || [],
                    sasItems: nextComparableOrder.sasItems || [],
                },
            },
        });
    }

    const batch = writeBatch(db);
    batch.update(docRef, updatePayload);
    if (shouldReplaceBilling) {
        existingBrSnap.forEach(doc => batch.delete(doc.ref));
    }

    if (shouldReplaceBilling && billingRequestsSrl && billingRequestsSrl.length > 0) {
        billingRequestsSrl.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: orderId,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'SRL',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                amount: br.amount,
                paymentType: br.paymentType || 'Se paga',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    if (shouldReplaceBilling && billingRequestsSas && billingRequestsSas.length > 0) {
        billingRequestsSas.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: orderId,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'SAS',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                ivaSas: br.ivaSas,
                amount: br.amount,
                paymentType: br.paymentType || 'Se paga',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    if (shouldReplaceBilling && billingRequestsAvion && billingRequestsAvion.length > 0) {
        billingRequestsAvion.forEach(br => {
            const brRef = doc(collections.billingRequests);
            batch.set(brRef, {
                orderId: orderId,
                opportunityId: restOrderData.opportunityId || '',
                clientId: restOrderData.clientId,
                company: 'AVION',
                date: br.date,
                grossAmount: br.grossAmount,
                adjustment: br.adjustment,
                amount: br.amount,
                paymentType: br.paymentType || 'Canje',
                canjeDescription: br.canjeDescription || '',
                createdAt: serverTimestamp()
            });
        });
    }

    await batch.commit();

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'opportunity' as any,
        entityId: orderId,
        entityName: 'Orden de Publicidad',
        details: `editó la orden de publicidad del cliente <strong>${restOrderData.clientName}</strong>`,
        ownerName: restOrderData.accountExecutive || userName // Se loguea al dueño real de la orden
    });
};

// --- Social Media Requests Functions ---

export const saveSocialMediaRequest = async (
    requestData: Omit<SocialMediaRequest, 'id' | 'createdAt'>,
    userId: string,
    userName: string
): Promise<string> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    const id = await socialMediaApi.saveSocialMediaRequest(requestData);
    invalidateCache('socialMediaRequests');
    return id;
};

export const getSocialMediaRequests = async (): Promise<SocialMediaRequest[]> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    const requests = await socialMediaApi.getSocialMediaRequests();
    setInCache('socialMediaRequests', requests);
    return requests;
};

export const getSocialMediaRequestsByOrderId = async (orderId: string): Promise<SocialMediaRequest[]> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    return socialMediaApi.getSocialMediaRequestsByOrderId(orderId);
};

export const getSocialMediaRequestsByClientId = async (clientId: string): Promise<SocialMediaRequest[]> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    return socialMediaApi.getSocialMediaRequestsByClientId(clientId);
};

export const linkSocialMediaRequestToOrder = async (
    requestId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    await socialMediaApi.linkSocialMediaRequestToOrder(requestId, orderId, orderTitle);
    invalidateCache('socialMediaRequests');
};

export const unlinkSocialMediaRequestFromOrder = async (
    requestId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    await socialMediaApi.unlinkSocialMediaRequestFromOrder(requestId, reason);
    invalidateCache('socialMediaRequests');
};

export const getSocialMediaRequest = async (id: string): Promise<SocialMediaRequest | null> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    return socialMediaApi.getSocialMediaRequest(id);
};

export const updateSocialMediaRequest = async (
    id: string,
    data: Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    await socialMediaApi.updateSocialMediaRequest(id, data);
    invalidateCache('socialMediaRequests');
};

export const deleteSocialMediaRequest = async (id: string, userId: string, userName: string): Promise<void> => {
    const socialMediaApi = await import('@/lib/api/social-media-requests');
    await socialMediaApi.deleteSocialMediaRequest(id);
    invalidateCache('socialMediaRequests');
};
// --- Convenios de Canje (App Móvil) ---
export const saveConvenioCanje = async (
    convenioData: Omit<ConvenioCanje, 'id' | 'createdAt'>,
    userId: string,
    userName: string
): Promise<string> => {
    const dataToSave = {
        ...convenioData,
        createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collections.convenios, dataToSave);
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'canje' as any, // Lo asociamos genéricamente a canjes
        entityId: docRef.id,
        entityName: `Convenio: ${convenioData.clientName}`,
        details: `creó un nuevo Convenio de Canje para <strong>${convenioData.clientName}</strong>`,
        ownerName: userName,
    });

    return docRef.id;
};

// --- Gestión de Lista Blanca de Correos ---
export const getEmailWhitelist = async (): Promise<string[]> => {
    const { getEmailWhitelist } = await import('@/lib/api/system');
    return getEmailWhitelist();
};

export const updateEmailWhitelist = async (emails: string[], userId: string, userName: string): Promise<void> => {
    const { updateEmailWhitelist } = await import('@/lib/api/system');
    await updateEmailWhitelist(emails);
};
// --- Obtener Convenios de Canje (Nueva Modalidad) ---
export const getConveniosCanje = async (): Promise<ConvenioCanje[]> => {
    const cachedData = getFromCache('convenios_canje');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.convenios, orderBy("createdAt", "desc")));
    const convenios = snapshot.docs.map(doc => {
        const data = doc.data();
        const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
        
        return { 
            id: doc.id,
            ...data,
            createdAt: convertTimestamp(data.createdAt),
            updatedAt: convertTimestamp(data.updatedAt),
        } as ConvenioCanje;
    });
    
    setInCache('convenios_canje', convenios);
    return convenios;
};

export const getOpportunityById = async (id: string): Promise<Opportunity | null> => {
    const docRef = doc(db, 'opportunities', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return mapOpportunityDoc(snap); // Usamos la misma función de mapeo interno
    }
    return null;
};

export const updateConvenioCanje = async (
    id: string, 
    data: Partial<Omit<ConvenioCanje, 'id' | 'createdAt'>>, 
    userId: string, 
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'convenios', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('convenios_canje');
    
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'canje' as any,
        entityId: id,
        entityName: data.clientName || 'Convenio de Canje',
        details: `actualizó un Convenio de Canje para <strong>${data.clientName || 'Cliente'}</strong>`,
        ownerName: userName,
    });
};

export const deleteConvenioCanje = async (
    canjeId: string, 
    oppId: string, 
    userId: string, 
    userName: string
): Promise<void> => {
    const batch = writeBatch(db);
    
    // 1. Borrar Convenio
    batch.delete(doc(db, 'convenios', canjeId));
    
    // 2. Borrar Oportunidad y todo lo que cuelga de ella
    if (oppId) {
        batch.delete(doc(db, 'opportunities', oppId));
        
        const adQ = query(collection(db, 'advertising_orders'), where('opportunityId', '==', oppId));
        const adSnap = await getDocs(adQ);
        adSnap.forEach(d => batch.delete(d.ref));
        
        const invQ = query(collections.invoices, where('opportunityId', '==', oppId));
        const invSnap = await getDocs(invQ);
        invSnap.forEach(d => batch.delete(d.ref));
    }
    
    await batch.commit();
    invalidateCache('convenios_canje');
    invalidateCache('opportunities');
    invalidateCache('invoices');
    
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'canje' as any,
        entityId: canjeId,
        entityName: 'Convenio de Canje',
        details: `eliminó un Convenio de Canje y su Orden de Publicidad asociada`,
        ownerName: userName,
    });
};

export const migrateLegacyConveniosToCanjes = async (
    userId: string,
    userName: string,
): Promise<{ created: number; skipped: number }> => {
    const [convenios, existingCanjes] = await Promise.all([getConveniosCanje(), getCanjes()]);
    const existingConvenioIds = new Set(existingCanjes.map(canje => canje.convenioId).filter(Boolean));
    let created = 0;
    let skipped = 0;

    for (const convenio of convenios) {
        if (!convenio.id || existingConvenioIds.has(convenio.id) || convenio.masterCanjeId) {
            skipped += 1;
            continue;
        }

        const [opportunity, orders] = await Promise.all([
            getOpportunityById(convenio.opportunityId),
            getAdvertisingOrdersByOpportunity(convenio.opportunityId),
        ]);
        const value = Number(opportunity?.value || 0);
        const month = (convenio.fechaInicio || convenio.createdAt).slice(0, 7);
        const billingText = convenio.observaciones || '';
        const modalidad = billingText.includes('AVION') || billingText.includes('AVIÓN')
            ? 'AVION'
            : 'Factura contra factura';

        const masterCanjeId = await createCanje({
            titulo: opportunity?.title || `Canje ${convenio.clientName}`,
            clienteId: convenio.clientId,
            clienteName: convenio.clientName,
            asesorId: convenio.advisorId,
            asesorName: convenio.advisorName,
            pedido: convenio.clienteEntrega,
            necesidadOrganizacion: convenio.clienteEntrega,
            observaciones: convenio.radioEntrega,
            valorAsociado: value,
            valorCanje: value,
            valorAcordado: value,
            estado: 'En gestión',
            tipo: convenio.fechaInicio.slice(0, 7) === convenio.fechaFin.slice(0, 7) ? 'Una vez' : 'Mensual',
            modalidad,
            fechaInicio: convenio.fechaInicio,
            fechaFin: convenio.fechaFin,
            opportunityId: convenio.opportunityId,
            convenioId: convenio.id,
            advertisingOrderIds: orders.map(order => order.id).filter((id): id is string => Boolean(id)),
            migratedFromConvenio: true,
            historialMensual: [{
                mes: month,
                estado: 'En ejecución',
                fechaEstado: new Date().toISOString(),
                valorCanje: value,
                recepciones: [{
                    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                    descripcion: convenio.clienteEntrega,
                    valorTotal: value,
                    estado: 'Pendiente',
                }],
                ordenesPublicidad: orders.map(order => ({
                    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                    orderId: order.id,
                    descripcion: order.product || opportunity?.title || 'Orden de publicidad',
                    valorTotal: Number(order.totalOrder || value),
                })),
                facturasCliente: [],
                facturasAire: [],
            }],
        }, userId, userName);

        await updateConvenioCanje(convenio.id, { masterCanjeId }, userId, userName);
        created += 1;
    }

    invalidateCache('canjes');
    invalidateCache('convenios_canje');
    return { created, skipped };
};

// --- Mantenimiento Automático ---
export const autoUpdateCoachingSession = async (
    advisorId: string,
    advisorName: string,
    entityType: 'client' | 'prospect',
    entityId: string,
    entityName: string,
    actionText: string,
    options?: {
        createIfMissing?: boolean;
        cancelIfActive?: boolean;
        completeIfActive?: boolean;
        updateExistingIfMissing?: boolean;
    }
) => {
    if (!advisorId || !entityId) return;
    const isClosingLostOrUndefinedProposal = /Actualizaci.n de propuesta/i.test(actionText)
        && /Etapa:\s*Cerrado - (Perdido|No Definido)/i.test(actionText);
    const createIfMissing = options?.createIfMissing ?? !isClosingLostOrUndefinedProposal;
    const cancelIfActive = options?.cancelIfActive ?? isClosingLostOrUndefinedProposal;
    const completeIfActive = options?.completeIfActive ?? false;
    const updateExistingIfMissing = options?.updateExistingIfMissing ?? false;

    let activeIndex = await getCoachingActiveIndex(advisorId);
    let openSession: CoachingSession | null = null;

    if (activeIndex?.openSessionId) {
        const cachedSession = getFromCache(`open_session_${advisorId}`) as CoachingSession | null;
        if (cachedSession?.id === activeIndex.openSessionId) {
            openSession = cachedSession;
        } else {
            const sessionSnap = await getDoc(doc(db, 'coaching_sessions', activeIndex.openSessionId));
            if (sessionSnap.exists()) {
                const data = sessionSnap.data();
                openSession = {
                    id: sessionSnap.id,
                    ...data,
                    createdAt: timestampToISO(data.createdAt) || new Date().toISOString(),
                } as CoachingSession;
                setInCache(`open_session_${advisorId}`, openSession);
            }
        }
    }

    if (!openSession && createIfMissing) {
        openSession = await getOpenCoachingSession(advisorId);
        if (openSession) {
            await syncCoachingActiveIndexFromSession(openSession);
            activeIndex = buildCoachingActiveIndex(openSession);
        }
    }

    if (!openSession && createIfMissing) {
        const newSessionId = await createCoachingSession({
            advisorId,
            advisorName,
            managerId: advisorId,
            managerName: 'Sistema Automático',
            date: new Date().toISOString(),
            items: [],
            generalNotes: '',
        }, advisorId, 'Sistema');

        openSession = {
            id: newSessionId,
            advisorId,
            advisorName,
            managerId: advisorId,
            managerName: 'Sistema Automático',
            date: new Date().toISOString(),
            items: [],
            generalNotes: '',
            createdAt: new Date().toISOString(),
            status: 'Open',
        };
        activeIndex = buildCoachingActiveIndex(openSession);
    }

    const now = new Date().toISOString();
    const newEntry = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        text: actionText,
        createdAt: now,
        createdById: advisorId,
        createdByName: advisorName,
    };
    const entityKey = getCoachingEntityKey(entityType, entityId);
    const indexedItemId = activeIndex?.entities?.[entityKey]?.itemId;

    if (!openSession && updateExistingIfMissing) {
        const recentSessionsSnap = await getDocs(query(
            collections.coachingSessions,
            where('advisorId', '==', advisorId),
            orderBy('date', 'desc'),
            limit(20)
        ));

        for (const sessionDoc of recentSessionsSnap.docs) {
            const sessionData = sessionDoc.data() as CoachingSession;
            const itemIndex = (sessionData.items || []).findIndex(item => item.entityType === entityType && item.entityId === entityId);
            if (itemIndex < 0) continue;

            const updatedItems = [...(sessionData.items || [])];
            const existingItem = updatedItems[itemIndex];
            updatedItems[itemIndex] = {
                ...existingItem,
                entityName,
                followUpDoneEntries: [...(existingItem.followUpDoneEntries || []), newEntry],
                followUpDoneUpdatedAt: now,
                lastUpdate: now,
            };

            const updatedSession = { ...sessionData, id: sessionDoc.id, items: updatedItems };
            await updateDoc(doc(db, 'coaching_sessions', sessionDoc.id), { items: updatedItems });
            if (updatedSession.status === 'Open') {
                setInCache(`open_session_${advisorId}`, updatedSession);
                await syncCoachingActiveIndexFromSession(updatedSession);
            }
            return;
        }
    }

    if (!openSession) return;

    const updatedItems = [...(openSession.items || [])];
    const canUpdateClosedItem = updateExistingIfMissing && !createIfMissing;

    const existingItemIndex = updatedItems.findIndex(item =>
        (indexedItemId ? item.id === indexedItemId : item.entityId === entityId) &&
        (canUpdateClosedItem || item.status !== 'Cancelado')
    );

    if (existingItemIndex >= 0) {
        const existingItem = updatedItems[existingItemIndex];
        const shouldComplete = completeIfActive && existingItem.status !== 'Cancelado' && existingItem.status !== 'Completado';

        updatedItems[existingItemIndex] = {
            ...existingItem,
            entityName,
            status: cancelIfActive ? 'Cancelado' : shouldComplete ? 'Completado' : existingItem.status,
            followUpDoneEntries: [...(existingItem.followUpDoneEntries || []), newEntry],
            followUpDoneUpdatedAt: now,
            lastUpdate: now,
        };
    } else if (createIfMissing) {
        updatedItems.push({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
            taskId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
            originalCreatedAt: now,
            entityType,
            entityId,
            entityName,
            action: 'Seguimiento automático',
            status: 'Pendiente',
            advisorNotes: '',
            followUpDoneEntries: [newEntry],
            followUpDoneUpdatedAt: now,
            lastUpdate: now,
            origin: 'advisor',
        });
    } else {
        return;
    }

    const updatedSession = { ...openSession, items: updatedItems };
    await updateDoc(doc(db, 'coaching_sessions', openSession.id), { items: updatedItems });
    setInCache(`open_session_${advisorId}`, updatedSession);
    await syncCoachingActiveIndexFromSession(updatedSession);
};

export const cleanupOldActivities = async (): Promise<void> => {
    // Ejecutar solo 1 vez por día por navegador para no saturar
    const lastCleanup = typeof window !== 'undefined' ? localStorage.getItem('last_activity_cleanup') : null;
    const today = new Date().toISOString().split('T')[0];
    if (lastCleanup === today) return;

    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const q = query(
            collections.clientActivities,
            where('completed', '==', true),
            where('completedAt', '<', sixtyDaysAgo.toISOString()),
            limit(100) // Borramos de a tandas pequeñas para no agotar escrituras
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            if (typeof window !== 'undefined') localStorage.setItem('last_activity_cleanup', today);
            return;
        }

        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        if (typeof window !== 'undefined') localStorage.setItem('last_activity_cleanup', today);
        console.log(`[Mantenimiento] Se limpiaron ${snapshot.docs.length} actividades antiguas.`);
    } catch (e) {
        console.error("Error during cleanup of old activities:", e);
    }
};

// ============================================================================
// --- WEB NOTES / GACETILLAS FUNCTIONS ---
// ============================================================================

export const saveWebNote = async (
    noteData: Omit<WebNote, 'id' | 'createdAt'>,
    userId: string,
    userName: string
): Promise<string> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    const id = await webNotesApi.saveWebNote(noteData);
    invalidateCache('webNotes');
    return id;
};

export const getWebNotes = async (): Promise<WebNote[]> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    const notes = await webNotesApi.getWebNotes();
    setInCache('webNotes', notes);
    return notes;
};

export const getWebNotesByOrderId = async (orderId: string): Promise<WebNote[]> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    return webNotesApi.getWebNotesByOrderId(orderId);
};

export const getWebNotesByClientId = async (clientId: string): Promise<WebNote[]> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    return webNotesApi.getWebNotesByClientId(clientId);
};

export const linkWebNoteToOrder = async (
    noteId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    await webNotesApi.linkWebNoteToOrder(noteId, orderId, orderTitle);
    invalidateCache('webNotes');
};

export const unlinkWebNoteFromOrder = async (
    noteId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    await webNotesApi.unlinkWebNoteFromOrder(noteId, reason);
    invalidateCache('webNotes');
};

export const getWebNote = async (id: string): Promise<WebNote | null> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    return webNotesApi.getWebNote(id);
};

export const updateWebNote = async (
    id: string,
    data: Partial<Omit<WebNote, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    await webNotesApi.updateWebNote(id, data);
    invalidateCache('webNotes');
};

export const deleteWebNote = async (id: string, userId: string, userName: string): Promise<void> => {
    const webNotesApi = await import('@/lib/api/web-notes');
    await webNotesApi.deleteWebNote(id);
    invalidateCache('webNotes');
};
export const getReportDataForAdvisors = async (advisorIds: string[]): Promise<any[]> => {
    const allOpps = await getOpportunities();
    const allPayments = await getPendingPaymentEntries();
    const results = [];

    for (const id of advisorIds) {
        const user = await getUserById(id);
        if (!user) continue;

        const advisorOpps = allOpps.filter(o => {
            // Filtrar por dueño de cliente
            // Nota: Aquí dependemos de la carga previa de clients en el caché para velocidad
            const cachedClients = getFromCache('clients') as Client[];
            const client = cachedClients?.find(c => c.id === o.clientId);
            return client?.ownerId === id;
        });

        const advisorPayments = allPayments.filter(p => p.advisorId === id);
        const sessions = await getCoachingSessions(id);
        const openSession = sessions.find(s => s.status === 'Open');

        results.push({
            advisor: user,
            opportunities: advisorOpps,
            payments: advisorPayments,
            coaching: openSession || null
        });
    }
    return results;
};
// ============================================================================
// --- DYNAMIC PRODUCTS CONFIG (SRL & SAS) ---
// ============================================================================

export const getSrlAdTypes = async (): Promise<string[]> => {
    const cached = getFromCache('srl_ad_types');
    if (cached) return cached as string[];

    const { getSrlAdTypes } = await import('@/lib/api/system');
    const types = await getSrlAdTypes();
    setInCache('srl_ad_types', types);
    return types;
};

export const saveSrlAdTypes = async (types: string[], userId: string, userName: string) => {
    const { saveSrlAdTypes } = await import('@/lib/api/system');
    await saveSrlAdTypes(types);
    invalidateCache('srl_ad_types');
};

export const getSasProducts = async (): Promise<SasProductConfig[]> => {
    const cached = getFromCache('sas_products');
    if (cached) return cached as SasProductConfig[];

    const { getSasProducts } = await import('@/lib/api/system');
    const products = await getSasProducts();
    setInCache('sas_products', products);
    return products;
};

export const saveSasProducts = async (products: SasProductConfig[], userId: string, userName: string) => {
    const { saveSasProducts } = await import('@/lib/api/system');
    await saveSasProducts(products);
    invalidateCache('sas_products');
};
// ============================================================================
// --- PIPELINE & INTERACCIONES ---
// ============================================================================

export const getPipelineInteractions = async (): Promise<PipelineInteraction[]> => {
    const cached = getFromCache('pipeline_interactions');
    if (cached) return cached as PipelineInteraction[];

    const { getPipelineInteractions } = await import('@/lib/api/pipeline-interactions');
    const data = await getPipelineInteractions();

    setInCache('pipeline_interactions', data);
    return data;
};

export const createPipelineInteraction = async (data: Omit<PipelineInteraction, 'id' | 'createdAt'>, userId: string, userName: string): Promise<string> => {
    const { createPipelineInteraction } = await import('@/lib/api/pipeline-interactions');
    const id = await createPipelineInteraction(data);

    const cacheData = { ...data, id, advisorId: userId, advisorName: userName, createdAt: new Date().toISOString() };
    mutateCacheArray('pipeline_interactions', id, cacheData, 'add', (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return id;
};

export const updatePipelineInteraction = async (id: string, data: Partial<PipelineInteraction>): Promise<void> => {
    const { updatePipelineInteraction } = await import('@/lib/api/pipeline-interactions');
    await updatePipelineInteraction(id, data);

    mutateCacheArray('pipeline_interactions', id, { ...data, updatedAt: new Date().toISOString() }, 'update');
};

export const deletePipelineInteraction = async (id: string): Promise<void> => {
    const { deletePipelineInteraction } = await import('@/lib/api/pipeline-interactions');
    await deletePipelineInteraction(id);
    mutateCacheArray('pipeline_interactions', id, null, 'delete');
};

export const bulkCreatePipelineInteractions = async (
    interactions: Partial<PipelineInteraction>[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!interactions || interactions.length === 0) return;

    const { bulkCreatePipelineInteractions } = await import('@/lib/api/pipeline-interactions');
    const createdItems = await bulkCreatePipelineInteractions(interactions);

    createdItems.forEach(item => {
        mutateCacheArray('pipeline_interactions', item.id!, item, 'add', (a, b) => {
            const dateA = new Date(a.fecha).getTime();
            const dateB = new Date(b.fecha).getTime();
            return dateB - dateA;
        });
    });
};
// ============================================================================
// --- MANTENIMIENTO: FUSIÓN DE CLIENTES DUPLICADOS (CON LOTES ANTI-CRASH) ---
// ============================================================================

export const mergeClients = async (
    targetClientId: string,
    sourceClientId: string,
    userId: string,
    userName: string
): Promise<void> => {
    const { mergeClients } = await import('@/lib/api/clients');
    await mergeClients(targetClientId, sourceClientId);
    invalidateCache();
};
// ============================================================================
// --- GESTIÓN DINÁMICA DE TRABAJO (ROLES Y RESPONSABILIDADES) ---
// ============================================================================

export interface WorkflowAssignments {
    approvers: string[];
    billingReceptors: string[];
    tangoInvoicers: string[];
    needLoaders: string[];
    needRequestReceivers: string[];
    canjeRequestReceivers: string[];
    canjeManagementApprovers: string[];
    canjeCommercialReferents: string[];
}

export const getWorkflowAssignments = async (): Promise<WorkflowAssignments> => {
    const { getWorkflowAssignments } = await import('@/lib/api/system');
    return getWorkflowAssignments();
};

export const saveWorkflowAssignments = async (assignments: WorkflowAssignments): Promise<void> => {
    const { saveWorkflowAssignments } = await import('@/lib/api/system');
    await saveWorkflowAssignments(assignments);
    invalidateCache();
};
// ============================================================================
// --- PROCESADOR DE BANDEJA DE FACTURACIÓN ---
// ============================================================================

export const getAllBillingRequestsWithMetadata = async (): Promise<any[]> => {
    const cached = getFromCache('billing_requests_metadata');
    if (cached) return cached;

    // 1. Traer todas las peticiones de facturación crudas
    const snapRequests = await getDocsPreferCache(collection(db, 'billing_requests'));
    const requests = snapRequests.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. Traer las órdenes asociadas para cruzar ejecutivos y títulos
    const snapOrders = await getDocsPreferCache(collection(db, 'advertising_orders'));
    const ordersMap = new Map<string, any>(snapOrders.docs.map(d => [d.id, { id: d.id, ...d.data() } as any]));

    // 3. Traer los clientes para resolver Razones Sociales y CUITs en vivo
    const snapClients = await getDocsPreferCache(collection(db, 'clients'));
    const clientsMap = new Map<string, any>(snapClients.docs.map(d => [d.id, d.data() as any]));

    const mapped = requests.map((br: any) => {
        const order = ordersMap.get(br.orderId);
        const client = clientsMap.get(br.clientId);

        return {
            ...br,
            accountExecutive: order?.accountExecutive || 'Sistema',
            advisorId: order?.createdBy || '',
            opportunityTitle: order?.opportunityTitle || order?.product || 'Campaña',
            clientDisplayName: client?.razonSocialTango || client?.razonSocial || client?.denominacion || 'Desconocido',
            cuit: client?.cuit || '-',
            billingStatus: br.billingStatus || 'Sugerido', // Default fallback
            invoiceNumber: br.invoiceNumber || ''
        };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setInCache('billing_requests_metadata', mapped);
    return mapped;
};

export const updateBillingRequestStatus = async (
    requestId: string,
    newStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado',
    metadata?: { invoiceNumber?: string; emailPayload?: { accessToken: string; loggedUser: string } }
): Promise<void> => {
    const docRef = doc(db, 'billing_requests', requestId);
    const updates: Record<string, any> = { billingStatus: newStatus, updatedAt: serverTimestamp() };
    
    if (metadata?.invoiceNumber) {
        updates.invoiceNumber = metadata.invoiceNumber;
    }

    // 1. Impactamos el cambio de estado en la Base de Datos
    await updateDoc(docRef, updates);
    invalidateCache('billing_requests_metadata');

    // 2. Ejecución de notificaciones protegidas por correo
    if (metadata?.emailPayload?.accessToken) {
        try {
            const allData = await getAllBillingRequestsWithMetadata();
            const fullRequest = allData.find(r => r.id === requestId);
            if (!fullRequest) return;

            const configAssignments = await getWorkflowAssignments();
            let recipients: string[] = [];
            let emailSubject = "";
            let emailBody = "";

            let formattedDate = fullRequest.date;
            try { formattedDate = format(new Date(fullRequest.date + 'T12:00:00'), 'dd/MM/yyyy'); } catch(e) {}

            // 🟢 CASO A: ASESOR -> RECEPTOR (Nueva solicitud entrante)
            if (newStatus === 'Solicitado') {
                emailSubject = `⚠️ NUEVO PEDIDO FACTURA - ${fullRequest.company} - ${fullRequest.clientDisplayName}`;
                
                // Se le envía a todos los marcados como "Receptores de pedidos"
                for (const id of configAssignments.billingReceptors) {
                    const u = await getUserById(id);
                    if (u?.email && !recipients.includes(u.email)) recipients.push(u.email);
                }

                emailBody = `
                    <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px;">Nuevo Pedido de Facturación Entrante</h2>
                        <p>El asesor <strong>${fullRequest.accountExecutive}</strong> solicita la validación del siguiente ítem:</p>
                        <p><strong>Anunciante:</strong> ${fullRequest.clientDisplayName}<br/><strong>Monto Neto:</strong> $${Number(fullRequest.amount).toLocaleString('es-AR')}<br/><strong>Empresa:</strong> ${fullRequest.company}</p>
                        <p>Ingresa a la bandeja de Pedidos Realizados para evaluarlo y elevarlo a contaduría.</p>
                    </div>
                `;
            }

            // 🟢 CASO B: RECEPTOR -> FACTURADOR (Elevado a Administración)
            else if (newStatus === 'Elevado') {
                emailSubject = `💰 SOLICITUD FACTURA TANGO - ${fullRequest.company} - ${fullRequest.clientDisplayName}`;
                recipients = ['lchena@airedesantafe.com.ar'];

                // Se le envía a todos los marcados como "Facturación Tango"
                for (const id of configAssignments.tangoInvoicers) {
                    const u = await getUserById(id);
                    if (u?.email && !recipients.includes(u.email)) recipients.push(u.email);
                }

                emailBody = `
                    <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #b45309; border-bottom: 2px solid #b45309; padding-bottom: 8px;">Pedido de Facturación Elevado</h2>
                        <p>El coordinador <strong>${metadata.emailPayload.loggedUser}</strong> solicita confeccionar la siguiente factura en Tango:</p>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
                            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Anunciante:</td><td style="padding: 6px; background: #f8fafc;">${fullRequest.clientDisplayName}</td></tr>
                            <tr><td style="padding: 6px; font-weight: bold;">CUIT:</td><td style="padding: 6px;">${fullRequest.cuit}</td></tr>
                            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Empresa:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold;">${fullRequest.company}</td></tr>
                            <tr><td style="padding: 6px; font-weight: bold;">Fecha Progr:</td><td style="padding: 6px;">${formattedDate}</td></tr>
                            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Monto Neto:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold; color: #15803d;">$${Number(fullRequest.amount).toLocaleString('es-AR')}</td></tr>
                            <tr><td style="padding: 6px; font-weight: bold;">Condición:</td><td style="padding: 6px;">${fullRequest.paymentType || 'Se paga'} ${fullRequest.canjeDescription ? `(${fullRequest.canjeDescription})` : ''}</td></tr>
                        </table>
                    </div>
                `;
            }

            // 🟢 CASO C: RECEPTOR -> ASESOR (Factura finalizada con número de Tango)
            else if (newStatus === 'Confeccionado') {
                emailSubject = `✅ FACTURA DISPONIBLE - ${fullRequest.clientDisplayName}`;
                
                // Buscamos el correo electrónico real del asesor dueño del contrato
                if (fullRequest.advisorId) {
                    const sellerProfile = await getUserById(fullRequest.advisorId);
                    if (sellerProfile?.email) recipients.push(sellerProfile.email);
                }
                if (recipients.length === 0) recipients.push('lchena@airedesantafe.com.ar');

                emailBody = `
                    <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #15803d; border-bottom: 2px solid #15803d; padding-bottom: 8px;">Factura Confeccionada Correctamente</h2>
                        <p>Hola <strong>${fullRequest.accountExecutive}</strong>,</p>
                        <p>Administración informa que ya se ha emitido el comprobante oficial en Tango para tu cliente:</p>
                        <p><strong>Anunciante:</strong> ${fullRequest.clientDisplayName}<br/>
                        <strong>Importe Neto:</strong> $${Number(fullRequest.amount).toLocaleString('es-AR')}<br/>
                        <strong>NÚMERO DE FACTURA ASIGNADO:</strong> <span style="font-family: monospace; font-size: 14px; background: #e1faf0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #16a34a;">${metadata.invoiceNumber}</span></p>
                        <p>Ya puedes consultar el registro cerrado desde tu panel de facturas confeccionadas.</p>
                    </div>
                `;
            }

            if (recipients.length > 0 && emailBody !== "") {
                await sendEmail({
                    accessToken: metadata.emailPayload.accessToken,
                    to: recipients,
                    subject: emailSubject,
                    body: emailBody
                });
            }
        } catch (err) {
            console.error("Fallo controlado en el despachador de correos contables:", err);
        }
    }
};
