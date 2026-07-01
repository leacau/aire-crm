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

// --- Commercial Notes Functions ---

export const saveCommercialNote = async (
    noteData: Omit<CommercialNote, 'id' | 'createdAt'>,
    userId: string,
    userName: string
): Promise<string> => {
    const batch = writeBatch(db);
    
    const noteRef = doc(collections.commercialNotes);
    batch.set(noteRef, {
        ...noteData,
        createdAt: serverTimestamp(),
    });

    const activityRef = doc(collections.clientActivities);
    batch.set(activityRef, {
        clientId: noteData.clientId,
        clientName: noteData.clientName,
        userId: userId,
        userName: userName,
        type: 'Otra',
        observation: `Generó una Nota Comercial: "${noteData.title}" (Valor: $${noteData.totalValue.toLocaleString()})`,
        timestamp: serverTimestamp(),
        isTask: false,
        createdAt: serverTimestamp(),
    });

    const systemLogRef = doc(collections.activities);
    batch.set(systemLogRef, {
        userId,
        userName,
        type: 'create',
        entityType: 'commercial_note' as any,
        entityId: noteRef.id,
        entityName: 'Nota Comercial',
        details: `creó una nota comercial para <strong>${noteData.clientName}</strong>`,
        ownerName: noteData.advisorName,
        timestamp: serverTimestamp(),
    });

    await batch.commit();
    return noteRef.id;
};

export async function getCommercialNotesByClientId(clientId: string): Promise<CommercialNote[]> {
  try {
    const q = query(collections.commercialNotes, where('clientId', '==', clientId));

    const querySnapshot = await getDocs(q);
    const notes: CommercialNote[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : (data.createdAt || '');

      return { id: doc.id, ...data, createdAt } as CommercialNote;
    });

    return notes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error) {
    console.error("Error al obtener las notas comerciales del cliente:", error);
    throw error;
  }
}

// Obtener notas de un asesor específico
export const getCommercialNotesForAdvisor = async (advisorId: string): Promise<CommercialNote[]> => {
    try {
        const q = query(
            collections.commercialNotes, 
            where('advisorId', '==', advisorId),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: timestampToISO(data.createdAt) || new Date().toISOString()
            } as CommercialNote;
        });
    } catch (error) {
        console.error("Error getting advisor notes:", error);
        return [];
    }
};

export const getAllCommercialNotes = async (): Promise<CommercialNote[]> => {
    try {
        const querySnapshot = await getDocs(collections.commercialNotes);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: timestampToISO(data.createdAt) || data.createdAt || ''
            } as CommercialNote;
        }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (error) {
        console.error("Error getting all notes:", error);
        return [];
    }
};

export const getCommercialNotesByOrderId = async (orderId: string): Promise<CommercialNote[]> => {
    const snapshot = await getDocs(query(collections.commercialNotes, where('orderId', '==', orderId)));
    return snapshot.docs.map(noteDoc => {
        const data = noteDoc.data();
        return {
            id: noteDoc.id,
            ...data,
            createdAt: timestampToISO(data.createdAt) || new Date().toISOString()
        } as CommercialNote;
    });
};

export const linkCommercialNoteToOrder = async (
    noteId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(collections.commercialNotes, noteId);
    await updateDoc(docRef, {
        orderId,
        orderTitle,
        updatedAt: serverTimestamp(),
    });
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: 'Nota Comercial',
        details: `vinculÃ³ una nota comercial a la orden <strong>${orderTitle}</strong>`,
        ownerName: userName,
    });
};

export const unlinkCommercialNoteFromOrder = async (
    noteId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error('Debe indicar el motivo de la desvinculacion.');
    const docRef = doc(collections.commercialNotes, noteId);
    await updateDoc(docRef, {
        orderId: deleteField(),
        orderTitle: deleteField(),
        orderUnlinkedAt: serverTimestamp(),
        orderUnlinkedById: userId,
        orderUnlinkedByName: userName,
        orderUnlinkReason: normalizedReason,
        updatedAt: serverTimestamp(),
    });
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: 'Nota Comercial',
        details: 'quitÃ³ la vinculaciÃ³n de una nota comercial con una orden de publicidad',
        ownerName: userName,
    });
};

export const getCommercialNote = async (noteId: string): Promise<CommercialNote | null> => {
    try {
        const docRef = doc(db, 'commercial_notes', noteId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const createdAt = data.createdAt instanceof Timestamp 
                ? data.createdAt.toDate().toISOString() 
                : data.createdAt;
                
            return {
                id: docSnap.id,
                ...data,
                createdAt
            } as CommercialNote;
        }
        return null;
    } catch (error) {
        console.error("Error fetching commercial note:", error);
        return null;
    }
};

export const deleteCommercialNote = async (noteId: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'commercial_notes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) throw new Error("Nota no encontrada");
    const noteData = docSnap.data();

    await deleteDoc(docRef);
    
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: noteData.title || 'Nota Comercial',
        details: `eliminó la nota comercial <strong>${noteData.title}</strong>`,
        ownerName: noteData.advisorName || 'Desconocido'
    });
};

export const updateCommercialNote = async (
    noteId: string,
    noteData: Partial<Omit<CommercialNote, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(collections.commercialNotes, noteId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Nota no encontrada");

    await updateDoc(docRef, {
        ...noteData, // Aquí viajan "advisorId" y "advisorName"
        updatedAt: serverTimestamp() 
    });

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: noteData.title || 'Nota Comercial',
        details: `editó la nota comercial <strong>${noteData.title}</strong>`,
        ownerName: noteData.advisorName || userName // Se loguea al dueño real de la orden
    });
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
    
    const permissionsDocRef = doc(db, 'system_config', PERMISSIONS_DOC_ID);
    const docSnap = await getDoc(permissionsDocRef);

    if (docSnap.exists()) {
        const perms = docSnap.data().permissions;
        setInCache('permissions', perms);
        return perms;
    } else {
        await setDoc(permissionsDocRef, { permissions: defaultPermissions });
        setInCache('permissions', defaultPermissions);
        return defaultPermissions;
    }
};

export const updateAreaPermissions = async (permissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>): Promise<void> => {
    const permissionsDocRef = doc(db, 'system_config', PERMISSIONS_DOC_ID);
    
    setDoc(permissionsDocRef, { permissions }, { merge: true }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: permissionsDocRef.path,
        operation: 'update',
        requestResourceData: { permissions },
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
    invalidateCache('permissions');
};

export const saveMonthlyClosure = async (advisorId: string, month: string, value: number, managerId: string) => {
    const userRef = doc(db, 'users', advisorId);
    const fieldPath = `monthlyClosures.${month}`;

    await updateDoc(userRef, {
        [fieldPath]: value,
    });
    invalidateCache('users');
    
    const managerSnap = await getDoc(doc(db, 'users', managerId));
    const advisorSnap = await getDoc(userRef);
    const managerName = managerSnap.exists() ? managerSnap.data().name : 'Manager';
    const advisorName = advisorSnap.exists() ? advisorSnap.data().name : 'Asesor';

    await logActivity({
        userId: managerId,
        userName: managerName,
        type: 'update',
        entityType: 'monthly_closure' as any,
        entityId: advisorId,
        entityName: advisorName,
        details: `registró el cierre de <strong>${month}</strong> para <strong>${advisorName}</strong> con un valor de <strong>$${value.toLocaleString('es-AR')}</strong>`,
        ownerName: advisorName,
    });
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
    const docRef = doc(collections.systemConfig, 'holidays');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return (snap.data() as SystemHolidays).dates || [];
    }
    return [];
};

export const saveSystemHolidays = async (dates: string[], userId: string, userName: string) => {
    const docRef = doc(collections.systemConfig, 'holidays');
    await setDoc(docRef, { dates }, { merge: true });
    invalidateCache('system_holidays'); // Si usas caché para esto
    
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'system_config',
        entityId: 'holidays',
        entityName: 'Feriados',
        details: `actualizó la lista de feriados del sistema.`,
        ownerName: 'Sistema',
    });
};

// --- Prospect Functions ---
export const getProspects = async (): Promise<Prospect[]> => {
    const cachedData = getFromCache('prospects');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.prospects, orderBy("createdAt", "desc")));
    const prospects = snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
      return {
          id: doc.id,
          ...data,
          createdAt: convertTimestamp(data.createdAt),
          statusChangedAt: convertTimestamp(data.statusChangedAt),
          lastProspectNotificationAt: convertTimestamp((data as any).lastProspectNotificationAt),
      } as Prospect
    });
    setInCache('prospects', prospects);
    return prospects;
};

export const createProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>, userId: string, userName: string): Promise<string> => {
    const dataToSave = {
        ...prospectData,
        ownerId: userId,
        ownerName: userName,
        creatorId: userId,
        creatorName: userName,
        createdAt: serverTimestamp(), // Va a Firebase
    };
    const docRef = await addDoc(collections.prospects, dataToSave);
    
    // 🟢 EL TRUCO: Para el caché visual, inyectamos un texto ISO real
    const cacheData = {
        ...dataToSave,
        createdAt: new Date().toISOString()
    };
    
    mutateCacheArray('prospects', docRef.id, cacheData, 'add', (a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'prospect',
        entityId: docRef.id,
        entityName: prospectData.companyName,
        details: `creó el prospecto <strong>${prospectData.companyName}</strong>`,
        ownerName: userName,
    });
    try {
        await autoUpdateCoachingSession(userId, userName, 'prospect', docRef.id, prospectData.companyName, 'Nuevo prospecto cargado en el sistema.');
    } catch (e) {
        console.error('Error auto-updating coaching:', e);
    }
    return docRef.id;
};

export const updateProspect = async (id: string, data: Partial<Omit<Prospect, 'id'>>, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', id);
    const prospectSnap = await getDoc(docRef);
    if (!prospectSnap.exists()) throw new Error('Prospect not found');
    const prospectData = prospectSnap.data() as Prospect;

    const updateData = { ...data, updatedAt: serverTimestamp() };
    await updateDoc(docRef, updateData);
    
    // 🟢 Aplicamos la misma limpieza para la fecha de actualización
    const cacheData = {
        ...updateData,
        updatedAt: new Date().toISOString()
    };
    
    mutateCacheArray('prospects', id, cacheData, 'update');

    let details = `actualizó el prospecto <strong>${prospectData.companyName}</strong>`;
    if (data.status && data.status !== prospectData.status) {
        details = `cambió el estado del prospecto <strong>${prospectData.companyName}</strong> a <strong>${data.status}</strong>`;
    }

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: id,
        entityName: prospectData.companyName,
        details,
        ownerName: prospectData.ownerName,
    });

    const coachingNotes = [
        data.status && data.status !== prospectData.status ? `Estado: ${data.status}` : null,
        data.notes && data.notes !== prospectData.notes ? `Notas: ${data.notes}` : null,
    ].filter(Boolean).join(' - ');

    if (coachingNotes) {
        try {
            await autoUpdateCoachingSession(userId, userName, 'prospect', id, prospectData.companyName, `Actualización de prospecto - ${coachingNotes}`);
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }
};

export const deleteProspect = async (id: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', id);
    const prospectSnap = await getDoc(docRef);
    if (!prospectSnap.exists()) throw new Error("Prospect not found");
    const prospectData = prospectSnap.data() as Prospect;

    await deleteDoc(docRef);
    
    // 🟢 MUTADOR CORRECTO PARA BORRADO DE PROSPECTOS
    mutateCacheArray('prospects', id, null, 'delete');

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'prospect',
        entityId: id,
        entityName: prospectData.companyName,
        details: `eliminó el prospecto <strong>${prospectData.companyName}</strong>`,
        ownerName: prospectData.ownerName,
    });
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
    const docRef = doc(db, 'client-activities', activityId);
    
    await updateDoc(docRef, {
        completed: true,
        completedAt: serverTimestamp(),
        completedByUserId: userId,
        completedByUserName: userName,
        updatedAt: serverTimestamp()
    });

invalidateCache('client_activities');
    // Opcional: Loguear que se completó la tarea
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'client_activity' as any, 
        entityId: activityId,
        entityName: 'Tarea completada',
        details: 'marcó la tarea como finalizada',
        ownerName: userName
    }); 
};

export const rescheduleActivityTask = async (activityId: string, newDate: Date, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'client-activities', activityId);
    
    await updateDoc(docRef, {
        dueDate: Timestamp.fromDate(newDate),
        updatedAt: serverTimestamp()
    });
    
    invalidateCache('client_activities');
};


// --- Grilla Comercial Functions ---

export const getPrograms = async (): Promise<Program[]> => {
    const cachedData = getFromCache('programs');
    if (cachedData) return cachedData;
    
    const snapshot = await getDocs(query(collections.programs, orderBy("name")));
    const programs = snapshot.docs.map(doc => {
      const data = doc.data();
      if (!data.schedules) {
        return {
          id: doc.id,
          ...data,
          schedules: [{
            id: 'default',
            daysOfWeek: data.daysOfWeek || [],
            startTime: data.startTime || '',
            endTime: data.endTime || '',
          }]
        } as Program;
      }
      return { id: doc.id, ...data } as Program
    });
    setInCache('programs', programs);
    return programs;
};

export const getProgram = async (id: string): Promise<Program | null> => {
    const docRef = doc(db, 'programs', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.schedules) {
            return {
              id: docSnap.id,
              ...data,
              schedules: [{
                id: 'default',
                daysOfWeek: data.daysOfWeek || [],
                startTime: data.startTime || '',
                endTime: data.endTime || '',
              }]
            } as Program;
        }
        return { id: docSnap.id, ...data } as Program;
    }
    return null;
}

export const saveProgram = async (programData: Omit<Program, 'id'>, userId: string): Promise<string> => {
    const dataToSave = { ...programData };
    // @ts-ignore - Remove deprecated fields before saving
    delete dataToSave.startTime;
    delete dataToSave.endTime;
    delete dataToSave.daysOfWeek;
    const docRef = await addDoc(collections.programs, { ...dataToSave, createdBy: userId, createdAt: serverTimestamp() });
    invalidateCache('programs');
    
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userName = userSnap.exists() ? (userSnap.data() as User).name : 'Sistema';

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'program',
        entityId: docRef.id,
        entityName: programData.name,
        details: `creó el programa <strong>${programData.name}</strong>`,
        ownerName: userName,
    });

    return docRef.id;
};

export const updateProgram = async (programId: string, programData: Partial<Omit<Program, 'id'>>, userId: string): Promise<void> => {
    const docRef = doc(db, 'programs', programId);
    const originalSnap = await getDoc(docRef);
    if (!originalSnap.exists()) throw new Error("Program not found");

    const dataToUpdate = { ...programData };
    // @ts-ignore
    delete dataToUpdate.startTime;
    delete dataToUpdate.endTime;
    delete dataToUpdate.daysOfWeek;
    await updateDoc(docRef, { ...dataToUpdate, updatedBy: userId, updatedAt: serverTimestamp() });
    invalidateCache('programs');

    const userSnap = await getDoc(doc(db, 'users', userId));
    const userName = userSnap.exists() ? (userSnap.data() as User).name : 'Sistema';

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'program',
        entityId: programId,
        entityName: programData.name || originalSnap.data().name,
        details: `actualizó el programa <strong>${programData.name || originalSnap.data().name}</strong>`,
        ownerName: userName,
    });
};

export const deleteProgram = async (programId: string, userId: string): Promise<void> => {
    const docRef = doc(db, 'programs', programId);
    const originalSnap = await getDoc(docRef);
    if (!originalSnap.exists()) throw new Error("Program not found");
    const programName = originalSnap.data().name;

    await deleteDoc(docRef);
    invalidateCache('programs');
    invalidateCache(); // Invalidate all for commercial items
    
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userName = userSnap.exists() ? (userSnap.data() as User).name : 'Sistema';

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'program',
        entityId: programId,
        entityName: programName,
        details: `eliminó el programa <strong>${programName}</strong>`,
        ownerName: userName,
    });
};

export const getCommercialItems = async (date: string): Promise<CommercialItem[]> => {
    const cacheKey = `commercial_items_${date}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const q = query(collections.commercialItems, where("date", "==", date));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map(doc => {
        const data = doc.data();
        const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
        const validDate = parseDateWithTimezone(data.date);
        return { 
            id: doc.id, 
            ...data,
            date: validDate ? format(validDate, 'yyyy-MM-dd') : 'invalid-date',
            pntReadAt: convertTimestamp(data.pntReadAt),
        } as CommercialItem
    });
    setInCache(cacheKey, items);
    return items;
};

export const getCommercialItemsBySeries = async (seriesId: string): Promise<CommercialItem[]> => {
    const q = query(collections.commercialItems, where("seriesId", "==", seriesId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const validDate = parseDateWithTimezone(data.date);
      return { 
        id: doc.id, 
        ...data,
        date: validDate ? format(validDate, 'yyyy-MM-dd') : 'invalid-date'
      } as CommercialItem
    });
};

export const saveCommercialItemSeries = async (item: Omit<CommercialItem, 'id' | 'date'>, dates: Date[], userId: string, isEditingSeries?: boolean): Promise<string | void> => {
    const batch = writeBatch(db);
    const newSeriesId = item.seriesId || doc(collection(db, 'dummy')).id;

    const formattedDates = new Set(dates.map(d => d.toISOString().split('T')[0]));
    
    const itemToSave: {[key: string]: any} = {...item};
    
    if (itemToSave.clientId === undefined || itemToSave.clientId === null || itemToSave.clientId === '') {
      delete itemToSave.clientId;
      delete itemToSave.clientName;
    }
    if (itemToSave.opportunityId === undefined || itemToSave.opportunityId === null || itemToSave.opportunityId === '') {
      delete itemToSave.opportunityId;
      delete itemToSave.opportunityTitle;
    }


    if (isEditingSeries && item.seriesId) {
        const existingItems = await getCommercialItemsBySeries(item.seriesId);

        for (const existingItem of existingItems) {
            if (!formattedDates.has(existingItem.date)) {
                const docRef = doc(db, 'commercial_items', existingItem.id);
                batch.delete(docRef);
            }
        }

        for (const dateStr of formattedDates) {
            const existingItem = existingItems.find(i => i.date === dateStr);
            const dataToSave = { ...itemToSave, seriesId: newSeriesId, date: dateStr, updatedBy: userId, updatedAt: serverTimestamp() };
            
            const docRef = existingItem ? doc(db, 'commercial_items', existingItem.id) : doc(collection(db, 'commercial_items'));
            batch.set(docRef, dataToSave, { merge: true });
        }

    } else {
        for (const date of dates) {
            const docRef = doc(collection(db, 'commercial_items'));
            const formattedDate = date.toISOString().split('T')[0];

            const itemData: Omit<CommercialItem, 'id'> = {
                ...item,
                date: formattedDate,
                seriesId: dates.length > 1 ? newSeriesId : undefined,
            };

            const dataToSave: { [key: string]: any } = { ...itemData, createdBy: userId, createdAt: serverTimestamp() };
            
            if (dataToSave.clientId === undefined) delete dataToSave.clientId;
            if (dataToSave.clientName === undefined) delete dataToSave.clientName;
            if (dataToSave.opportunityId === undefined) delete dataToSave.opportunityId;
            if (dataToSave.opportunityTitle === undefined) delete dataToSave.opportunityTitle;

            batch.set(docRef, dataToSave);
        }
    }
    
    await batch.commit();
    invalidateCache(); // Invalidate all caches for simplicity

    const userSnap = await getDoc(doc(db, 'users', userId));
    const userName = userSnap.exists() ? (userSnap.data() as User).name : 'Sistema';
    
    await logActivity({
        userId,
        userName,
        type: isEditingSeries ? 'update' : 'create',
        entityType: 'commercial_item_series',
        entityId: newSeriesId,
        entityName: item.title || item.description,
        details: `${isEditingSeries ? 'actualizó' : 'creó'} ${dates.length} elemento(s) comerciales para <strong>${item.title || item.description}</strong>`,
        ownerName: item.clientName || userName,
    });

    return newSeriesId;
};

export const createCommercialItem = async (itemData: Omit<CommercialItem, 'id'>, userId: string, userName: string): Promise<string> => {
    const dataToSave = { ...itemData, createdBy: userId, createdAt: serverTimestamp() };
    const docRef = await addDoc(collections.commercialItems, dataToSave);
    invalidateCache(); // Invalidate all for simplicity
    return docRef.id;
};


export const updateCommercialItem = async (itemId: string, itemData: Partial<Omit<CommercialItem, 'id'>>, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'commercial_items', itemId);
    const originalSnap = await getDoc(docRef);
    if (!originalSnap.exists()) throw new Error("Commercial item not found");
    const originalData = originalSnap.data() as CommercialItem;

    const dataToUpdate: {[key:string]: any} = {...itemData};
    
    if (!dataToUpdate.clientId) {
        dataToUpdate.clientId = deleteField();
        dataToUpdate.clientName = deleteField();
    }
    if (!dataToUpdate.opportunityId) {
        dataToUpdate.opportunityId = deleteField();
        dataToUpdate.opportunityTitle = deleteField();
    }
    if (dataToUpdate.pntReadAt === undefined) {
        dataToUpdate.pntReadAt = deleteField();
    }
     if (dataToUpdate.seriesId) {
        dataToUpdate.seriesId = dataToUpdate.seriesId;
    }


    await updateDoc(docRef, {...dataToUpdate, updatedBy: userId, updatedAt: serverTimestamp()});
    invalidateCache(`commercial_items_${originalData.date}`);

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_item',
        entityId: itemId,
        entityName: originalData.title || originalData.description,
        details: `actualizó el elemento comercial <strong>${originalData.title || originalData.description}</strong>`,
        ownerName: originalData.clientName || userName,
    });
}

export const deleteCommercialItem = async (itemIds: string[], userId?: string, userName?: string): Promise<void> => {
    if (!itemIds || itemIds.length === 0) return;

    const batch = writeBatch(db);
    
    const firstItemRef = doc(db, 'commercial_items', itemIds[0]);
    const firstItemSnap = await getDoc(firstItemRef);
    const firstItemData = firstItemSnap.exists() ? firstItemSnap.data() as CommercialItem : null;
    
    for (const id of itemIds) {
        const docRef = doc(db, 'commercial_items', id);
        batch.delete(docRef);
    }
    
    await batch.commit();
    invalidateCache(); // Invalidate all caches

    if (userId && userName && firstItemData) {
        await logActivity({
            userId,
            userName,
            type: 'delete',
            entityType: 'commercial_item',
            entityId: 'multiple',
            entityName: firstItemData.title || firstItemData.description,
            details: `eliminó ${itemIds.length} elemento(s) comercial(es) de la serie <strong>${firstItemData.title || firstItemData.description}</strong>`,
            ownerName: firstItemData.clientName || userName,
        });
    }
};


// --- Canje Functions ---
export const getCanjes = async (): Promise<Canje[]> => {
    const cachedData = getFromCache('canjes');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.canjes, orderBy("fechaCreacion", "desc")));
    const canjes = snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
      
      const canje: Canje = { 
          id: doc.id,
          ...data,
          fechaCreacion: convertTimestamp(data.fechaCreacion),
          fechaResolucion: data.fechaResolucion ? format(parseISO(data.fechaResolucion), 'yyyy-MM-dd') : undefined,
          fechaCulminacion: data.fechaCulminacion ? format(parseISO(data.fechaCulminacion), 'yyyy-MM-dd') : undefined,
      } as Canje;
      
      if (canje.historialMensual) {
        canje.historialMensual = canje.historialMensual.map(h => ({
          ...h,
          fechaEstado: convertTimestamp(h.fechaEstado),
          fechaCulminacion: h.fechaCulminacion ? format(parseISO(h.fechaCulminacion), 'yyyy-MM-dd') : undefined,
        })).sort((a,b) => b.mes.localeCompare(a.mes));
      }

      return canje;
    });
    setInCache('canjes', canjes);
    return canjes;
};

export const getAdvertisingOrdersByCanjeId = async (canjeId: string, legacyOrderIds: string[] = []): Promise<AdvertisingOrder[]> => {
    if (!canjeId) return [];
    const snapshot = await getDocs(query(collection(db, 'advertising_orders'), where('canjeId', '==', canjeId)));
    const orders = snapshot.docs.map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() } as AdvertisingOrder));
    const foundIds = new Set(orders.map(order => order.id));
    const missingLegacyIds = legacyOrderIds.filter(orderId => !foundIds.has(orderId));
    const legacySnapshots = await Promise.all(
        missingLegacyIds.map(orderId => getDoc(doc(db, 'advertising_orders', orderId)))
    );
    legacySnapshots.forEach(orderSnapshot => {
        if (orderSnapshot.exists()) {
            orders.push({ id: orderSnapshot.id, ...orderSnapshot.data() } as AdvertisingOrder);
        }
    });
    return orders
        .sort((a, b) => new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime());
};

export const getInvoicesByCanjeId = async (canjeId: string): Promise<Invoice[]> => {
    if (!canjeId) return [];
    const snapshot = await getDocs(query(collections.invoices, where('canjeId', '==', canjeId)));
    return snapshot.docs
        .map(invoiceDoc => ({ id: invoiceDoc.id, ...invoiceDoc.data() } as Invoice))
        .sort((a, b) => new Date(b.date || b.dateGenerated).getTime() - new Date(a.date || a.dateGenerated).getTime());
};

export const createCanje = async (canjeData: Omit<Canje, 'id' | 'fechaCreacion'>, userId: string, userName: string): Promise<string> => {
    const dataToSave: { [key: string]: any } = {
        ...canjeData,
        fechaCreacion: serverTimestamp(),
        creadoPorId: userId,
        creadoPorName: userName,
    };

    Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === undefined) {
            delete dataToSave[key];
        }
    });
    
    const docRef = await addDoc(collections.canjes, dataToSave);
    invalidateCache('canjes');
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'canje',
        entityId: docRef.id,
        entityName: canjeData.titulo,
        details: `creó un pedido de canje: <strong>${canjeData.titulo}</strong>`,
        ownerName: canjeData.asesorName || userName,
    });

    return docRef.id;
};

export const updateCanje = async (
    id: string, 
    data: Partial<Omit<Canje, 'id'>>, 
    userId: string, 
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'canjes', id);
    const originalDoc = await getDoc(docRef);
    if (!originalDoc.exists()) throw new Error('Canje not found');

    const originalData = originalDoc.data() as Canje;
    
    const updateData: { [key: string]: any } = { ...data };
    
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
            updateData[key] = deleteField();
        }
    });

    if (data.tipo === 'Una vez' && data.estado === 'Aprobado' && originalData.estado !== 'Aprobado') {
        updateData.culminadoPorId = userId;
        updateData.culminadoPorName = userName;
    }
    
    if (data.historialMensual) {
        updateData.historialMensual = data.historialMensual.map(h => {
            const historyItem: Partial<HistorialMensualItem> = { ...h };
            if (historyItem.fechaEstado) {
                historyItem.fechaEstado = new Date(historyItem.fechaEstado).toISOString();
            }
            if (historyItem.fechaCulminacion) {
                historyItem.fechaCulminacion = new Date(historyItem.fechaCulminacion).toISOString();
            }
            return historyItem;
        });
    }

    await updateDoc(docRef, updateData);
    invalidateCache('canjes');

    let details = `actualizó el canje <strong>${originalData.titulo}</strong>`;
    if (data.estado && data.estado !== originalData.estado) {
        details = `cambió el estado del canje <strong>${originalData.titulo}</strong> a <strong>${data.estado}</strong>`;
    }
    if (data.clienteId && data.clienteId !== originalData.clienteId) {
        details = `asignó el canje <strong>${originalData.titulo}</strong> al cliente <strong>${data.clienteName}</strong>`
    }
    if(data.historialMensual) {
        details = `actualizó el historial mensual del canje <strong>${originalData.titulo}</strong>`;
    }


    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'canje',
        entityId: id,
        entityName: originalData.titulo,
        details: details,
        ownerName: data.asesorName || originalData.asesorName,
    });
};

export const deleteCanje = async (id: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'canjes', id);
    const canjeSnap = await getDoc(docRef);
    if (!canjeSnap.exists()) throw new Error("Canje not found");
    const canjeData = canjeSnap.data() as Canje;

    await deleteDoc(docRef);
    invalidateCache('canjes');

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'canje',
        entityId: id,
        entityName: canjeData.titulo,
        details: `eliminó el canje <strong>${canjeData.titulo}</strong>`,
        ownerName: canjeData.asesorName || userName,
    });
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

    const snapshot = await getDocsPreferCache(query(collections.invoices, orderBy("dateGenerated", "desc")));
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        
        const validDate = data.date && typeof data.date === 'string' ? parseDateWithTimezone(data.date) : null;
        const validDatePaid = data.datePaid && typeof data.datePaid === 'string' ? parseDateWithTimezone(data.datePaid) : null;

        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkAt = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkAt = rawDeletionMarkAt instanceof Timestamp
            ? rawDeletionMarkAt.toDate().toISOString()
            : typeof rawDeletionMarkAt === 'string'
                ? rawDeletionMarkAt
                : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            date: validDate ? format(validDate, 'yyyy-MM-dd') : undefined,
            dateGenerated: data.dateGenerated instanceof Timestamp ? data.dateGenerated.toDate().toISOString() : data.dateGenerated,
            datePaid: validDatePaid ? format(validDatePaid, 'yyyy-MM-dd') : undefined,
            isCreditNote: Boolean(data.isCreditNote),
            creditNoteMarkedAt: normalizedCreditNoteDate,
            deletionMarkedAt: normalizedDeletionMarkAt,
            // 🟢 Mapeo explícito de los nuevos campos
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            orderDate: data.orderDate,
            orderNumber: data.orderNumber,
        } as Invoice;
    });
    return invoices;
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
    const q = query(collections.invoices, where("opportunityId", "==", opportunityId));
    const snapshot = await getDocsPreferCache(q);
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkAt = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkAt = rawDeletionMarkAt instanceof Timestamp
            ? rawDeletionMarkAt.toDate().toISOString()
            : typeof rawDeletionMarkAt === 'string'
                ? rawDeletionMarkAt
                : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            isCreditNote: Boolean(data.isCreditNote),
            creditNoteMarkedAt: normalizedCreditNoteDate,
            deletionMarkedAt: normalizedDeletionMarkAt,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            orderDate: data.orderDate,
            orderNumber: data.orderNumber,
        } as Invoice;
    });
    invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    return invoices;
    });
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const cacheKey = `invoices_client_${clientId}`;
    return getCachedOrLoad(cacheKey, async () => {
    const opportunityIds = (await getOpportunitiesByClientId(clientId)).map(opp => opp.id);
    if (opportunityIds.length === 0) return [];
    
    const chunks: string[][] = [];
    for (let i = 0; i < opportunityIds.length; i += 30) {
        chunks.push(opportunityIds.slice(i, i + 30));
    }

    const snapshots = await Promise.all(
        chunks.map(ids => getDocsPreferCache(query(collections.invoices, where("opportunityId", "in", ids))))
    );

    const invoices = snapshots.flatMap(snapshot => snapshot.docs.map(doc => {
        const data = doc.data() as any;
        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkAt = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkAt = rawDeletionMarkAt instanceof Timestamp
            ? rawDeletionMarkAt.toDate().toISOString()
            : typeof rawDeletionMarkAt === 'string'
                ? rawDeletionMarkAt
                : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            isCreditNote: Boolean(data.isCreditNote),
            creditNoteMarkedAt: normalizedCreditNoteDate,
            deletionMarkedAt: normalizedDeletionMarkAt,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            orderDate: data.orderDate,
            orderNumber: data.orderNumber,
        } as Invoice;
    }));
    return invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    });
};

export const createInvoice = async (invoiceData: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const dataToSave = {
      ...invoiceData,
      dateGenerated: new Date().toISOString(),
      isCreditNote: invoiceData.isCreditNote ?? false,
      creditNoteMarkedAt: invoiceData.creditNoteMarkedAt ?? null,
      markedForDeletion: invoiceData.markedForDeletion ?? false,
      deletionMarkedAt: invoiceData.deletionMarkedAt ?? null,
      deletionMarkedById: invoiceData.deletionMarkedById ?? null,
      deletionMarkedByName: invoiceData.deletionMarkedByName ?? null,
      periodStart: invoiceData.periodStart ?? null,
      periodEnd: invoiceData.periodEnd ?? null,
      orderDate: invoiceData.orderDate ?? null,
      orderNumber: invoiceData.orderNumber ?? null,
    };
    Object.keys(dataToSave).forEach(key => {
      if ((dataToSave as Record<string, unknown>)[key] === undefined) {
        delete (dataToSave as Record<string, unknown>)[key];
      }
    });
    const docRef = await addDoc(collections.invoices, dataToSave);
    
    // 🟢 MUTADOR CORRECTO PARA FACTURAS (Usamos dataToSave)
    mutateCacheArray('invoices', docRef.id, dataToSave, 'add', (a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    invalidateInvoiceDetailCaches();

   if (invoiceData.date && !invoiceData.isCreditNote) {
        const monthKey = invoiceData.date.substring(0, 7);
        const amountToLog = Math.abs(invoiceData.amount);
        
        await updateMonthlyBillingStat(monthKey, amountToLog, userId);
    }
    return docRef.id;
};

export const updateInvoice = async (id: string, data: Partial<Omit<Invoice, 'id'>>, userId: string, userName: string, ownerName: string): Promise<void> => {
    const docRef = doc(db, 'invoices', id);
    const updateData: Partial<Invoice> & { [key: string]: any } = {...data};

    delete updateData.id;

    if (updateData.status === 'Pagada' && !updateData.datePaid) {
        updateData.datePaid = new Date().toISOString().split('T')[0];
    }
    
    await updateDoc(docRef, updateData);
    
    // 🟢 MUTADOR CORRECTO PARA EDICIÓN DE FACTURAS
    mutateCacheArray('invoices', id, updateData, 'update');
    invalidateInvoiceDetailCaches();
};

export const deleteInvoice = async (id: string, userId: string, userName: string, ownerName: string): Promise<void> => {
    const docRef = doc(db, 'invoices', id);
    const invoiceSnap = await getDoc(docRef);
    const invoiceData = invoiceSnap.data();

    await deleteDoc(docRef);
    
    // 🟢 MUTADOR CORRECTO PARA BORRADO DE FACTURAS
    mutateCacheArray('invoices', id, null, 'delete');
    invalidateInvoiceDetailCaches();

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'invoice',
        entityId: id,
        entityName: `Factura #${invoiceData?.invoiceNumber || id}`,
        details: `eliminó la factura #${invoiceData?.invoiceNumber || id}`,
        ownerName: ownerName
    });
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

const PAYMENT_DATE_FORMATS = [
    'yyyy-MM-dd',
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd-MM-yyyy',
    'd-M-yyyy',
    'dd/MM/yy',
    'd/M/yy',
    'dd-MM-yy',
    'd-M-yy',
];

const parsePaymentDate = (raw?: string | null) => {
    if (!raw) return null;
    const value = raw.toString().trim();

    const tryParse = (parser: () => Date) => {
        try {
            const parsed = parser();
            if (!Number.isNaN(parsed.getTime())) return parsed;
        } catch (error) {
            return null;
        }
        return null;
    };

    return (
        tryParse(() => parseISO(value)) ??
        PAYMENT_DATE_FORMATS.reduce<Date | null>((acc, formatString) => acc ?? tryParse(() => parse(value, formatString, new Date())), null)
    );
};

const normalizePaymentDate = (raw?: string | null) => {
    const parsed = parsePaymentDate(raw);
    if (parsed) return parsed.toISOString();
    return raw ? raw.toString().trim() : null;
};

const computeDaysLate = (dueDate?: string | null) => {
    const parsed = parsePaymentDate(dueDate);
    if (!parsed || Number.isNaN(parsed.getTime())) return null;

    const diff = differenceInCalendarDays(new Date(), parsed);
    return diff > 0 ? diff : 0;
};

export const getPaymentEntries = async (): Promise<PaymentEntry[]> => {
    return getCachedOrLoad(PAYMENT_CACHE_KEY, async () => {

    const snapshot = await getDocs(query(collections.paymentEntries, orderBy('createdAt', 'desc')));
    const payments = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const parsed: PaymentEntry = {
            id: docSnap.id,
            advisorId: data.advisorId,
            advisorName: data.advisorName,
            company: data.company,
            tipo: data.tipo,
            comprobanteNumber: data.comprobanteNumber,
            razonSocial: data.razonSocial,
            amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || undefined,
            pendingAmount: typeof data.pendingAmount === 'number' ? data.pendingAmount : Number(data.pendingAmount) || undefined,
            issueDate: timestampToISO((data as any).issueDate) || data.issueDate,
            dueDate: timestampToISO((data as any).dueDate) || data.dueDate,
            daysLate: computeDaysLate(timestampToISO((data as any).dueDate) || data.dueDate),
            status: (data.status as PaymentStatus) || 'Pendiente',
            notes: data.notes,
            nextContactAt: timestampToISO((data as any).nextContactAt) || data.nextContactAt || null,
            lastExplanationRequestAt:
                timestampToISO((data as any).lastExplanationRequestAt) || (data as any).lastExplanationRequestAt,
            lastExplanationRequestById: (data as any).lastExplanationRequestById,
            lastExplanationRequestByName: (data as any).lastExplanationRequestByName,
            explanationRequestNote: (data as any).explanationRequestNote,
            createdAt: timestampToISO((data as any).createdAt) || new Date().toISOString(),
            updatedAt: timestampToISO((data as any).updatedAt),
        };
        return parsed;
    });

    return payments;
    });
};

export const getPendingPaymentEntries = async (): Promise<PaymentEntry[]> => {
    return getCachedOrLoad(PENDING_PAYMENT_CACHE_KEY, async () => {

    // 🟢 ESTRATEGIA LIGERA: Traemos exclusivamente la mora
    const q = query(
        collections.paymentEntries,
        where('status', 'in', ['Pendiente', 'Reclamado', 'Incobrable']),
        orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const payments = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const parsed: PaymentEntry = {
            id: docSnap.id,
            advisorId: data.advisorId,
            advisorName: data.advisorName,
            company: data.company,
            tipo: data.tipo,
            comprobanteNumber: data.comprobanteNumber,
            razonSocial: data.razonSocial,
            amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || undefined,
            pendingAmount: typeof data.pendingAmount === 'number' ? data.pendingAmount : Number(data.pendingAmount) || undefined,
            issueDate: timestampToISO((data as any).issueDate) || data.issueDate,
            dueDate: timestampToISO((data as any).dueDate) || data.dueDate,
            daysLate: computeDaysLate(timestampToISO((data as any).dueDate) || data.dueDate),
            status: (data.status as PaymentStatus) || 'Pendiente',
            notes: data.notes,
            nextContactAt: timestampToISO((data as any).nextContactAt) || data.nextContactAt || null,
            lastExplanationRequestAt:
                timestampToISO((data as any).lastExplanationRequestAt) || (data as any).lastExplanationRequestAt,
            lastExplanationRequestById: (data as any).lastExplanationRequestById,
            lastExplanationRequestByName: (data as any).lastExplanationRequestByName,
            explanationRequestNote: (data as any).explanationRequestNote,
            createdAt: timestampToISO((data as any).createdAt) || new Date().toISOString(),
            updatedAt: timestampToISO((data as any).updatedAt),
        };
        return parsed;
    });

    return payments;
    });
};

export const replacePaymentEntriesForAdvisor = async (
    advisorId: string,
    advisorName: string,
    rows: Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[],
    userId: string,
    userName: string,
) => {
    const existingQuery = query(collections.paymentEntries, where('advisorId', '==', advisorId));
    const existingSnap = await getDocs(existingQuery);

    const batch = writeBatch(db);
    const existingEntries = existingSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const comprobanteNumber = typeof data.comprobanteNumber === 'string'
            ? data.comprobanteNumber.trim()
            : '';

        return {
            ref: docSnap.ref,
            comprobanteNumber: comprobanteNumber || null,
        };
    });

    const existingMap = existingEntries.reduce((acc, entry) => {
        if (entry.comprobanteNumber) acc.set(entry.comprobanteNumber, entry.ref);
        return acc;
    }, new Map<string, any>());

    const existingNumbers = new Set(
        existingEntries
            .map((entry) => entry.comprobanteNumber)
            .filter((value): value is string => Boolean(value)),
    );

    const incomingNumbers = new Set(
        rows
            .map((row) => (row.comprobanteNumber || '').trim())
            .filter(Boolean),
    );

    const entriesToDelete = existingEntries.filter(
        (entry) => entry.comprobanteNumber && !incomingNumbers.has(entry.comprobanteNumber),
    );

    entriesToDelete.forEach((entry) => batch.delete(entry.ref));

    const rowsToInsert = rows.filter((row) => {
        const comprobante = (row.comprobanteNumber || '').trim();
        if (!comprobante) return true;
        return !existingNumbers.has(comprobante);
    });

    const upsertPayload = (row: typeof rows[number]) => ({
        advisorId,
        advisorName,
        company: row.company,
        tipo: row.tipo || null,
        comprobanteNumber: row.comprobanteNumber,
        razonSocial: row.razonSocial,
        amount: row.amount ?? null,
        pendingAmount: row.pendingAmount ?? null,
        issueDate: row.issueDate || null,
        dueDate: row.dueDate || null,
        daysLate: computeDaysLate(row.dueDate),
        updatedAt: serverTimestamp(),
    });

    rows.forEach((row) => {
        const comprobante = (row.comprobanteNumber || '').trim();
        const normalizedIssueDate = normalizePaymentDate(row.issueDate);
        const normalizedDueDate = normalizePaymentDate(row.dueDate);
        const payload = {
            ...upsertPayload(row),
            issueDate: normalizedIssueDate,
            dueDate: normalizedDueDate,
            daysLate: computeDaysLate(normalizedDueDate),
        };
        if (comprobante && existingMap.has(comprobante)) {
            batch.update(existingMap.get(comprobante), payload);
        } else {
            const docRef = doc(collections.paymentEntries);
            batch.set(docRef, {
                ...payload,
                status: 'Pendiente' as PaymentStatus,
                notes: row.notes || '',
                nextContactAt: row.nextContactAt || null,
                createdAt: serverTimestamp(),
            });
        }
    });

    await batch.commit();
    invalidateCache(PAYMENT_CACHE_KEY);

    await logActivity({
        userId,
        userName,
        ownerName: advisorName,
        type: 'update',
        entityType: 'invoice',
        entityId: advisorId,
        entityName: 'Pagos',
        details: `actualizó la lista de pagos del asesor ${advisorName}`,
        timestamp: new Date().toISOString(),
    });
};

export const updatePaymentEntry = async (
    paymentId: string,
    updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
    audit?: { userId?: string; userName?: string; ownerName?: string; details?: string },
) => {
    const docRef = doc(collections.paymentEntries, paymentId);
    await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
    });
    invalidateCache(PAYMENT_CACHE_KEY);

    if (audit?.userId && audit?.userName) {
        await logActivity({
            userId: audit.userId,
            userName: audit.userName,
            ownerName: audit.ownerName,
            type: 'update',
            entityType: 'payment',
            entityId: paymentId,
            entityName: 'Mora',
            details: audit.details || 'Actualizó un registro de mora',
            timestamp: new Date().toISOString(),
        });
    }
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
    const docRef = doc(collections.paymentEntries, paymentId);
    await updateDoc(docRef, {
        lastExplanationRequestAt: serverTimestamp(),
        lastExplanationRequestById: params.requestedById,
        lastExplanationRequestByName: params.requestedByName,
        explanationRequestNote: params.note || null,
        updatedAt: serverTimestamp(),
    });
    invalidateCache(PAYMENT_CACHE_KEY);

    await logActivity({
        userId: params.requestedById,
        userName: params.requestedByName,
        ownerName: params.advisorName,
        type: 'comment',
        entityType: 'payment',
        entityId: paymentId,
        entityName: params.comprobanteNumber ? `Comprobante ${params.comprobanteNumber}` : 'Mora',
        details:
            params.note
                ? `Solicitó aclaración (${params.note})`
                : 'Solicitó aclaración al asesor sobre el registro de mora.',
        timestamp: new Date().toISOString(),
    });
};

export const deletePaymentEntries = async (paymentIds: string[]) => {
    if (paymentIds.length === 0) return;

    const batch = writeBatch(db);
    paymentIds.forEach((id) => {
        const docRef = doc(collections.paymentEntries, id);
        batch.delete(docRef);
    });

    await batch.commit();
    invalidateCache(PAYMENT_CACHE_KEY);
};


// --- Agency Functions ---

export const getAgencies = async (): Promise<Agency[]> => {
    const cachedData = getFromCache('agencies');
    if (cachedData) return cachedData;
    
    const snapshot = await getDocs(query(collections.agencies, orderBy("name")));
    const agencies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agency));
    setInCache('agencies', agencies);
    return agencies;
};

export const createAgency = async (
    agencyData: Omit<Agency, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const newAgencyData = {
        ...agencyData,
        createdAt: serverTimestamp(),
        createdBy: userId,
    };
    const docRef = await addDoc(collections.agencies, newAgencyData);
    invalidateCache('agencies');
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'agency',
        entityId: docRef.id,
        entityName: agencyData.name,
        details: `creó la agencia <strong>${agencyData.name}</strong>`,
        ownerName: userName
    });

    return docRef.id;
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
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as User;
  }
  return null;
}

export async function updateUserProfile(uid: string, data: Partial<User>) {
  const userRef = doc(db, 'users', uid);
  // Usamos set con merge: true para crear el documento si no existe, o actualizar si existe
  await setDoc(userRef, data, { merge: true });
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
    const snapshot = await getDocs(collections.users);
    let users = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as User));
    if (role) {
        users = users.filter(u => u.role === role);
    }
    
    const sorted = users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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

    const userRef = doc(collections.users, userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    const user = { id: snap.id, ...snap.data() } as User;
    setInCache(cacheKey, user);
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
      const source = query(collections.clients, orderBy("denominacion"));
      const snapshot = options.forceServer ? await getDocs(source) : await getDocsPreferCache(source);
      return snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return { 
          id: doc.id, 
          ...data,
          denominacion: data.denominacion ? toTitleCase(data.denominacion) : data.denominacion,
          razonSocial: data.razonSocial ? toTitleCase(data.razonSocial) : data.razonSocial,
          razonSocialTango: data.razonSocialTango ? toTitleCase(data.razonSocialTango) : data.razonSocialTango,
          newClientDate: data.newClientDate instanceof Timestamp ? data.newClientDate.toDate().toISOString() : data.newClientDate,
        } as Client
      });
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
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
        
        data.createdAt = convertTimestamp(data.createdAt);
        data.updatedAt = convertTimestamp(data.updatedAt);
        data.newClientDate = convertTimestamp(data.newClientDate);
        if (data.deactivationHistory) {
            data.deactivationHistory = data.deactivationHistory.map(convertTimestamp);
        }

        return { id: docSnap.id, ...data } as Client;
    }
    return null;
};

export const createClient = async (
    clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>,
    userId?: string,
    userName?: string
): Promise<string> => {
    // 🟢 NORMALIZAMOS LOS TEXTOS AQUÍ (Lo que hicimos antes)
    const denominacionLimpia = toTitleCase(clientData.denominacion);
    const razonSocialLimpia = clientData.razonSocial ? toTitleCase(clientData.razonSocial) : '';

    const newClientData: any = {
        ...clientData,
        denominacion: denominacionLimpia,
        razonSocial: razonSocialLimpia,
        personIds: [],
        createdAt: serverTimestamp(),
        isDeactivated: false,
        deactivationHistory: [],
    };
    if (userId && userName) {
        newClientData.ownerId = userId;
        newClientData.ownerName = userName;
    }

    if (clientData.isNewClient) {
        newClientData.newClientDate = serverTimestamp();
    } else {
        newClientData.isNewClient = false;
    }
    
    if (newClientData.agencyId === undefined) {
        delete newClientData.agencyId;
    }

    const docRef = await addDoc(collections.clients, newClientData);
    
    // 🟢 EL TRUCO EN APLICACIÓN PARA EL CLIENTE:
    const cacheData = {
        ...newClientData,
        createdAt: new Date().toISOString(),
        newClientDate: newClientData.isNewClient ? new Date().toISOString() : undefined
    };
    mutateCacheArray('clients', docRef.id, cacheData, 'add', (a, b) => a.denominacion.localeCompare(b.denominacion));
    
    if (userId && userName) {
        await logActivity({
            userId,
            userName,
            type: 'create',
            entityType: 'client',
            entityId: docRef.id,
            entityName: clientData.denominacion,
            details: `creó el cliente <a href="/clients/${docRef.id}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
            ownerName: userName
        });
    }
    if (userId && userName) {
        try {
            await autoUpdateCoachingSession(userId, userName, 'client', docRef.id, clientData.denominacion, 'Nuevo cliente cargado en el sistema.');
        } catch (e) {
            console.error('Error auto-updating coaching:', e);
        }
    }

    return docRef.id;
};

export const updateClient = async (
    id: string, 
    data: Partial<Omit<Client, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'clients', id);
    const originalDoc = await getDoc(docRef);
    if (!originalDoc.exists()) throw new Error('Client not found');
    const originalData = originalDoc.data() as Client;

    const updateData: {[key: string]: any} = { ...data };

    if (updateData.denominacion) updateData.denominacion = toTitleCase(updateData.denominacion);
    if (updateData.razonSocial) updateData.razonSocial = toTitleCase(updateData.razonSocial);
    
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
            delete updateData[key];
        }
    });

    if (data.isDeactivated === true && originalData.isDeactivated === false) {
        updateData.deactivationHistory = arrayUnion(serverTimestamp());
    }
    
    await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
    });
    mutateCacheArray('clients', id, updateData, 'update');
    
    const newOwnerName = (data.ownerName !== undefined) ? data.ownerName : originalData.ownerName;
    const clientName = data.denominacion || originalData.denominacion;

    let details = `actualizó el cliente <a href="/clients/${id}" class="font-bold text-primary hover:underline">${clientName}</a>`;
    if (data.ownerId && data.ownerId !== originalData.ownerId) {
        details = `reasignó el cliente <strong>${clientName}</strong> a <strong>${newOwnerName}</strong>`;
    }
    if (data.isDeactivated === true && !originalData.isDeactivated) {
        details = `dio de baja al cliente <strong>${clientName}</strong>`;
    }
    if (data.isDeactivated === false && originalData.isDeactivated) {
        details = `reactivó al cliente <strong>${clientName}</strong>`;
    }


    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'client',
        entityId: id,
        entityName: clientName,
        details: details,
        ownerName: newOwnerName
    });
};

export const updateClientTangoMapping = async (
    id: string,
    data: ClientTangoUpdate,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'clients', id);
    const originalDoc = await getDoc(docRef);
    if (!originalDoc.exists()) throw new Error('Client not found');
    const originalData = originalDoc.data() as Client;

    const updatePayload: Record<string, any> = {
        updatedAt: serverTimestamp(),
    };

    if (data.cuit && data.cuit.trim().length > 0) {
        updatePayload.cuit = data.cuit.trim();
    }
    if (data.razonSocialTango && data.razonSocialTango.trim().length > 0) {
        updatePayload.razonSocialTango = toTitleCase(data.razonSocialTango.trim());
    }
    if (data.tangoCompanyId && data.tangoCompanyId.toString().trim().length > 0) {
        updatePayload.tangoCompanyId = data.tangoCompanyId.toString().trim();
        updatePayload.idTango = updatePayload.tangoCompanyId;
    } else if (data.idTango && data.idTango.toString().trim().length > 0) {
        updatePayload.idTango = data.idTango.toString().trim();
        updatePayload.tangoCompanyId = updatePayload.idTango;
    }
    if (data.email && data.email.trim().length > 0) {
        updatePayload.email = data.email.trim();
    }
    if (data.phone && data.phone.trim().length > 0) {
        updatePayload.phone = data.phone.trim();
    }
    if (data.rubro && data.rubro.trim().length > 0) {
        updatePayload.rubro = data.rubro.trim();
    }
    if (data.razonSocial && data.razonSocial.trim().length > 0) {
        updatePayload.razonSocial = toTitleCase(data.razonSocial.trim());
    }
    if (data.denominacion && data.denominacion.trim().length > 0) {
        updatePayload.denominacion = toTitleCase(data.denominacion.trim());
    }
    if (data.idAireSrl && data.idAireSrl.toString().trim().length > 0) {
        updatePayload.idAireSrl = data.idAireSrl.toString().trim();
    }
    if (data.idAireDigital && data.idAireDigital.toString().trim().length > 0) {
        updatePayload.idAireDigital = data.idAireDigital.toString().trim();
    }
    if (data.idAire && data.idAire.toString().trim().length > 0) {
        updatePayload.idAire = data.idAire.toString().trim();
    }
    if (data.condicionIVA && data.condicionIVA.trim().length > 0) {
        updatePayload.condicionIVA = data.condicionIVA.trim() as any;
    }
    if (data.provincia && data.provincia.trim().length > 0) {
        updatePayload.provincia = data.provincia.trim();
    }
    if (data.localidad && data.localidad.trim().length > 0) {
        updatePayload.localidad = data.localidad.trim();
    }
    if (data.tipoEntidad && data.tipoEntidad.trim().length > 0) {
        updatePayload.tipoEntidad = data.tipoEntidad.trim() as any;
    }
    if (data.observaciones && data.observaciones.trim().length > 0) {
        updatePayload.observaciones = data.observaciones.trim();
    }

    await updateDoc(docRef, updatePayload);
    invalidateCache('clients');

    const detailsParts = [];
    if (updatePayload.cuit && updatePayload.cuit !== originalData.cuit) {
        detailsParts.push(`CUIT <strong>${updatePayload.cuit}</strong>`);
    }
    if (updatePayload.tangoCompanyId && updatePayload.tangoCompanyId !== originalData.tangoCompanyId) {
        detailsParts.push(`ID de Tango <strong>${updatePayload.tangoCompanyId}</strong>`);
    }
    if (updatePayload.email && updatePayload.email !== originalData.email) {
        detailsParts.push(`Email <strong>${updatePayload.email}</strong>`);
    }
    if (updatePayload.phone && updatePayload.phone !== originalData.phone) {
        detailsParts.push(`Teléfono <strong>${updatePayload.phone}</strong>`);
    }
    if (updatePayload.rubro && updatePayload.rubro !== originalData.rubro) {
        detailsParts.push(`Rubro <strong>${updatePayload.rubro}</strong>`);
    }
    if (updatePayload.razonSocial && updatePayload.razonSocial !== originalData.razonSocial) {
        detailsParts.push(`Razón Social <strong>${updatePayload.razonSocial}</strong>`);
    }
    if (updatePayload.denominacion && updatePayload.denominacion !== originalData.denominacion) {
        detailsParts.push(`Denominación <strong>${updatePayload.denominacion}</strong>`);
    }
    if (updatePayload.idAireSrl && updatePayload.idAireSrl !== (originalData as any).idAireSrl) {
        detailsParts.push(`ID Aire SRL <strong>${updatePayload.idAireSrl}</strong>`);
    }
    if (updatePayload.idAireDigital && updatePayload.idAireDigital !== (originalData as any).idAireDigital) {
        detailsParts.push(`ID Aire Digital <strong>${updatePayload.idAireDigital}</strong>`);
    }
    if (updatePayload.idAire && updatePayload.idAire !== (originalData as any).idAire) {
        detailsParts.push(`ID Aire <strong>${updatePayload.idAire}</strong>`);
    }
    if (updatePayload.condicionIVA && updatePayload.condicionIVA !== originalData.condicionIVA) {
        detailsParts.push(`Condición IVA <strong>${updatePayload.condicionIVA}</strong>`);
    }
    if (updatePayload.provincia && updatePayload.provincia !== originalData.provincia) {
        detailsParts.push(`Provincia <strong>${updatePayload.provincia}</strong>`);
    }
    if (updatePayload.localidad && updatePayload.localidad !== originalData.localidad) {
        detailsParts.push(`Localidad <strong>${updatePayload.localidad}</strong>`);
    }
    if (updatePayload.tipoEntidad && updatePayload.tipoEntidad !== originalData.tipoEntidad) {
        detailsParts.push(`Tipo de Entidad <strong>${updatePayload.tipoEntidad}</strong>`);
    }
    if (updatePayload.observaciones && updatePayload.observaciones !== originalData.observaciones) {
        detailsParts.push(`Observaciones`);
    }
    const detailText = detailsParts.length > 0 ? detailsParts.join(' y ') : 'datos de Tango';

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'client',
        entityId: id,
        entityName: originalData.denominacion,
        details: `actualizó ${detailText} para <a href="/clients/${id}" class="font-bold text-primary hover:underline">${originalData.denominacion}</a>`,
        ownerName: originalData.ownerName,
    });
};

export const deleteClient = async (
    id: string,
    userId: string,
    userName: string
): Promise<void> => {
    const clientRef = doc(db, 'clients', id);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) throw new Error("Client not found");

    const clientData = clientSnap.data() as Client;
    const batch = writeBatch(db);

    const oppsQuery = query(collections.opportunities, where('clientId', '==', id));
    const oppsSnap = await getDocs(oppsQuery);
    oppsSnap.forEach(doc => batch.delete(doc.ref));

    const peopleQuery = query(collections.people, where('clientIds', 'array-contains', id));
    const peopleSnap = await getDocs(peopleQuery);
    peopleSnap.forEach(doc => batch.delete(doc.ref));
    
    const clientActivitiesQuery = query(collections.clientActivities, where('clientId', '==', id));
    const clientActivitiesSnap = await getDocs(clientActivitiesQuery);
    clientActivitiesSnap.forEach(doc => batch.delete(doc.ref));

    const clientOpps = oppsSnap.docs.map(d => d.id);
    if (clientOpps.length > 0) {
        const invoicesQuery = query(collections.invoices, where('opportunityId', 'in', clientOpps));
        const invoicesSnap = await getDocs(invoicesQuery);
        invoicesSnap.forEach(doc => batch.delete(doc.ref));
    }

    batch.delete(clientRef);

    await batch.commit();
    mutateCacheArray('clients', id, null, 'delete');
    
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'client',
        entityId: id,
        entityName: clientData.denominacion,
        details: `eliminó el cliente <strong>${clientData.denominacion}</strong> y toda su información asociada`,
        ownerName: clientData.ownerName
    });
};

export const bulkDeleteClients = async (clientIds: string[], userId: string, userName: string): Promise<void> => {
    if (!clientIds || clientIds.length === 0) return;
  
    const batch = writeBatch(db);
  
    for (const clientId of clientIds) {
      const clientRef = doc(db, 'clients', clientId);
      batch.delete(clientRef);
  
      const oppsQuery = query(collections.opportunities, where('clientId', '==', clientId));
      const oppsSnap = await getDocs(oppsQuery);
      oppsSnap.forEach(doc => batch.delete(doc.ref));
  
      const activitiesQuery = query(collections.clientActivities, where('clientId', '==', clientId));
      const activitiesSnap = await getDocs(activitiesQuery);
      activitiesSnap.forEach(doc => batch.delete(doc.ref));
  
      const peopleQuery = query(collections.people, where('clientIds', 'array-contains', clientId));
      const peopleSnap = await getDocs(peopleQuery);
      peopleSnap.forEach(doc => batch.delete(doc.ref));

      const clientOpps = oppsSnap.docs.map(d => d.id);
      if (clientOpps.length > 0) {
        const invoicesQuery = query(collections.invoices, where('opportunityId', 'in', clientOpps));
        const invoicesSnap = await getDocs(invoicesQuery);
        invoicesSnap.forEach(doc => batch.delete(doc.ref));
      }
    }
  
    await batch.commit();
    clientIds.forEach(clientId => mutateCacheArray('clients', clientId, null, 'delete'));
    
    await logActivity({
      userId,
      userName,
      type: 'delete',
      entityType: 'client',
      entityId: 'multiple',
      entityName: 'multiple',
      details: `eliminó <strong>${clientIds.length}</strong> clientes de forma masiva`,
      ownerName: userName,
    });
};


export const bulkUpdateClients = async (
    updates: { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[],
    userId: string,
    userName: string
): Promise<void> => {
    const batch = writeBatch(db);

    for (const { id, data } of updates) {
        const docRef = doc(db, 'clients', id);
        batch.update(docRef, { ...data, updatedAt: serverTimestamp() });
    }

    await batch.commit();
    invalidateCache('clients');
    
    const isReassign = updates.length > 0 && updates[0].data.ownerName;

    if (isReassign) {
        const newOwnerName = updates[0].data.ownerName;
        await logActivity({
            userId,
            userName,
            type: 'update',
            entityType: 'client',
            entityId: 'multiple',
            entityName: 'multiple',
            details: `reasignó <strong>${updates.length}</strong> clientes a <strong>${newOwnerName}</strong>`,
            ownerName: newOwnerName!
        });
    }
};

export const getPeopleByClientId = async (clientId: string): Promise<Person[]> => {
    const q = query(collections.people, where("clientIds", "array-contains", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
}

export const createPerson = async (
    personData: Omit<Person, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const docRef = await addDoc(collections.people, {
        ...personData,
        createdAt: serverTimestamp()
    });
    invalidateCache('people');
    
    if (personData.clientIds) {
        for (const clientId of personData.clientIds) {
            const clientRef = doc(db, 'clients', clientId);
            const clientSnap = await getDoc(clientRef);
            if (clientSnap.exists()) {
                const clientData = clientSnap.data() as Client;
                await updateDoc(clientRef, {
                    personIds: arrayUnion(docRef.id)
                });
                invalidateCache('clients');

                 await logActivity({
                    userId,
                    userName,
                    type: 'create',
                    entityType: 'person',
                    entityId: docRef.id,
                    entityName: personData.name,
                    details: `creó el contacto <strong>${personData.name}</strong> para el cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
                    ownerName: clientData.ownerName
                });
            }
        }
    }
    
    return docRef.id;
};

export const updatePerson = async (
    id: string, 
    data: Partial<Omit<Person, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'people', id);
    const originalDoc = await getDoc(docRef);
    const originalData = originalDoc.data() as Person;

    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
    invalidateCache('people');

    if (originalData.clientIds && originalData.clientIds.length > 0) {
        const clientSnap = await getDoc(doc(db, 'clients', originalData.clientIds[0]));
        if (clientSnap.exists()) {
            const clientData = clientSnap.data() as Client;
            await logActivity({
                userId,
                userName,
                type: 'update',
                entityType: 'person',
                entityId: id,
                entityName: data.name || originalData.name,
                details: `actualizó el contacto <strong>${data.name || originalData.name}</strong>`,
                ownerName: clientData.ownerName
            });
        }
    }
};

export const deletePerson = async (
    id: string,
    userId: string,
    userName: string
): Promise<void> => {
    const personRef = doc(db, 'people', id);
    const personSnap = await getDoc(personRef);
    if (!personSnap.exists()) throw new Error("Person not found");

    const personData = personSnap.data() as Person;
    
    await deleteDoc(personRef);
    invalidateCache('people');

    if (personData.clientIds && personData.clientIds.length > 0) {
        const clientSnap = await getDoc(doc(db, 'clients', personData.clientIds[0]));
        const clientOwnerName = clientSnap.exists() ? (clientSnap.data() as Client).ownerName : 'N/A';
        const clientName = clientSnap.exists() ? (clientSnap.data() as Client).denominacion : 'N/A';

         await logActivity({
            userId,
            userName,
            type: 'delete',
            entityType: 'person',
            entityId: id,
            entityName: personData.name,
            details: `eliminó el contacto <strong>${personData.name}</strong> del cliente <a href="/clients/${personData.clientIds[0]}" class="font-bold text-primary hover:underline">${clientName}</a>`,
            ownerName: clientOwnerName
        });
    }
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

    // 🟢 ESTRATEGIA LIGERA: Traemos etapas activas y solo las "Perdidas" recientes
    const activeStages = ['Nuevo', 'Propuesta', 'Negociación', 'Negociación a Aprobar', 'Cerrado - No Definido', 'Cerrado - Ganado'];
    
    const readDocs = options.forceServer ? getDocs : getDocsPreferCache;

    // Ejecutamos las consultas de las activas en paralelo
    const activeQueries = activeStages.map(stage => readDocs(query(collections.opportunities, where('stage', '==', stage))));
    
    // Traemos solo las Perdidas de los últimos 3 meses
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const lostQuery = readDocs(query(collections.opportunities, where('stage', '==', 'Cerrado - Perdido'), where('createdAt', '>=', threeMonthsAgo.toISOString())));

    const snapshots = await Promise.all([...activeQueries, lostQuery]) as any[];
    
    const opportunities: Opportunity[] = [];
    snapshots.forEach(snap => {
        snap.docs.forEach(doc => {
            opportunities.push(mapOpportunityDoc(doc));
        });
    });

    setInCache('opportunities', opportunities);
    return opportunities;
};

export const getAllOpportunities = async (): Promise<Opportunity[]> => {
    return getCachedOrLoad('all_opportunities', async () => {
        const snapshot = await getDocsPreferCache(collections.opportunities);
        return snapshot.docs.map(mapOpportunityDoc);
    });
};


export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    return getCachedOrLoad(`opportunities_client_${clientId}`, async () => {
        const q = query(collections.opportunities, where('clientId', '==', clientId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(mapOpportunityDoc);
    });
};

export const getOpportunitiesForUser = async (userId: string): Promise<Opportunity[]> => {
    return getCachedOrLoad(`opportunities_user_${userId}`, async () => {
        const allClients = await getClients();
        const userClientIds = new Set(allClients.filter(c => c.ownerId === userId).map(c => c.id));

        if (userClientIds.size === 0) return [];

        // Firestore limits the `in` operator to 30 values, so chunk the client ids
        // and merge the results to avoid query failures for advisors with many clients.
        const clientIds = Array.from(userClientIds);
        const chunks: string[][] = [];

        for (let i = 0; i < clientIds.length; i += 30) {
            chunks.push(clientIds.slice(i, i + 30));
        }

        const results = await Promise.all(
            chunks.map(ids => getDocs(query(collections.opportunities, where('clientId', 'in', ids))))
        );

        return results.flatMap(snapshot => snapshot.docs.map(mapOpportunityDoc));
    });
};

export const createOpportunity = async (
    opportunityData: Omit<Opportunity, 'id'>,
    userId: string,
    userName: string,
    ownerName: string
): Promise<string> => {
    if (opportunityData.stage === 'Cerrado - Ganado') {
        if (!opportunityData.startDate || !opportunityData.endDate) {
            throw new Error('La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.');
        }
        if (parseISO(opportunityData.endDate) < parseISO(opportunityData.startDate)) {
            throw new Error('La fecha de fin del contrato no puede ser anterior a la fecha de inicio.');
        }
    }
    const clientSnap = await getDoc(doc(db, 'clients', opportunityData.clientId));
    if (!clientSnap.exists()) throw new Error("Client not found for opportunity creation");

    const dataToSave: any = {
        ...opportunityData,
        createdAt: serverTimestamp(),
        stageChangedAt: serverTimestamp()
    };

    if (dataToSave.agencyId === undefined) {
        delete dataToSave.agencyId;
    }
    delete dataToSave.pautados;


    const docRef = await addDoc(collections.opportunities, dataToSave);
    
    // 🟢 MUTADOR CORRECTO PARA OPORTUNIDADES (Con el truco de la fecha local)
    const cacheData = {
        ...dataToSave,
        createdAt: new Date().toISOString(),
        stageChangedAt: new Date().toISOString()
    };
    mutateCacheArray('opportunities', docRef.id, cacheData, 'add', (a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });
    invalidateOpportunityCaches([opportunityData.clientId]);

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'opportunity',
        entityId: docRef.id,
        entityName: opportunityData.title,
        details: `creó la oportunidad <strong>${opportunityData.title}</strong> para el cliente <a href="/clients/${opportunityData.clientId}" class="font-bold text-primary hover:underline">${opportunityData.clientName}</a>`,
        ownerName: ownerName
    });
    try {
        const observationText = opportunityData.observaciones?.trim() ? ` - Observación: ${opportunityData.observaciones.trim()}` : '';
        await autoUpdateCoachingSession(userId, userName, 'client', opportunityData.clientId, opportunityData.clientName, `Nueva propuesta: ${opportunityData.title} - Valor: $${opportunityData.value}${observationText}`);
    } catch (e) {
        console.error('Error auto-updating coaching:', e);
    }

    return docRef.id;
};

// Crear Oportunidad Rápida (para cuando el usuario escribe una nueva)
export const createQuickOpportunity = async (title: string, clientId: string, clientName: string, userId: string) => {
    // Implementación básica para crear la oportunidad contenedora
    const docRef = await addDoc(collection(db, "opportunities"), {
        title,
        clientId,
        clientName,
        stage: "Propuesta",
        value: 0,
        createdAt: new Date().toISOString(),
        ownerId: userId
    });
    invalidateOpportunityCaches([clientId]);
    return docRef.id;
}

const createCommercialItemsFromOpportunity = async (opportunity: Opportunity, userId: string, userName: string) => {
    if (!opportunity.ordenesPautado || opportunity.ordenesPautado.length === 0) {
        return;
    }

    const batch = writeBatch(db);
    const newItems: Omit<CommercialItem, 'id'>[] = [];

    for (const orden of opportunity.ordenesPautado) {
        if (!orden.fechaInicio || !orden.fechaFin || !orden.programas || orden.programas.length === 0) continue;

        const startDate = parseDateWithTimezone(orden.fechaInicio);
        const endDate = parseDateWithTimezone(orden.fechaFin);
        if (!startDate || !endDate) continue;

        let currentDate = startDate;

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
            if (orden.dias?.includes(dayOfWeek)) {
                for (const programName of orden.programas) {
                    const program = (await getPrograms()).find(p => p.name === programName);
                    if (program) {
                        for (let i = 0; i < (orden.repeticiones || 1); i++) {
                             const item: Omit<CommercialItem, 'id'> = {
                                programId: program.id,
                                date: format(currentDate, 'yyyy-MM-dd'),
                                type: orden.tipoPauta === 'Spot' ? 'Pauta' : orden.tipoPauta,
                                title: orden.tipoPauta === 'PNT' ? orden.textoPNT || opportunity.title : opportunity.title,
                                description: orden.textoPNT || opportunity.title,
                                status: 'Vendido',
                                clientId: opportunity.clientId,
                                clientName: opportunity.clientName,
                                opportunityId: opportunity.id,
                                opportunityTitle: opportunity.title,
                                createdBy: userId,
                            };
                            newItems.push(item);
                        }
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }
    
    if (newItems.length > 0) {
        for (const itemData of newItems) {
            const docRef = doc(collection(db, 'commercial_items'));
            batch.set(docRef, { ...itemData, createdAt: serverTimestamp() });
        }
        await batch.commit();
        invalidateCache();

        await logActivity({
            userId,
            userName,
            type: 'create',
            entityType: 'commercial_item_series',
            entityId: opportunity.id,
            entityName: opportunity.title,
            details: `generó <strong>${newItems.length}</strong> pautas comerciales desde la oportunidad <strong>${opportunity.title}</strong>`,
            ownerName: userName,
        });
    }
};

export const updateOpportunity = async (
    id: string, 
    data: Partial<Omit<Opportunity, 'id'>>,
    userId: string,
    userName: string,
    ownerName: string,
    pendingInvoices?: Omit<Invoice, 'id' | 'opportunityId'>[],
    options?: { manageContractPeriods?: boolean }
): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const originalData = docSnap.data() as Opportunity;

    const resultingStage = data.stage || originalData.stage;
    const hasStartDateUpdate = Object.prototype.hasOwnProperty.call(data, 'startDate');
    const hasEndDateUpdate = Object.prototype.hasOwnProperty.call(data, 'endDate');
    const nextStartDate = hasStartDateUpdate ? data.startDate : originalData.startDate;
    const nextEndDate = hasEndDateUpdate ? data.endDate : originalData.endDate;
    const isTransitioningToWon = resultingStage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado';
    if (isTransitioningToWon && (!nextStartDate || !nextEndDate)) {
            throw new Error('La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.');
    }
    if (!!nextStartDate !== !!nextEndDate) {
        throw new Error('La fecha de inicio y fin de la vigencia deben cargarse juntas.');
    }
    if (nextStartDate && nextEndDate && parseISO(nextEndDate) < parseISO(nextStartDate)) {
        throw new Error('La fecha de fin del contrato no puede ser anterior a la fecha de inicio.');
    }
    if (
        !options?.manageContractPeriods
        && originalData.startDate
        && originalData.endDate
        && ((typeof data.startDate === 'string' && data.startDate !== originalData.startDate)
          || (typeof data.endDate === 'string' && data.endDate !== originalData.endDate))
    ) {
        throw new Error('La vigencia inicial ya fue confirmada. Para extenderla, usá Renovar período.');
    }

    const clientSnap = await getDoc(doc(db, 'clients', originalData.clientId));
    if (!clientSnap.exists()) throw new Error("Client not found for opportunity update");

    const updateData: {[key: string]: any} = {
        ...data,
        updatedAt: serverTimestamp()
    };
    if (options?.manageContractPeriods && hasStartDateUpdate && !data.startDate) updateData.startDate = deleteField();
    if (options?.manageContractPeriods && hasEndDateUpdate && !data.endDate) updateData.endDate = deleteField();

    const originalHistory = Array.isArray(originalData.periodHistory) ? originalData.periodHistory : [];
    if (
        (originalData.stage as string) === 'Ganado (Recurrente)'
        && Array.isArray(data.periodHistory)
        && data.periodHistory.length >= originalHistory.length
    ) {
        updateData.stage = 'Cerrado - Ganado';
    }
    const submittedHistory = Array.isArray(data.periodHistory) ? data.periodHistory : originalHistory;
    if (options?.manageContractPeriods && Array.isArray(data.periodHistory)) {
        updateData.periodHistory = data.periodHistory;
    }
    const newRenewals = (options?.manageContractPeriods ? [] : submittedHistory.filter(period => !originalHistory.some(existing => (
        existing.startDate === period.startDate
        && existing.endDate === period.endDate
        && Number(existing.value || 0) === Number(period.value || 0)
    ))));
    const occupiedPeriods = [
        ...(nextStartDate && nextEndDate ? [{ startDate: nextStartDate, endDate: nextEndDate }] : []),
        ...(options?.manageContractPeriods ? [] : originalHistory),
    ];
    const periodsToValidate = options?.manageContractPeriods && Array.isArray(data.periodHistory)
        ? data.periodHistory
        : newRenewals;
    periodsToValidate.forEach(period => {
        if (!period.startDate || !period.endDate || parseISO(period.endDate) < parseISO(period.startDate)) {
            throw new Error('La renovación contiene una vigencia inválida.');
        }
        const overlaps = occupiedPeriods.some(existing => (
            period.startDate <= existing.endDate && period.endDate >= existing.startDate
        ));
        if (overlaps) throw new Error('La renovación se superpone con una vigencia ya registrada.');
        occupiedPeriods.push(period);
    });
    const isRenewal = newRenewals.length > 0;
    if (Array.isArray(data.periodHistory) && !options?.manageContractPeriods) {
        updateData.periodHistory = [...originalHistory, ...newRenewals];
    }
    if (isRenewal) {
        updateData.lastRenewedAt = serverTimestamp();
        updateData.lastRenewedById = userId;
        updateData.lastRenewedByName = userName;
        updateData.finalizationDate = deleteField();
    }
    if (!originalData.startDate && !originalData.endDate && nextStartDate && nextEndDate) {
        updateData.initialValidityConfirmedAt = serverTimestamp();
        updateData.initialValidityConfirmedById = userId;
        updateData.initialValidityConfirmedByName = userName;
    }

    if ('finalizationDate' in data && !data.finalizationDate) {
        updateData.finalizationDate = deleteField();
    }

    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
    });

    if ('manualUpdateHistory' in updateData) {
        delete updateData.manualUpdateHistory;
    }

    const stageChanged = data.stage && data.stage !== originalData.stage;
    if (stageChanged) {
        updateData.stageChangedAt = serverTimestamp();
    }

    if (typeof data.manualUpdateDate !== 'undefined') {
        if (!data.manualUpdateDate) {
            updateData.manualUpdateDate = deleteField();
        } else if (data.manualUpdateDate !== originalData.manualUpdateDate) {
            updateData.manualUpdateDate = data.manualUpdateDate;
            updateData.manualUpdateHistory = arrayUnion(data.manualUpdateDate);
        } else {
            delete updateData.manualUpdateDate;
        }
    }
    
    const bonusStateChanged = data.bonificacionEstado && data.bonificacionEstado !== originalData.bonificacionEstado && originalData.bonificacionEstado === 'Pendiente';
    if (bonusStateChanged) {
        if (originalData.stage === 'Negociación a Aprobar') {
            updateData.stage = 'Negociación';
        }
    }

    if (data.stage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado') {
        const fullOpportunityData = { ...originalData, ...data, id };
        await createCommercialItemsFromOpportunity(fullOpportunityData, userId, userName);
    }

    if (data.bonificacionDetalle !== undefined && !data.bonificacionDetalle.trim()) {
        updateData.bonificacionEstado = deleteField();
        updateData.bonificacionAutorizadoPorId = deleteField();
        updateData.bonificacionAutorizadoPorNombre = deleteField();
        updateData.bonificacionFechaAutorizacion = deleteField();
    }
    
    if (data.agencyId === '' || data.agencyId === undefined) {
        updateData.agencyId = deleteField();
    }
    
    updateData.pautados = deleteField();

    if ('createdAt' in updateData && typeof updateData.createdAt === 'string') {
        updateData.createdAt = Timestamp.fromDate(new Date(updateData.createdAt));
    }

    await updateDoc(docRef, updateData);
    
    // 🟢 MUTADOR CORRECTO PARA EDICIÓN DE OPORTUNIDADES (Con truco de fechas)
    const cacheData: Partial<Opportunity> & { updatedAt: string; stageChangedAt?: string } = {
        ...updateData,
        updatedAt: new Date().toISOString(),
    };
    if (stageChanged) {
        cacheData.stageChangedAt = new Date().toISOString();
    }
    if (isRenewal || ('finalizationDate' in data && !data.finalizationDate)) {
        cacheData.finalizationDate = undefined;
    }
    mutateCacheArray('opportunities', id, cacheData, 'update');
    invalidateOpportunityCaches([originalData.clientId, data.clientId]);

     if (pendingInvoices && pendingInvoices.length > 0) {
        for (const invoiceData of pendingInvoices) {
            await createInvoice({
                ...invoiceData,
                opportunityId: id,
            }, userId, userName, ownerName);
        }
    }

    const activityDetails = {
        userId,
        userName,
        entityType: 'opportunity' as const,
        entityId: id,
        entityName: originalData.title,
        ownerName: ownerName
    };

    const isFirstRenewal = isRenewal && originalHistory.length === 0;
    
    if (isRenewal || isFirstRenewal) {
         try {
             const latestRenewal = newRenewals[newRenewals.length - 1];
             const newStart = latestRenewal ? format(parseISO(latestRenewal.startDate), 'dd/MM/yyyy', { locale: es }) : '?';
             const newEnd = latestRenewal ? format(parseISO(latestRenewal.endDate), 'dd/MM/yyyy', { locale: es }) : '?';
             await autoUpdateCoachingSession(userId, userName, 'client', originalData.clientId, originalData.clientName, `Propuesta renovada: ${data.title || originalData.title} - Valor: $${data.value || originalData.value} - Período: ${newStart} al ${newEnd}`);
         } catch (e) {
             console.error('Error auto-updating coaching:', e);
         }
    }

    if (stageChanged) {
        await logActivity({
            ...activityDetails,
            type: 'stage_change',
            details: `cambió la etapa de <strong>${originalData.title}</strong> a <strong>${data.stage}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`,
        });
    } else {
        await logActivity({
            ...activityDetails,
            type: 'update',
            details: `actualizó la oportunidad <strong>${originalData.title}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`,
        });
    }
    const coachingChanges = [
        stageChanged ? `Etapa: ${data.stage}` : null,
        data.value !== undefined && data.value !== originalData.value ? `Valor: $${data.value}` : null,
        data.observaciones !== undefined && data.observaciones !== originalData.observaciones ? `Observación: ${data.observaciones || 'sin observaciones'}` : null,
        data.followUpDone !== undefined && data.followUpDone !== originalData.followUpDone ? `Qué hice: ${data.followUpDone || 'sin detalle'}` : null,
        data.followUpCurrent !== undefined && data.followUpCurrent !== originalData.followUpCurrent ? `En qué estamos: ${data.followUpCurrent || 'sin detalle'}` : null,
        data.followUpNext !== undefined && data.followUpNext !== originalData.followUpNext ? `Qué sigue: ${data.followUpNext || 'sin detalle'}` : null,
    ].filter(Boolean).join(' - ');

    if (coachingChanges) {
        try {
            const isClosingWonProposal = stageChanged && data.stage === 'Cerrado - Ganado';
            await autoUpdateCoachingSession(
                userId,
                userName,
                'client',
                originalData.clientId,
                originalData.clientName,
                `Actualización de propuesta: ${data.title || originalData.title} - ${coachingChanges}`,
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
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const opportunityData = docSnap.data() as Opportunity;

    const batch = writeBatch(db);

    const invoicesQuery = query(collections.invoices, where('opportunityId', '==', id));
    const invoicesSnap = await getDocs(invoicesQuery);
    invoicesSnap.forEach(doc => batch.delete(doc.ref));
    
    batch.delete(docRef);

    await batch.commit();
    
    // 🟢 MUTADOR CORRECTO PARA BORRADO DE OPORTUNIDADES
    mutateCacheArray('opportunities', id, null, 'delete');
    invalidateOpportunityCaches([opportunityData.clientId]);
    // Las facturas las seguimos invalidando completas por precaución a desincronizaciones en cascada
    invalidateCache('invoices');

    const clientSnap = await getDoc(doc(db, 'clients', opportunityData.clientId));
    const clientOwnerName = clientSnap.exists() ? (clientSnap.data() as Client).ownerName : 'N/A';

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'opportunity',
        entityId: id,
        entityName: opportunityData.title,
        details: `eliminó la oportunidad <strong>${opportunityData.title}</strong> del cliente ${opportunityData.clientName}`,
        ownerName: clientOwnerName
    });
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
    const q = query(collections.clientActivities, where('clientId', '==', clientId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertActivityDoc);
};

export const getAllClientActivities = async (): Promise<ClientActivity[]> => {
    const cachedData = getFromCache('client_activities');
    if (cachedData) return cachedData;

    const q = query(collections.clientActivities, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            timestamp: (data.timestamp as Timestamp).toDate().toISOString(),
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : data.dueDate,
            completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate().toISOString() : data.completedAt,
        } as ClientActivity;
    });
    setInCache('client_activities', activities);
    return activities;
};


export const createClientActivity = async (
    activityData: Omit<ClientActivity, 'id' | 'timestamp'>
): Promise<string> => {
    
    const dataToSave: any = {
      ...activityData,
      timestamp: serverTimestamp(),
    };

    if (activityData.isTask && activityData.dueDate) {
        dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
    } else {
       delete dataToSave.dueDate;
    }

    if (!activityData.opportunityId || activityData.opportunityId === 'none') {
        delete dataToSave.opportunityId;
        delete dataToSave.opportunityTitle;
    }

    if (!activityData.clientId) delete dataToSave.clientId;
    if (!activityData.clientName) delete dataToSave.clientName;
    if (!activityData.prospectId) delete dataToSave.prospectId;
    if (!activityData.prospectName) delete dataToSave.prospectName;


    const docRef = await addDoc(collections.clientActivities, dataToSave);
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
    return docRef.id;
};

export const updateClientActivity = async (
    id: string,
    data: Partial<Omit<ClientActivity, 'id'>>
): Promise<void> => {
    const docRef = doc(db, 'client-activities', id);
    const updateData: {[key: string]: any} = { ...data, updatedAt: serverTimestamp() };

    if (data.completed) {
        updateData.completedAt = serverTimestamp();
        updateData.completedByUserId = data.completedByUserId;
        updateData.completedByUserName = data.completedByUserName;
    } else if (data.completed === false) {
        updateData.completedAt = deleteField();
        updateData.completedByUserId = deleteField();
        updateData.completedByUserName = deleteField();
    }

    if (data.dueDate) {
        updateData.dueDate = Timestamp.fromDate(new Date(data.dueDate));
    }

    if (data.googleCalendarEventId === null) {
        updateData.googleCalendarEventId = deleteField();
    }

    await updateDoc(docRef, updateData);
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
        const q = query(collections.billingRequests, where('clientId', '==', clientId));
        const snap = await getDocs(q);
        const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingRequest));
        // 🟢 Ordenar por fecha cronológicamente ascendente (desde la más antigua)
        return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (e) {
        console.error(e);
        return [];
    }
};

export const getBillingRequestsByOrder = async (orderId: string) => {
    try {
        const q = query(collections.billingRequests, where('orderId', '==', orderId));
        const snap = await getDocs(q);
        const results = snap.docs.map(doc => doc.data() as BillingRequest);
        // 🟢 Ordenar por fecha cronológicamente ascendente (desde la más antigua)
        return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        const q = query(collection(db, 'advertising_orders'), where('opportunityId', '==', opportunityId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdvertisingOrder));
    } catch (error) {
        console.error("Error fetching ad orders:", error);
        return [];
    }
};

export const getAdvertisingOrdersByClientId = async (clientId: string): Promise<AdvertisingOrder[]> => {
    try {
        if (!clientId) return [];
        const q = query(collection(db, 'advertising_orders'), where('clientId', '==', clientId));
        const snapshot = await getDocsPreferCache(q);
        return snapshot.docs
            .map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() } as AdvertisingOrder))
            .sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''));
    } catch (error) {
        console.error("Error fetching ad orders by client:", error);
        return [];
    }
};

export const getAdvertisingOrdersWithEvent = async (): Promise<AdvertisingOrder[]> => {
    const snapshot = await getDocs(query(collection(db, 'advertising_orders'), where('event', '!=', '')));
    return snapshot.docs
        .map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() } as AdvertisingOrder))
        .filter(order => Boolean(order.event?.trim()));
};

export const getAdvertisingOrder = async (id: string): Promise<AdvertisingOrder | null> => {
    try {
        const docRef = doc(db, 'advertising_orders', id);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } as AdvertisingOrder : null;
    } catch (error) {
        console.error("Error fetching ad order:", error);
        return null;
    }
};

export const deleteAdvertisingOrder = async (id: string, userId: string, userName: string, clientName: string): Promise<void> => {
    try {
        const docRef = doc(db, 'advertising_orders', id);
        await deleteDoc(docRef);

        await logActivity({
            userId,
            userName,
            type: 'delete',
            entityType: 'opportunity' as any,
            entityId: id,
            entityName: 'Orden de Publicidad',
            details: `eliminó una orden de publicidad del cliente <strong>${clientName}</strong>`,
            ownerName: 'Sistema'
        });
    } catch (error) {
        console.error("Error deleting ad order:", error);
        throw error;
    }
};

export const getRecentAdvertisingOrders = async (): Promise<AdvertisingOrder[]> => {
    try {
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        const q = query(
            collection(db, 'advertising_orders'), 
            where('createdAt', '>=', twoMonthsAgo.toISOString()),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdvertisingOrder));
    } catch (error) {
        console.error("Error fetching recent ad orders:", error);
        return [];
    }
};

export const getAdvertisingOrdersForDateRange = async (rangeStart: Date, rangeEnd: Date): Promise<AdvertisingOrder[]> => {
    try {
        const startIso = rangeStart.toISOString();
        const endIso = rangeEnd.toISOString();
        const q = query(
            collection(db, 'advertising_orders'),
            where('startDate', '<=', endIso),
            orderBy('startDate', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() } as AdvertisingOrder))
            .filter(order => {
                const orderEnd = order.endDate || order.startDate;
                const status = order.status || 'Aprobado';
                return orderEnd >= startIso
                    && ['Aprobado', 'Pendiente de ModificaciÃ³n'].includes(status);
            });
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
    const dataToSave = {
        ...requestData,
        createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collections.socialMediaRequests, dataToSave);
    invalidateCache('socialMediaRequests');
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'social_media_request' as any,
        entityId: docRef.id,
        entityName: requestData.clientName,
        details: `creó un pedido de redes para <strong>${requestData.clientName}</strong> (${requestData.contentType})`,
        ownerName: requestData.advisorName,
    });

    return docRef.id;
};

export const getSocialMediaRequests = async (): Promise<SocialMediaRequest[]> => {
    const cachedData = getFromCache('socialMediaRequests');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(collections.socialMediaRequests);
    const requests = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as SocialMediaRequest;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    
    setInCache('socialMediaRequests', requests);
    return requests;
};

export const getSocialMediaRequestsByOrderId = async (orderId: string): Promise<SocialMediaRequest[]> => {
    const snapshot = await getDocs(query(collections.socialMediaRequests, where('orderId', '==', orderId)));
    return snapshot.docs.map(requestDoc => {
        const data = requestDoc.data();
        return {
            id: requestDoc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as SocialMediaRequest;
    });
};

export const getSocialMediaRequestsByClientId = async (clientId: string): Promise<SocialMediaRequest[]> => {
    const snapshot = await getDocs(query(collections.socialMediaRequests, where('clientId', '==', clientId)));
    return snapshot.docs.map(requestDoc => {
        const data = requestDoc.data();
        return {
            id: requestDoc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as SocialMediaRequest;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
};

export const linkSocialMediaRequestToOrder = async (
    requestId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(collections.socialMediaRequests, requestId);
    await updateDoc(docRef, {
        orderId,
        orderTitle,
        updatedAt: serverTimestamp(),
    });
    invalidateCache('socialMediaRequests');
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'social_media_request' as any,
        entityId: requestId,
        entityName: 'Pedido de Redes',
        details: `vinculÃ³ un pedido de redes a la orden <strong>${orderTitle}</strong>`,
        ownerName: userName,
    });
};

export const unlinkSocialMediaRequestFromOrder = async (
    requestId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error('Debe indicar el motivo de la desvinculacion.');
    const docRef = doc(collections.socialMediaRequests, requestId);
    await updateDoc(docRef, {
        orderId: deleteField(),
        orderTitle: deleteField(),
        orderUnlinkedAt: serverTimestamp(),
        orderUnlinkedById: userId,
        orderUnlinkedByName: userName,
        orderUnlinkReason: normalizedReason,
        updatedAt: serverTimestamp(),
    });
    invalidateCache('socialMediaRequests');
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'social_media_request' as any,
        entityId: requestId,
        entityName: 'Pedido de Redes',
        details: 'quitÃ³ la vinculaciÃ³n de un pedido de redes con una orden de publicidad',
        ownerName: userName,
    });
};

export const getSocialMediaRequest = async (id: string): Promise<SocialMediaRequest | null> => {
    const docRef = doc(db, 'social_media_requests', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as SocialMediaRequest;
    }
    return null;
};

export const updateSocialMediaRequest = async (
    id: string, 
    data: Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'social_media_requests', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Pedido no encontrado');
    
    const originalData = docSnap.data() as SocialMediaRequest;

    const updateData: any = { ...data, updatedAt: serverTimestamp() }; 
    
    // Limpiar campos según el tipo de contenido para evitar datos cruzados
    if (data.contentType === 'Reel') {
        updateData.isWebReplication = deleteField();
        updateData.storyUrl = deleteField();
        updateData.storyCta = deleteField();
        updateData.storyTagClient = deleteField();
        updateData.storyTagHandle = deleteField();
        // 🟢 Limpiar basura de carrusel
        updateData.carouselSlides = deleteField();
    } else if (data.contentType === 'Story') {
        updateData.reelCopy = deleteField();
        updateData.reelCollaboration = deleteField();
        updateData.reelCollabHandle = deleteField();
        updateData.carouselSlides = deleteField();
    } else if (data.contentType === 'Carrusel') {
        updateData.isWebReplication = deleteField();
        updateData.storyUrl = deleteField();
        updateData.storyCta = deleteField();
        updateData.storyTagClient = deleteField();
        updateData.storyTagHandle = deleteField();
        updateData.reelCopy = deleteField();
        // En Carrusel Sí hay colaboración, por lo que preservamos reelCollaboration y reelCollabHandle
    }

    await updateDoc(docRef, updateData);
    invalidateCache('socialMediaRequests');

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'social_media_request' as any,
        entityId: id,
        entityName: data.clientName || originalData.clientName,
        details: `actualizó un pedido de redes de <strong>${data.clientName || originalData.clientName}</strong>`,
        ownerName: data.advisorName || originalData.advisorName, 
    });
};

export const deleteSocialMediaRequest = async (id: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'social_media_requests', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    
    const data = docSnap.data() as SocialMediaRequest;
    
    await deleteDoc(docRef);
    invalidateCache('socialMediaRequests');

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'social_media_request' as any,
        entityId: id,
        entityName: data.clientName,
        details: `eliminó un pedido de redes de <strong>${data.clientName}</strong>`,
        ownerName: data.advisorName,
    });
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
    const docRef = doc(collections.systemConfig, 'email_whitelist');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return snap.data().emails || [];
    }
    return [];
};

export const updateEmailWhitelist = async (emails: string[], userId: string, userName: string): Promise<void> => {
    const docRef = doc(collections.systemConfig, 'email_whitelist');
    await setDoc(docRef, { emails }, { merge: true });
    
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'system_config' as any,
        entityId: 'email_whitelist',
        entityName: 'Lista Blanca de Accesos',
        details: 'actualizó los correos autorizados para ingresar al sistema.',
        ownerName: 'Sistema',
    });
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
    const dataToSave = {
        ...noteData,
        createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collections.webNotes, dataToSave);
    invalidateCache('webNotes');
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'commercial_note' as any, // Mismo rubro conceptual
        entityId: docRef.id,
        entityName: noteData.clientName,
        details: `cargó un pedido de Nota Web / Gacetilla para <strong>${noteData.clientName}</strong>`,
        ownerName: noteData.advisorName,
    });

    return docRef.id;
};

export const getWebNotes = async (): Promise<WebNote[]> => {
    const cachedData = getFromCache('webNotes');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(collections.webNotes);
    const notes = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as WebNote;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    
    setInCache('webNotes', notes);
    return notes;
};

export const getWebNotesByOrderId = async (orderId: string): Promise<WebNote[]> => {
    const snapshot = await getDocs(query(collections.webNotes, where('orderId', '==', orderId)));
    return snapshot.docs.map(noteDoc => {
        const data = noteDoc.data();
        return {
            id: noteDoc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as WebNote;
    });
};

export const getWebNotesByClientId = async (clientId: string): Promise<WebNote[]> => {
    const snapshot = await getDocs(query(collections.webNotes, where('clientId', '==', clientId)));
    return snapshot.docs.map(noteDoc => {
        const data = noteDoc.data();
        return {
            id: noteDoc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as WebNote;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
};

export const linkWebNoteToOrder = async (
    noteId: string,
    orderId: string,
    orderTitle: string,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(collections.webNotes, noteId);
    await updateDoc(docRef, {
        orderId,
        orderTitle,
        updatedAt: serverTimestamp(),
    });
    invalidateCache('webNotes');
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: 'Nota Web',
        details: `vinculÃ³ una nota web a la orden <strong>${orderTitle}</strong>`,
        ownerName: userName,
    });
};

export const unlinkWebNoteFromOrder = async (
    noteId: string,
    userId: string,
    userName: string,
    reason: string
): Promise<void> => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error('Debe indicar el motivo de la desvinculacion.');
    const docRef = doc(collections.webNotes, noteId);
    await updateDoc(docRef, {
        orderId: deleteField(),
        orderTitle: deleteField(),
        orderUnlinkedAt: serverTimestamp(),
        orderUnlinkedById: userId,
        orderUnlinkedByName: userName,
        orderUnlinkReason: normalizedReason,
        updatedAt: serverTimestamp(),
    });
    invalidateCache('webNotes');
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: noteId,
        entityName: 'Nota Web',
        details: 'quitÃ³ la vinculaciÃ³n de una nota web con una orden de publicidad',
        ownerName: userName,
    });
};

export const getWebNote = async (id: string): Promise<WebNote | null> => {
    const docRef = doc(db, 'web_notes', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as WebNote;
    }
    return null;
};

export const updateWebNote = async (
    id: string, 
    data: Partial<Omit<WebNote, 'id' | 'createdAt'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'web_notes', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Nota Web no encontrada');
    
    const originalData = docSnap.data() as WebNote;
    const updateData: any = { ...data, updatedAt: serverTimestamp() }; 
    
    await updateDoc(docRef, updateData);
    invalidateCache('webNotes');

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'commercial_note' as any,
        entityId: id,
        entityName: data.clientName || originalData.clientName,
        details: `actualizó un pedido de Nota Web / Gacetilla de <strong>${data.clientName || originalData.clientName}</strong>`,
        ownerName: data.advisorName || originalData.advisorName, 
    });
};

export const deleteWebNote = async (id: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'web_notes', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    
    const data = docSnap.data() as WebNote;
    
    await deleteDoc(docRef);
    invalidateCache('webNotes');

    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'commercial_note' as any,
        entityId: id,
        entityName: data.clientName,
        details: `eliminó el pedido de Nota Web / Gacetilla de <strong>${data.clientName}</strong>`,
        ownerName: data.advisorName,
    });
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
    const snap = await getDoc(doc(collections.systemConfig, 'srl_ad_types'));
    if (snap.exists()) {
        const types = snap.data().types || [];
        setInCache('srl_ad_types', types);
        return types;
    }
    // Valores por defecto iniciales si la base de datos está vacía
    return ["Spot", "PNT", "Auspicio", "Nota Comercial", "Sorteo", "Juego"];
};

export const saveSrlAdTypes = async (types: string[], userId: string, userName: string) => {
    await setDoc(doc(collections.systemConfig, 'srl_ad_types'), { types });
    invalidateCache('srl_ad_types');
    await logActivity({
        userId, userName, type: 'update', entityType: 'system_config' as any, entityId: 'srl_ad_types',
        entityName: 'Tipos de Aviso SRL', details: 'actualizó la lista de formatos comerciales de Radio/TV.', ownerName: 'Sistema'
    });
};

export const getSasProducts = async (): Promise<SasProductConfig[]> => {
    const cached = getFromCache('sas_products');
    if (cached) return cached as SasProductConfig[];
    const snap = await getDoc(doc(collections.systemConfig, 'sas_products'));
    if (snap.exists()) {
        const prods = snap.data().products || [];
        setInCache('sas_products', prods);
        return prods;
    }
    return [];
};

export const saveSasProducts = async (products: SasProductConfig[], userId: string, userName: string) => {
    await setDoc(doc(collections.systemConfig, 'sas_products'), { products });
    invalidateCache('sas_products');
    await logActivity({
        userId, userName, type: 'update', entityType: 'system_config' as any, entityId: 'sas_products',
        entityName: 'Productos Digitales SAS', details: 'actualizó el tarifario de productos digitales.', ownerName: 'Sistema'
    });
};

// ============================================================================
// --- PIPELINE & INTERACCIONES ---
// ============================================================================

export const getPipelineInteractions = async (): Promise<PipelineInteraction[]> => {
    const cached = getFromCache('pipeline_interactions');
    if (cached) return cached as PipelineInteraction[];
    
    const q = query(collections.pipelineInteractions, orderBy('fecha', 'desc'));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PipelineInteraction));
    
    setInCache('pipeline_interactions', data);
    return data;
};

export const createPipelineInteraction = async (data: Omit<PipelineInteraction, 'id' | 'createdAt'>, userId: string, userName: string): Promise<string> => {
    const dataToSave = { 
        ...data, 
        createdAt: serverTimestamp(), 
        advisorId: userId, 
        advisorName: userName 
    };
    const docRef = await addDoc(collections.pipelineInteractions, dataToSave);
    
    // Mutador de caché para velocidad instantánea
    const cacheData = { ...dataToSave, createdAt: new Date().toISOString() };
    mutateCacheArray('pipeline_interactions', docRef.id, cacheData, 'add', (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    
    return docRef.id;
};

export const updatePipelineInteraction = async (id: string, data: Partial<PipelineInteraction>): Promise<void> => {
    const docRef = doc(db, 'pipeline_interactions', id);
    const updateData = { ...data, updatedAt: serverTimestamp() };
    await updateDoc(docRef, updateData);
    
    mutateCacheArray('pipeline_interactions', id, { ...updateData, updatedAt: new Date().toISOString() }, 'update');
};

export const deletePipelineInteraction = async (id: string): Promise<void> => {
    const docRef = doc(db, 'pipeline_interactions', id);
    await deleteDoc(docRef);
    mutateCacheArray('pipeline_interactions', id, null, 'delete');
};

export const bulkCreatePipelineInteractions = async (
    interactions: Partial<PipelineInteraction>[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!interactions || interactions.length === 0) return;
    
    const batch = writeBatch(db);
    const createdItems: PipelineInteraction[] = [];

    interactions.forEach(interaction => {
        const docRef = doc(collection(db, 'pipeline_interactions'));
        const dataToSave = {
            ...interaction,
            advisorId: userId,
            advisorName: userName,
            createdAt: serverTimestamp()
        };
        batch.set(docRef, dataToSave);
        
        createdItems.push({
            id: docRef.id,
            ...dataToSave,
            createdAt: new Date().toISOString()
        } as PipelineInteraction);
    });

    await batch.commit();
    
    // 🟢 Reflejamos todo en el caché masivamente al instante
    createdItems.forEach(item => {
        mutateCacheArray('pipeline_interactions', item.id!, item, 'add', (a, b) => {
            const dateA = new Date(a.fecha).getTime();
            const dateB = new Date(b.fecha).getTime();
            return dateB - dateA;
        });
    });

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'pipeline_interaction' as any,
        entityId: 'bulk_import',
        entityName: `${interactions.length} interacciones`,
        details: `importó <strong>${interactions.length}</strong> interacciones al pipeline desde un archivo`,
        ownerName: userName
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
    if (targetClientId === sourceClientId) throw new Error("No puedes fusionar un cliente consigo mismo.");

    const targetRef = doc(db, 'clients', targetClientId);
    const sourceRef = doc(db, 'clients', sourceClientId);

    const [targetSnap, sourceSnap] = await Promise.all([getDoc(targetRef), getDoc(sourceRef)]);
    if (!targetSnap.exists() || !sourceSnap.exists()) throw new Error("Uno de los clientes no existe.");

    const targetData = targetSnap.data() as Client;
    const sourceData = sourceSnap.data() as Client;
    const targetName = targetData.denominacion;

    // 🟢 PREVENCIÓN DE CRASHEO: Usamos Lotes (Batches) en lugar de promesas paralelas
    let batch = writeBatch(db);
    let operationCount = 0;

    const commitBatchIfNeeded = async () => {
        if (operationCount >= 450) { // Firebase permite max 500 operaciones por lote
            await batch.commit();
            batch = writeBatch(db);
            operationCount = 0;
        }
    };

    const updateDocsBatch = async (querySnapshot: any, dataToUpdate: any) => {
        for (const d of querySnapshot.docs) {
            batch.update(d.ref, dataToUpdate);
            operationCount++;
            await commitBatchIfNeeded();
        }
    };

    // 1. Mover Oportunidades
    await updateDocsBatch(await getDocs(query(collections.opportunities, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    // 2. Mover Ordenes
    await updateDocsBatch(await getDocs(query(collection(db, 'advertising_orders'), where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    // 3. Billing
    await updateDocsBatch(await getDocs(query(collections.billingRequests, where('clientId', '==', sourceClientId))), { clientId: targetClientId });
    // 4. Actividades
    await updateDocsBatch(await getDocs(query(collections.clientActivities, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    
    // 5. Contactos
    const peopleSnap = await getDocs(query(collections.people, where('clientIds', 'array-contains', sourceClientId)));
    for (const d of peopleSnap.docs) {
        const data = d.data();
        const newIds = data.clientIds.filter((id: string) => id !== sourceClientId);
        if (!newIds.includes(targetClientId)) newIds.push(targetClientId);
        batch.update(d.ref, { clientIds: newIds });
        operationCount++;
        await commitBatchIfNeeded();
    }

    // 6. Notas
    await updateDocsBatch(await getDocs(query(collections.commercialNotes, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    // 7. Redes
    await updateDocsBatch(await getDocs(query(collections.socialMediaRequests, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    // 8. Notas Web
    await updateDocsBatch(await getDocs(query(collections.webNotes, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });
    // 9. Canjes
    await updateDocsBatch(await getDocs(query(collections.canjes, where('clienteId', '==', sourceClientId))), { clienteId: targetClientId, clienteName: targetName });
    // 10. Convenios
    await updateDocsBatch(await getDocs(query(collections.convenios, where('clientId', '==', sourceClientId))), { clientId: targetClientId, clientName: targetName });

    // 11. Eliminar el origen (duplicado)
    batch.delete(sourceRef);
    await batch.commit();

    invalidateCache();

    // 12. Registrar la acción
    await logActivity({
        userId,
        userName,
        type: 'delete',
        entityType: 'client',
        entityId: targetClientId,
        entityName: targetName,
        details: `fusionó el cliente duplicado <strong>${sourceData.denominacion}</strong> hacia este cliente, migrando todo su historial.`,
        ownerName: targetData.ownerName || 'Sistema'
    });
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
    const docRef = doc(db, 'system_config', 'workflow_assignments');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const d = snap.data();
        return {
            approvers: d.approvers || [],
            billingReceptors: d.billingReceptors || [],
            tangoInvoicers: d.tangoInvoicers || [],
            needLoaders: d.needLoaders || [],
            needRequestReceivers: d.needRequestReceivers || [],
            canjeRequestReceivers: d.canjeRequestReceivers || [],
            canjeManagementApprovers: d.canjeManagementApprovers || [],
            canjeCommercialReferents: d.canjeCommercialReferents || []
        };
    }
    return {
        approvers: [],
        billingReceptors: [],
        tangoInvoicers: [],
        needLoaders: [],
        needRequestReceivers: [],
        canjeRequestReceivers: [],
        canjeManagementApprovers: [],
        canjeCommercialReferents: []
    };
};

export const saveWorkflowAssignments = async (assignments: WorkflowAssignments): Promise<void> => {
    const docRef = doc(db, 'system_config', 'workflow_assignments');
    await setDoc(docRef, assignments, { merge: true });
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
