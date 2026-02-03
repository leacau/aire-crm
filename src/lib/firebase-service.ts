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
    if (roleFilter) return users.filter(u => u.role === roleFilter);
    return users;
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as User) : null;
};

export const updateUserProfile = async (uid: string, data: Partial<User>) => {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, data, { merge: true });
    invalidateCache('users');
};

export const createUserProfile = async (uid: string, name: string, email: string, photoURL?: string): Promise<void> => {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { name, email, role: 'Asesor', photoURL: photoURL || null, createdAt: serverTimestamp() });
    invalidateCache('users');
};

export const deleteUserAndReassignEntities = async (userIdToDelete: string, adminUserId: string, adminUserName: string): Promise<void> => {
    const userRef = doc(db, 'users', userIdToDelete);
    const batch = writeBatch(db);
    const clientsQuery = query(collections.clients, where('ownerId', '==', userIdToDelete));
    const clientsSnapshot = await getDocs(clientsQuery);
    clientsSnapshot.forEach(doc => batch.update(doc.ref, { ownerId: deleteField(), ownerName: deleteField() }));
    const prospectsQuery = query(collections.prospects, where('ownerId', '==', userIdToDelete));
    const prospectsSnapshot = await getDocs(prospectsQuery);
    prospectsSnapshot.forEach(doc => batch.update(doc.ref, { ownerId: deleteField(), ownerName: deleteField() }));
    batch.delete(userRef);
    await batch.commit();
    invalidateCache();
};

// --- Clients ---
export const getClients = async (): Promise<Client[]> => {
    const cachedData = getFromCache('clients');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(query(collections.clients, orderBy("denominacion")));
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), newClientDate: timestampToISO(doc.data().newClientDate) } as Client));
    setInCache('clients', clients);
    return clients;
};

export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            ...data,
            createdAt: timestampToISO(data.createdAt),
            updatedAt: timestampToISO(data.updatedAt),
            newClientDate: timestampToISO(data.newClientDate),
            deactivationHistory: data.deactivationHistory ? data.deactivationHistory.map(timestampToISO) : []
        } as Client;
    }
    return null;
};

export const createClient = async (clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>, userId?: string, userName?: string): Promise<string> => {
    const newClientData: any = { ...clientData, personIds: [], createdAt: serverTimestamp(), isDeactivated: false, deactivationHistory: [] };
    if (userId && userName) { newClientData.ownerId = userId; newClientData.ownerName = userName; }
    if (clientData.isNewClient) newClientData.newClientDate = serverTimestamp(); else newClientData.isNewClient = false;
    if (newClientData.agencyId === undefined) delete newClientData.agencyId;
    
    const docRef = await addDoc(collections.clients, newClientData);
    invalidateCache('clients');
    if (userId && userName) await logActivity({ userId, userName, type: 'create', entityType: 'client', entityId: docRef.id, entityName: clientData.denominacion, details: `creó el cliente ${clientData.denominacion}`, ownerName: userName });
    return docRef.id;
};

export const updateClient = async (id: string, data: Partial<Omit<Client, 'id'>>, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'clients', id);
    const originalDoc = await getDoc(docRef);
    const originalData = originalDoc.data() as Client;
    
    const updateData: {[key: string]: any} = { ...data };
    Object.keys(updateData).forEach(key => { if (updateData[key] === undefined) delete updateData[key]; });
    
    if (data.isDeactivated === true && originalData.isDeactivated === false) updateData.deactivationHistory = arrayUnion(serverTimestamp());
    
    await updateDoc(docRef, { ...updateData, updatedAt: serverTimestamp() });
    invalidateCache('clients');
    
    const clientName = data.denominacion || originalData.denominacion;
    let details = `actualizó el cliente ${clientName}`;
    if (data.ownerId && data.ownerId !== originalData.ownerId) details = `reasignó el cliente ${clientName} a ${data.ownerName}`;
    
    await logActivity({ userId, userName, type: 'update', entityType: 'client', entityId: id, entityName: clientName, details, ownerName: data.ownerName || originalData.ownerName });
};

export const updateClientTangoMapping = async (id: string, data: ClientTangoUpdate, userId: string, userName: string) => {
    const docRef = doc(db, 'clients', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('clients');
};

export const deleteClient = async (id: string, userId: string, userName: string): Promise<void> => {
    const clientRef = doc(db, 'clients', id);
    const batch = writeBatch(db);
    
    const oppsQuery = query(collections.opportunities, where('clientId', '==', id));
    const oppsSnap = await getDocs(oppsQuery);
    oppsSnap.forEach(d => batch.delete(d.ref));
    
    const actQuery = query(collections.clientActivities, where('clientId', '==', id));
    const actSnap = await getDocs(actQuery);
    actSnap.forEach(d => batch.delete(d.ref));

    batch.delete(clientRef);
    await batch.commit();
    invalidateCache();
};

export const bulkDeleteClients = async (clientIds: string[], userId: string, userName: string) => {
    if (!clientIds.length) return;
    const batch = writeBatch(db);
    for (const id of clientIds) batch.delete(doc(db, 'clients', id));
    await batch.commit();
    invalidateCache();
};

export const bulkUpdateClients = async (updates: { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[], userId: string, userName: string) => {
    const batch = writeBatch(db);
    for (const { id, data } of updates) batch.update(doc(db, 'clients', id), { ...data, updatedAt: serverTimestamp() });
    await batch.commit();
    invalidateCache('clients');
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

// ESTA ES LA FUNCIÓN QUE TE FALTABA
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

// --- Opportunities ---
const mapOpportunityDoc = (doc: any): Opportunity => {
    const data = doc.data();
    const convert = (val: any) => val instanceof Timestamp ? val.toDate().toISOString() : val;
    return {
        id: doc.id,
        ...data,
        createdAt: convert(data.createdAt),
        closeDate: data.closeDate instanceof Timestamp ? data.closeDate.toDate().toISOString().split('T')[0] : data.closeDate,
        updatedAt: convert(data.updatedAt),
        stageChangedAt: convert(data.stageChangedAt)
    } as Opportunity;
};

export const getOpportunities = async (): Promise<Opportunity[]> => {
    const snapshot = await getDocs(collections.opportunities);
    return snapshot.docs.map(mapOpportunityDoc);
};

export const getAllOpportunities = getOpportunities;

export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    const q = query(collections.opportunities, where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapOpportunityDoc);
};

export const createOpportunity = async (data: Omit<Opportunity, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const docRef = await addDoc(collections.opportunities, { ...data, createdAt: serverTimestamp(), stageChangedAt: serverTimestamp() });
    invalidateCache('opportunities');
    await logActivity({ userId, userName, type: 'create', entityType: 'opportunity', entityId: docRef.id, entityName: data.title, details: `creó oportunidad ${data.title}`, ownerName });
    return docRef.id;
};

export const updateOpportunity = async (id: string, data: Partial<Omit<Opportunity, 'id'>>, userId: string, userName: string, ownerName: string, pendingInvoices?: any[]): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const updateData: any = { ...data, updatedAt: serverTimestamp() };
    if (data.stage) updateData.stageChangedAt = serverTimestamp();
    
    await updateDoc(docRef, updateData);
    invalidateCache('opportunities');

    if (pendingInvoices && pendingInvoices.length > 0) {
        for (const inv of pendingInvoices) await createInvoice({ ...inv, opportunityId: id }, userId, userName, ownerName);
    }
};

export const deleteOpportunity = async (id: string, userId: string, userName: string) => {
    await deleteDoc(doc(db, 'opportunities', id));
    invalidateCache('opportunities');
};

// --- Activities & People ---
export const getClientActivities = async (clientId: string): Promise<ClientActivity[]> => {
    const q = query(collections.clientActivities, where('clientId', '==', clientId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ 
        id: doc.id, ...doc.data(), 
        timestamp: timestampToISO(doc.data().timestamp)!,
        dueDate: timestampToISO(doc.data().dueDate),
        completedAt: timestampToISO(doc.data().completedAt)
    } as ClientActivity));
};

export const createClientActivity = async (activityData: Omit<ClientActivity, 'id' | 'timestamp'>): Promise<string> => {
    const dataToSave: any = { ...activityData, timestamp: serverTimestamp() };
    if (activityData.isTask && activityData.dueDate) dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
    const docRef = await addDoc(collections.clientActivities, dataToSave);
    return docRef.id;
};

export const updateClientActivity = async (id: string, data: Partial<ClientActivity>) => {
    const docRef = doc(db, 'client-activities', id);
    const updates: any = { ...data, updatedAt: serverTimestamp() };
    if (data.completed) updates.completedAt = serverTimestamp();
    if (data.dueDate) updates.dueDate = Timestamp.fromDate(new Date(data.dueDate));
    await updateDoc(docRef, updates);
};

export const getPeopleByClientId = async (clientId: string): Promise<Person[]> => {
    const q = query(collections.people, where("clientIds", "array-contains", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
};

export const createPerson = async (data: Omit<Person, 'id'>, userId: string, userName: string) => {
    const docRef = await addDoc(collections.people, { ...data, createdAt: serverTimestamp() });
    return docRef.id;
};

export const updatePerson = async (id: string, data: Partial<Person>, userId: string, userName: string) => {
    await updateDoc(doc(db, 'people', id), { ...data, updatedAt: serverTimestamp() });
};

export const deletePerson = async (id: string, userId: string, userName: string) => {
    await deleteDoc(doc(db, 'people', id));
};

export const getActivitiesForEntity = async (entityId: string): Promise<ActivityLog[]> => {
    const q = query(collections.activities, where('entityId', '==', entityId), orderBy('timestamp', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: timestampToISO(doc.data().timestamp)! } as ActivityLog));
};
// --- Invoices ---
export const getInvoices = async (): Promise<Invoice[]> => {
    const snapshot = await getDocs(query(collections.invoices, orderBy("dateGenerated", "desc")));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const opps = await getOpportunitiesByClientId(clientId);
    if (opps.length === 0) return [];
    const oppIds = opps.map(o => o.id);
    const q = query(collections.invoices, where("opportunityId", "in", oppIds));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const createInvoice = async (data: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const docRef = await addDoc(collections.invoices, { ...data, dateGenerated: new Date().toISOString() });
    invalidateCache('invoices');
    return docRef.id;
};

export const updateInvoice = async (id: string, data: Partial<Invoice>, userId: string, userName: string, ownerName: string) => {
    await updateDoc(doc(db, 'invoices', id), data);
    invalidateCache('invoices');
};

export const deleteInvoicesInBatches = async (ids: string[], userId: string, userName: string, options?: any) => {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'invoices', id)));
    await batch.commit();
    return { deleted: ids, failed: [] };
};

// --- Payments ---
export const getPaymentEntries = async (): Promise<PaymentEntry[]> => {
    const snapshot = await getDocs(query(collections.paymentEntries, orderBy("createdAt", "desc")));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentEntry));
};

export const replacePaymentEntriesForAdvisor = async (advisorId: string, advisorName: string, entries: any[], userId: string, userName: string) => {
    const existing = await getDocs(query(collections.paymentEntries, where('advisorId', '==', advisorId)));
    const batch = writeBatch(db);
    existing.forEach(doc => batch.delete(doc.ref));
    entries.forEach(e => batch.set(doc(collections.paymentEntries), { ...e, advisorId, advisorName, createdAt: new Date().toISOString() }));
    await batch.commit();
};

export const updatePaymentEntry = async (id: string, updates: any, audit?: any) => {
    await updateDoc(doc(db, 'payment_entries', id), updates);
};

export const deletePaymentEntries = async (ids: string[]) => {
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'payment_entries', id)));
    await batch.commit();
};

export const requestPaymentExplanation = async (id: string, data: any) => {
    await updateDoc(doc(db, 'payment_entries', id), {
        lastExplanationRequestAt: new Date().toISOString(),
        lastExplanationRequestById: data.requestedById,
        lastExplanationRequestByName: data.requestedByName,
        explanationRequestNote: data.note
    });
};

// --- Config, Permissions & Others ---
export const getPrograms = async (): Promise<Program[]> => {
    const cachedData = getFromCache('programs');
    if (cachedData) return cachedData;
    const snapshot = await getDocs(query(collections.programs, orderBy("name")));
    const programs = snapshot.docs.map(doc => {
      const data = doc.data();
      // Ensure schedules structure
      if (!data.schedules) {
         return { id: doc.id, ...data, schedules: [{ id: 'default', daysOfWeek: data.daysOfWeek || [], startTime: data.startTime || '', endTime: data.endTime || '' }] } as Program;
      }
      return { id: doc.id, ...data } as Program;
    });
    setInCache('programs', programs);
    return programs;
};

export const getAreaPermissions = async () => {
    const docSnap = await getDoc(doc(db, 'system_config', PERMISSIONS_DOC_ID));
    return docSnap.exists() ? docSnap.data().permissions : defaultPermissions;
};
export const updateAreaPermissions = async (permissions: any) => {
    await setDoc(doc(db, 'system_config', PERMISSIONS_DOC_ID), { permissions }, { merge: true });
};
export const getChatSpaces = async (): Promise<ChatSpaceMapping[]> => {
    const snap = await getDocs(collections.chatSpaces);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSpaceMapping));
};

export const getCoachingSessions = async (): Promise<CoachingSession[]> => {
    const snap = await getDocs(collections.coachingSessions);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachingSession));
};

export const getCanjes = async () => [];
export const createCanje = async () => '';
export const updateCanje = async () => {};
export const deleteCanje = async () => {};
export const getVacationRequests = async () => [];
export const createVacationRequest = async () => ({ docId: '', emailPayload: null });
export const updateVacationRequest = async () => {};
export const deleteVacationRequest = async () => {};
export const getSystemHolidays = async () => [];
export const getObjectiveVisibilityConfig = async () => ({});
export const getOpportunityAlertsConfig = async () => ({});
export const getCommercialItems = async () => [];
export const createCommercialItem = async () => {};
export const updateCommercialItem = async () => {};
export const deleteCommercialItem = async () => {};
export const saveProgram = async () => {};
export const updateProgram = async () => {};
export const deleteProgram = async () => {};
