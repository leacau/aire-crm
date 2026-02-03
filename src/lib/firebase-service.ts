'use client';

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig, SupervisorComment, SupervisorCommentReply, ObjectiveVisibilityConfig, PaymentEntry, PaymentStatus, ChatSpaceMapping, CoachingSession, CoachingItem, CommercialNote, SystemHolidays } from './types';
import { logActivity } from './activity-logger';
import { es } from 'date-fns/locale';
import { defaultPermissions } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { differenceInCalendarDays, isSaturday, isSunday, parseISO, format } from 'date-fns';

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
    commercialNotes: collection(db, 'commercial_notes'),
};

const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_DURATION_MS = 60 * 60 * 1000;
const CHAT_SPACES_CACHE_KEY = 'chat_spaces_cache';

const getFromCache = (key: string) => {
    const cached = cache[key];
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) return cached.data;
    return null;
};
const setInCache = (key: string, data: any) => {
    cache[key] = { data, timestamp: Date.now() };
};
const timestampToISO = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (value instanceof Timestamp) return value.toDate().toISOString();
    return undefined;
};
export const invalidateCache = (key?: string) => {
    if (key) delete cache[key];
    else Object.keys(cache).forEach(k => delete cache[k]);
};
const parseDateWithTimezone = (dateString: string) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
};

export type ClientTangoUpdate = {
    cuit?: string; tangoCompanyId?: string; idTango?: string; email?: string; phone?: string; rubro?: string; razonSocial?: string; denominacion?: string; idAireSrl?: string; idAireDigital?: string; condicionIVA?: string; provincia?: string; localidad?: string; tipoEntidad?: string; observaciones?: string;
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
    const q = query(
      collections.commercialNotes,
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const notes: CommercialNote[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : data.createdAt;

      return { id: doc.id, ...data, createdAt } as CommercialNote;
    });

    return notes;
  } catch (error) {
    console.error("Error al obtener las notas comerciales del cliente:", error);
    throw error;
  }
}

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

// --- Clients & Activities ---

export const getClients = async (): Promise<Client[]> => {
    const cachedData = getFromCache('clients');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(query(collections.clients, orderBy("denominacion")));
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), newClientDate: timestampToISO(doc.data().newClientDate) } as Client));
    setInCache('clients', clients);
    return clients;
};

export const updateClientTangoMapping = async (id: string, data: ClientTangoUpdate, userId: string, userName: string) => {
    const docRef = doc(db, 'clients', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('clients');
};

export const getClientActivities = async (clientId: string): Promise<ClientActivity[]> => {
    const q = query(collections.clientActivities, where('clientId', '==', clientId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: timestampToISO(doc.data().timestamp)! } as ClientActivity));
};

export const createClientActivity = async (activityData: Omit<ClientActivity, 'id' | 'timestamp'>): Promise<string> => {
    const dataToSave: any = { ...activityData, timestamp: serverTimestamp() };
    if (activityData.isTask && activityData.dueDate) dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
    else delete dataToSave.dueDate;
    const docRef = await addDoc(collections.clientActivities, dataToSave);
    invalidateCache('client_activities');
    return docRef.id;
};

export const updateClientActivity = async (id: string, data: Partial<Omit<ClientActivity, 'id'>>) => {
    const docRef = doc(db, 'client-activities', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('client_activities');
};
// --- People ---
export const getPeopleByClientId = async (clientId: string): Promise<Person[]> => {
    const q = query(collections.people, where("clientIds", "array-contains", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
};

export const createPerson = async (personData: Omit<Person, 'id'>, userId: string, userName: string): Promise<string> => {
    const docRef = await addDoc(collections.people, { ...personData, createdAt: serverTimestamp() });
    invalidateCache('people');
    return docRef.id;
};

export const updatePerson = async (id: string, data: Partial<Person>, userId: string, userName: string) => {
    const docRef = doc(db, 'people', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('people');
};

export const deletePerson = async (id: string, userId: string, userName: string) => {
    await deleteDoc(doc(db, 'people', id));
    invalidateCache('people');
};

// --- Opportunities ---
export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    const q = query(collections.opportunities, where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
};

export const getAllOpportunities = async (): Promise<Opportunity[]> => {
    const cachedData = getFromCache('opportunities');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(collections.opportunities);
    const opps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
    setInCache('opportunities', opps);
    return opps;
};

export const createOpportunity = async (data: Omit<Opportunity, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const docRef = await addDoc(collections.opportunities, { ...data, createdAt: serverTimestamp() });
    invalidateCache('opportunities');
    return docRef.id;
};

export const updateOpportunity = async (id: string, data: Partial<Opportunity>, userId: string, userName: string, ownerName: string) => {
    const docRef = doc(db, 'opportunities', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('opportunities');
};

export const deleteOpportunity = async (id: string, userId: string, userName: string) => {
    await deleteDoc(doc(db, 'opportunities', id));
    invalidateCache('opportunities');
};

// --- Invoices ---
export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const oppsSnapshot = await getDocs(query(collections.opportunities, where("clientId", "==", clientId)));
    const opportunityIds = oppsSnapshot.docs.map(doc => doc.id);
    if (opportunityIds.length === 0) return [];
    
    // Firestore "in" queries are limited to 10 items. Batch if necessary, here simplified.
    // Assuming low number of opps per client for now.
    const q = query(collections.invoices, where("opportunityId", "in", opportunityIds));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getInvoices = async (): Promise<Invoice[]> => {
    const cachedData = getFromCache('invoices');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(collections.invoices);
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
    setInCache('invoices', invoices);
    return invoices;
};

export const createInvoice = async (data: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const docRef = await addDoc(collections.invoices, { ...data, dateGenerated: new Date().toISOString() });
    invalidateCache('invoices');
    return docRef.id;
};

export const updateInvoice = async (id: string, data: Partial<Invoice>, userId: string, userName: string, ownerName: string) => {
    const docRef = doc(db, 'invoices', id);
    await updateDoc(docRef, data);
    invalidateCache('invoices');
};

export const deleteInvoicesInBatches = async (invoiceIds: string[], userId: string, userName: string, options?: { batchSize?: number; resolveOwnerName?: (id: string) => string; onProgress?: (progress: { total: number; processed: number; deleted: string[]; failed: { id: string; error: string }[]; }) => void; }): Promise<{ deleted: string[]; failed: { id: string; error: string }[]; }> => {
    // Mock implementation for batch deletion logic
    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const total = invoiceIds.length;
    let processed = 0;

    for (const id of invoiceIds) {
        try {
            await deleteDoc(doc(db, 'invoices', id));
            deleted.push(id);
        } catch (e: any) {
            failed.push({ id, error: e.message });
        }
        processed++;
        if (options?.onProgress) options.onProgress({ total, processed, deleted, failed });
    }
    invalidateCache('invoices');
    return { deleted, failed };
};
// --- Users ---
export const getAllUsers = async (roleFilter?: UserRole): Promise<User[]> => {
    const cachedData = getFromCache('users');
    let users: User[] = [];
    
    if (cachedData) {
        users = cachedData;
    } else {
        const snapshot = await getDocs(collections.users);
        users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setInCache('users', users);
    }
    
    if (roleFilter) {
        return users.filter(u => u.role === roleFilter);
    }
    return users;
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as User) : null;
};

// --- Programs & Commercial Items ---
export const getPrograms = async (): Promise<Program[]> => {
    const cachedData = getFromCache('programs');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(query(collections.programs, orderBy("name")));
    const programs = snapshot.docs.map(doc => {
      const data = doc.data();
      if (!data.schedules) {
        // Migration support for old structure if needed
        return { id: doc.id, ...data, schedules: [{ id: 'default', daysOfWeek: data.daysOfWeek || [], startTime: data.startTime || '', endTime: data.endTime || '' }] } as Program;
      }
      return { id: doc.id, ...data } as Program
    });
    setInCache('programs', programs);
    return programs;
};

export const saveProgram = async (program: Omit<Program, 'id'>) => {
    await addDoc(collections.programs, program);
    invalidateCache('programs');
};

export const updateProgram = async (id: string, program: Partial<Program>) => {
    await updateDoc(doc(db, 'programs', id), program);
    invalidateCache('programs');
};

export const deleteProgram = async (id: string) => {
    await deleteDoc(doc(db, 'programs', id));
    invalidateCache('programs');
};

export const getCommercialItems = async (): Promise<CommercialItem[]> => {
     const cachedData = getFromCache('commercial_items');
     if (cachedData) return cachedData;
     const snapshot = await getDocs(collections.commercialItems);
     const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommercialItem));
     setInCache('commercial_items', items);
     return items;
};

export const createCommercialItem = async (item: Omit<CommercialItem, 'id'>, userId: string, userName: string) => {
    await addDoc(collections.commercialItems, { ...item, createdAt: new Date().toISOString(), createdBy: userId });
    invalidateCache('commercial_items');
};

export const updateCommercialItem = async (id: string, updates: Partial<CommercialItem>, userId: string, userName: string) => {
    await updateDoc(doc(db, 'commercial_items', id), { ...updates, updatedAt: new Date().toISOString(), updatedBy: userId });
    invalidateCache('commercial_items');
};

export const deleteCommercialItem = async (id: string, userId: string, userName: string) => {
    await deleteDoc(doc(db, 'commercial_items', id));
    invalidateCache('commercial_items');
};

// --- General Activity Logs ---
export const getActivitiesForEntity = async (entityId: string): Promise<ActivityLog[]> => {
    const q = query(collections.activities, where('entityId', '==', entityId), orderBy('timestamp', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: timestampToISO(doc.data().timestamp)! } as ActivityLog));
};

export const getChatSpaces = async (): Promise<ChatSpaceMapping[]> => {
    const cached = getFromCache(CHAT_SPACES_CACHE_KEY);
    if (cached) return cached;
    const snapshot = await getDocs(collections.chatSpaces);
    const spaces = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSpaceMapping));
    setInCache(CHAT_SPACES_CACHE_KEY, spaces);
    return spaces;
};
// --- System Config & Permissions ---
export const getOpportunityAlertsConfig = async (): Promise<OpportunityAlertsConfig> => {
    const docRef = doc(collections.systemConfig, 'opportunity_alerts');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as OpportunityAlertsConfig : {};
};

export const getObjectiveVisibilityConfig = async (): Promise<ObjectiveVisibilityConfig> => {
    const cached = getFromCache(OBJECTIVE_VISIBILITY_DOC_ID);
    if (cached) return cached;
    const docRef = doc(collections.systemConfig, OBJECTIVE_VISIBILITY_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data();
        const parsed: ObjectiveVisibilityConfig = { ...data, updatedAt: timestampToISO(data.updatedAt) } as ObjectiveVisibilityConfig;
        setInCache(OBJECTIVE_VISIBILITY_DOC_ID, parsed);
        return parsed;
    }
    return {};
};

export const updateOpportunityAlertsConfig = async (config: OpportunityAlertsConfig, userId: string, userName: string) => {
    const docRef = doc(collections.systemConfig, 'opportunity_alerts');
    await setDoc(docRef, config, { merge: true });
};

export const updateObjectiveVisibilityConfig = async (config: ObjectiveVisibilityConfig, userId: string, userName: string) => {
    const docRef = doc(collections.systemConfig, OBJECTIVE_VISIBILITY_DOC_ID);
    await setDoc(docRef, { ...config, updatedAt: serverTimestamp(), updatedByName: userName }, { merge: true });
    invalidateCache(OBJECTIVE_VISIBILITY_DOC_ID);
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
      const permissionError = new FirestorePermissionError({ path: permissionsDocRef.path, operation: 'update', requestResourceData: { permissions } } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    });
    invalidateCache('permissions');
};

export const saveMonthlyClosure = async (advisorId: string, month: string, value: number, managerId: string) => {
    const userRef = doc(db, 'users', advisorId);
    await updateDoc(userRef, { [`monthlyClosures.${month}`]: value });
    invalidateCache('users');
};

export const bulkReleaseProspects = async (prospectIds: string[], userId: string, userName: string): Promise<void> => {
    if (!prospectIds || prospectIds.length === 0) return;
    const batch = writeBatch(db);
    prospectIds.forEach((id) => {
        const docRef = doc(db, 'prospects', id);
        batch.update(docRef, { ownerId: '', ownerName: 'Sin Asignar', updatedAt: serverTimestamp() });
    });
    await batch.commit();
    invalidateCache('prospects'); 
};

// --- Payments ---
export const getPaymentEntries = async (): Promise<PaymentEntry[]> => {
    const cached = getFromCache('payment_entries');
    if (cached) return cached;
    const snapshot = await getDocs(collections.paymentEntries);
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentEntry));
    setInCache('payment_entries', entries);
    return entries;
};

export const replacePaymentEntriesForAdvisor = async (advisorId: string, advisorName: string, entries: Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[], userId: string, userName: string) => {
    const batch = writeBatch(db);
    const existingQ = query(collections.paymentEntries, where('advisorId', '==', advisorId));
    const existingSnap = await getDocs(existingQ);
    existingSnap.forEach(doc => batch.delete(doc.ref));

    entries.forEach(entry => {
        const docRef = doc(collections.paymentEntries);
        batch.set(docRef, { ...entry, advisorId, advisorName, status: 'Pendiente', createdAt: new Date().toISOString() });
    });
    
    await batch.commit();
    invalidateCache('payment_entries');
};

export const updatePaymentEntry = async (id: string, updates: Partial<PaymentEntry>, audit: { userId?: string, userName?: string, ownerName?: string, details?: string }) => {
    await updateDoc(doc(db, 'payment_entries', id), updates);
    invalidateCache('payment_entries');
};

export const deletePaymentEntries = async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'payment_entries', id)));
    await batch.commit();
    invalidateCache('payment_entries');
};

export const requestPaymentExplanation = async (id: string, data: any) => {
     const docRef = doc(db, 'payment_entries', id);
     await updateDoc(docRef, { 
         lastExplanationRequestAt: new Date().toISOString(),
         lastExplanationRequestById: data.requestedById,
         lastExplanationRequestByName: data.requestedByName,
         explanationRequestNote: data.note || ''
     });
     invalidateCache('payment_entries');
};

// --- Placeholder for other modules if needed (Coaching, etc.) ---
export const getCoachingSessions = async (): Promise<CoachingSession[]> => {
    const snap = await getDocs(collections.coachingSessions);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachingSession));
};
