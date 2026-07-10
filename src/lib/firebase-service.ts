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
    commercialNotes: collection(db, 'commercial_notes'),
    billingRequests: collection(db, 'billing_requests'),
    socialMediaRequests: collection(db, 'social_media_requests'),
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
    const { bulkReleaseProspects } = await import('@/lib/api/prospects');
    await bulkReleaseProspects(prospectIds);
    invalidateCache('prospects');
};
// --- Config Functions ---

export const getOpportunityAlertsConfig = async (): Promise<OpportunityAlertsConfig> => {
    const cached = getFromCache('opportunity_alerts');
    if (cached) return cached as OpportunityAlertsConfig;

    const { getOpportunityAlertsConfig } = await import('@/lib/api/system');
    const config = await getOpportunityAlertsConfig();
    setInCache('opportunity_alerts', config);
    return config;
};

export const getObjectiveVisibilityConfig = async (): Promise<ObjectiveVisibilityConfig> => {
    const cached = getFromCache(OBJECTIVE_VISIBILITY_DOC_ID);
    if (cached) return cached;

    const { getObjectiveVisibilityConfig } = await import('@/lib/api/system');
    const config = await getObjectiveVisibilityConfig();
    setInCache(OBJECTIVE_VISIBILITY_DOC_ID, config);
    return config;
};

export const updateOpportunityAlertsConfig = async (config: OpportunityAlertsConfig, userId: string, userName: string) => {
    const { updateOpportunityAlertsConfig } = await import('@/lib/api/system');
    await updateOpportunityAlertsConfig(config);
    invalidateCache('opportunity_alerts');
};

export const updateObjectiveVisibilityConfig = async (
    config: ObjectiveVisibilityConfig,
    userId: string,
    userName: string
) => {
    const { updateObjectiveVisibilityConfig } = await import('@/lib/api/system');
    await updateObjectiveVisibilityConfig(config);
    invalidateCache(OBJECTIVE_VISIBILITY_DOC_ID);
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

interface ReplySupervisorCommentInput {
    commentId: string;
    authorId: string;
    authorName: string;
    message: string;
    recipientId?: string;
    recipientName?: string;
}

export const getSupervisorCommentsForEntity = async (entityType: 'client' | 'opportunity', entityId: string): Promise<SupervisorComment[]> => {
    const { getSupervisorCommentsForEntity } = await import('@/lib/api/supervisor-comments');
    return getSupervisorCommentsForEntity(entityType, entityId);
};

export const getSupervisorCommentThreadsForUser = async (userId: string): Promise<SupervisorComment[]> => {
    const { getSupervisorCommentThreadsForUser } = await import('@/lib/api/supervisor-comments');
    return getSupervisorCommentThreadsForUser(userId);
};

export const createSupervisorComment = async (input: CreateSupervisorCommentInput): Promise<string> => {
    const { createSupervisorComment } = await import('@/lib/api/supervisor-comments');
    const id = await createSupervisorComment(input);
    invalidateCache(`comments_${input.entityType}_${input.entityId}`);
    invalidateCache(`commentThreads_${input.recipientId || input.ownerId}`);
    return id;
};

export const replyToSupervisorComment = async (input: ReplySupervisorCommentInput): Promise<void> => {
    const { replyToSupervisorComment } = await import('@/lib/api/supervisor-comments');
    await replyToSupervisorComment(input);
};

export const markSupervisorCommentThreadSeen = async (commentId: string, userId: string): Promise<void> => {
    const { markSupervisorCommentThreadSeen } = await import('@/lib/api/supervisor-comments');
    await markSupervisorCommentThreadSeen(commentId);
};

export const deleteSupervisorCommentThread = async (
    commentId: string,
    entityType: 'client' | 'opportunity',
    entityId: string,
    ownerId: string,
    recipientId?: string
): Promise<void> => {
    const { deleteSupervisorCommentThread } = await import('@/lib/api/supervisor-comments');
    await deleteSupervisorCommentThread(commentId);
    invalidateCache(`comments_${entityType}_${entityId}`);
    invalidateCache(`commentThreads_${recipientId || ownerId}`);
};

// --- Vacation Request (License) Functions ---

export const getVacationRequests = async (): Promise<VacationRequest[]> => {
    const cachedData = getFromCache('licenses');
    if (cachedData) return cachedData;

    const { getVacationRequests } = await import('@/lib/api/vacation-requests');
    const requests = await getVacationRequests();
    setInCache('licenses', requests);
    return requests;
};

export const createVacationRequest = async (
    requestData: Omit<VacationRequest, 'id' | 'status'>,
    managerEmail: string | null
): Promise<{ docId: string; emailPayload: { to: string, subject: string, body: string } | null }> => {
    const { createVacationRequest } = await import('@/lib/api/vacation-requests');
    const result = await createVacationRequest(requestData, managerEmail);
    invalidateCache('licenses');
    invalidateCache('users');
    return result;
};

export const updateVacationRequest = async (
    requestId: string,
    updates: Partial<VacationRequest>
): Promise<void> => {
    const { updateVacationRequest } = await import('@/lib/api/vacation-requests');
    await updateVacationRequest(requestId, updates);
    invalidateCache('licenses');
    invalidateCache('users');
};

export const adjustVacationDays = async (userId: string, days: number, updatedBy: string, updatedByName: string): Promise<void> => {
    const { adjustVacationDays } = await import('@/lib/api/vacation-requests');
    await adjustVacationDays(userId, days, updatedBy, updatedByName);
    invalidateCache('users');
};

export const addVacationDays = async (userId: string, daysToAdd: number, updatedBy: string, updatedByName: string): Promise<void> => {
    const { addVacationDays } = await import('@/lib/api/vacation-requests');
    await addVacationDays(userId, daysToAdd, updatedBy, updatedByName);
    invalidateCache('users');
};

export const approveVacationRequest = async (
    requestId: string,
    newStatus: VacationRequestStatus,
    approverId: string,
    applicantEmail: string | null,
): Promise<{ emailPayload: { to: string, subject: string, body: string } | null }> => {
    const { approveVacationRequest } = await import('@/lib/api/vacation-requests');
    const result = await approveVacationRequest(requestId, newStatus, approverId, applicantEmail);
    invalidateCache('licenses');
    invalidateCache('users');
    return result;
};

export const annulVacationRequest = async (
    requestId: string,
    reason: string,
    managerId: string,
    managerName: string,
    applicantEmail: string | null
): Promise<{ emailPayload: { to: string, subject: string, body: string } | null }> => {
    const { annulVacationRequest } = await import('@/lib/api/vacation-requests');
    const result = await annulVacationRequest(requestId, reason, managerId, managerName, applicantEmail);
    invalidateCache('licenses');
    invalidateCache('users');
    return result;
};

export const deleteVacationRequest = async (requestId: string): Promise<void> => {
    const { deleteVacationRequest } = await import('@/lib/api/vacation-requests');
    await deleteVacationRequest(requestId);
    invalidateCache('licenses');
    invalidateCache('users');
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
    const { recordProspectNotifications } = await import('@/lib/api/prospects');
    await recordProspectNotifications(prospectIds);
    invalidateCache('prospects');
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
    const { createUserProfile } = await import('@/lib/api/users');
    await createUserProfile(uid, name, email, photoURL);
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
  const { syncRegisteredUsersFromAuth } = await import('@/lib/api/users');
  const result = await syncRegisteredUsersFromAuth();
  invalidateCache('users');
  return result;
};

export const createExternalCanjeUser = async (data: { name: string; email: string; password: string }) => {
  const { createExternalCanjeUser } = await import('@/lib/api/users');
  const result = await createExternalCanjeUser(data);
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
    const { deleteUserAndReassignEntities } = await import('@/lib/api/users');
    await deleteUserAndReassignEntities(userIdToDelete);
    invalidateCache();
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
    const cacheKey = `activities_limit_${activityLimit}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const { getActivities } = await import('@/lib/api/activities');
    const activities = await getActivities(activityLimit);
    setInCache(cacheKey, activities);
    return activities;
};

export const getPaymentActivities = async (paymentId: string, activityLimit: number = 50): Promise<ActivityLog[]> => {
    const { getPaymentActivities } = await import('@/lib/api/activities');
    return getPaymentActivities(paymentId, activityLimit);
};

export const getActivitiesForEntity = async (entityId: string): Promise<ActivityLog[]> => {
    const { getActivitiesForEntity } = await import('@/lib/api/activities');
    return getActivitiesForEntity(entityId);
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
    const { getCoachingSessions } = await import('@/lib/api/coaching');
    return getCoachingSessions(advisorId);
};

export const createCoachingSession = async (
    sessionData: Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
    userId: string, 
    userName: string
): Promise<string> => {
    const { createCoachingSession } = await import('@/lib/api/coaching');
    const id = await createCoachingSession(sessionData, userId, userName);
    invalidateCache(`open_session_${sessionData.advisorId}`);
    invalidateCache(`coaching_active_index_${sessionData.advisorId}`);
    return id;
};

export const deleteCoachingSession = async (sessionId: string, userId: string, userName: string): Promise<void> => {
    const { deleteCoachingSession } = await import('@/lib/api/coaching');
    await deleteCoachingSession(sessionId, userId, userName);
    invalidateCache();
};

export const updateCoachingSession = async (sessionId: string, data: Partial<CoachingSession>, userId: string, userName: string): Promise<void> => {
    const { updateCoachingSession } = await import('@/lib/api/coaching');
    await updateCoachingSession(sessionId, data, userId, userName);
    invalidateCache();
};

export const updateCoachingItem = async (
    sessionId: string,
    itemId: string,
    updates: Partial<Pick<CoachingItem, 'status' | 'advisorNotes' | 'followUpDone' | 'followUpDoneUpdatedAt' | 'followUpCurrent' | 'followUpCurrentUpdatedAt' | 'followUpNext' | 'followUpNextUpdatedAt'>>,
    userId: string,
    userName: string,
    taskId?: string,
    advisorId?: string
): Promise<void> => {
    const { updateCoachingItem } = await import('@/lib/api/coaching');
    await updateCoachingItem(sessionId, itemId, updates as Partial<CoachingItem>, userId, userName);
    if (advisorId) {
        invalidateCache(`open_session_${advisorId}`);
        invalidateCache(`coaching_active_index_${advisorId}`);
    } else {
        invalidateCache();
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
    const { appendCoachingFollowUpEntry } = await import('@/lib/api/coaching');
    const entry = await appendCoachingFollowUpEntry(sessionId, itemId, field, text, userId, userName);
    invalidateCache();
    return entry;
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
    const { updateCoachingFollowUpEntry } = await import('@/lib/api/coaching');
    await updateCoachingFollowUpEntry(sessionId, itemId, field, entryId, text, userId, userName);
    invalidateCache();
};

export const deleteCoachingFollowUpEntry = async (
    sessionId: string,
    itemId: string,
    field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
    entryId: string,
    userId: string,
    userName: string,
): Promise<void> => {
    const { deleteCoachingFollowUpEntry } = await import('@/lib/api/coaching');
    await deleteCoachingFollowUpEntry(sessionId, itemId, field, entryId, userId, userName);
    invalidateCache();
};

export const deleteCoachingItem = async (sessionId: string, itemId: string) => {
    const { deleteCoachingItem } = await import('@/lib/api/coaching');
    await deleteCoachingItem(sessionId, itemId);
    invalidateCache();
};

export const addItemsToSession = async (sessionId: string, newItems: CoachingItem[]) => {
    const { addItemsToSession } = await import('@/lib/api/coaching');
    await addItemsToSession(sessionId, newItems);
    invalidateCache();
};
export const claimProspect = async (prospect: Prospect, userId: string, userName: string): Promise<void> => {
    const { claimProspect } = await import('@/lib/api/prospects');
    await claimProspect(prospect.id);
    invalidateCache('prospects');
};

export const approveProspectClaim = async (prospect: Prospect, managerId: string, managerName: string): Promise<void> => {
    const { approveProspectClaim } = await import('@/lib/api/prospects');
    await approveProspectClaim(prospect.id);
    invalidateCache('prospects');
};

export const rejectProspectClaim = async (prospect: Prospect, managerId: string, managerName: string): Promise<void> => {
    const { rejectProspectClaim } = await import('@/lib/api/prospects');
    await rejectProspectClaim(prospect.id);
    invalidateCache('prospects');
};
export const createAdvertisingOrder = async (orderData: Omit<AdvertisingOrder, 'id' | 'createdAt'>) => {
    const { createAdvertisingOrder } = await import('@/lib/api/advertising-orders');
    const id = await createAdvertisingOrder(orderData as Omit<AdvertisingOrder, 'id' | 'createdAt'> & { billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[] });
    invalidateCache('advertising_orders');
    invalidateCache('billing_requests_metadata');
    invalidateCache('canjes');
    return id;
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
    const { updateAdvertisingOrder } = await import('@/lib/api/advertising-orders');
    await updateAdvertisingOrder(orderId, orderData as Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>> & { billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[] }, userId, userName, options);
    invalidateCache('advertising_orders');
    invalidateCache('billing_requests_metadata');
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
    const { saveConvenioCanje } = await import('@/lib/api/convenios');
    const id = await saveConvenioCanje(convenioData);
    invalidateCache('convenios_canje');
    return id;
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

    const { getConveniosCanje } = await import('@/lib/api/convenios');
    const convenios = await getConveniosCanje();
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
    const { updateConvenioCanje } = await import('@/lib/api/convenios');
    await updateConvenioCanje(id, data);
    invalidateCache('convenios_canje');
};

export const deleteConvenioCanje = async (
    canjeId: string, 
    oppId: string, 
    userId: string, 
    userName: string
): Promise<void> => {
    const { deleteConvenioCanje } = await import('@/lib/api/convenios');
    await deleteConvenioCanje(canjeId, oppId);
    invalidateCache('convenios_canje');
    invalidateCache('opportunities');
    invalidateCache('invoices');
};

export const migrateLegacyConveniosToCanjes = async (
    userId: string,
    userName: string,
): Promise<{ created: number; skipped: number }> => {
    const { migrateLegacyConveniosToCanjes } = await import('@/lib/api/convenios');
    const result = await migrateLegacyConveniosToCanjes();
    invalidateCache('canjes');
    invalidateCache('convenios_canje');
    return result;
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
    const { autoUpdateCoachingSession } = await import('@/lib/api/coaching');
    await autoUpdateCoachingSession(advisorId, advisorName, entityType, entityId, entityName, actionText, options);
    invalidateCache(`open_session_${advisorId}`);
    invalidateCache(`coaching_active_index_${advisorId}`);
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

    const { getAllBillingRequestsWithMetadata } = await import('@/lib/api/billing-requests');
    const requests = await getAllBillingRequestsWithMetadata();
    setInCache('billing_requests_metadata', requests);
    return requests;
};
export const updateBillingRequestStatus = async (
    requestId: string,
    newStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado',
    metadata?: { invoiceNumber?: string; emailPayload?: { accessToken: string; loggedUser: string } }
): Promise<void> => {
    const { updateBillingRequestStatus } = await import('@/lib/api/billing-requests');
    await updateBillingRequestStatus(requestId, newStatus, metadata?.invoiceNumber);
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
