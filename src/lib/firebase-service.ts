

'use client';

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig, SupervisorComment, SupervisorCommentReply, ObjectiveVisibilityConfig, PaymentEntry, PaymentStatus, ChatSpaceMapping } from './types';
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

const parseDateWithTimezone = (dateString: string) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
};

export type ClientTangoUpdate = {
    cuit?: string;
    tangoCompanyId?: string;
    idTango?: string;
    email?: string;
    phone?: string;
    rubro?: string;
    razonSocial?: string;
    denominacion?: string;
    idAireSrl?: string;
    idAireDigital?: string;
    condicionIVA?: string;
    provincia?: string;
    localidad?: string;
    tipoEntidad?: string;
    observaciones?: string;
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
        entityType: 'opportunity_alerts_config',
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
        entityType: 'objective_visibility',
        entityId: OBJECTIVE_VISIBILITY_DOC_ID,
        entityName: 'Visibilidad de objetivos',
        details: 'actualizó la fecha de visibilidad de objetivos.',
        ownerName: userName,
    });
};


// --- Permissions ---
export const getAreaPermissions = async (): Promise<Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>> => {
    const cachedData = getFromCache('permissions');
    if (cachedData) return cachedData;
    
    // Assuming the super admin's UID is known or can be fetched if not available.
    // For now, this part might need adjustment if the UID is not static.
    // This function can't easily get the current user's ID, so it's a simplification.
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


// --- Monthly Closure Functions ---
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
        entityType: 'monthly_closure',
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
                try {
                    return new Date(field).toISOString();
                } catch (e) {
                    return undefined; 
                }
            }
            return undefined;
        };

        return {
            id: doc.id,
            ...data,
            requestDate: convertTimestamp(data.requestDate)!,
            approvedAt: convertTimestamp(data.approvedAt),
        } as VacationRequest;
    });
    setInCache('licenses', requests);
    return requests;
};


export const createVacationRequest = async (
    requestData: Omit<VacationRequest, 'id' | 'status'>,
    managerEmail: string | null
): Promise<{ docId: string; emailPayload: { to: string, subject: string, body: string } | null }> => {
    const dataToSave: any = {
        ...requestData,
        status: 'Pendiente' as const,
        requestDate: serverTimestamp(),
    };
    
    dataToSave.startDate = requestData.startDate;
    dataToSave.endDate = requestData.endDate;
    dataToSave.returnDate = requestData.returnDate;


    const docRef = await addDoc(collections.licenses, dataToSave);
    invalidateCache('licenses');
    
    let emailPayload: { to: string, subject: string, body: string } | null = null;

    if (managerEmail) {
        emailPayload = {
            to: managerEmail,
            subject: `Nueva Solicitud de Licencia de ${requestData.userName}`,
            body: `
                <p>Hola,</p>
                <p>Has recibido una nueva solicitud de licencia de <strong>${requestData.userName}</strong>.</p>
                <p><strong>Período:</strong> ${format(new Date(requestData.startDate), 'P', { locale: es })} - ${format(new Date(requestData.endDate), 'P', { locale: es })}</p>
                <p><strong>Días solicitados:</strong> ${requestData.daysRequested}</p>
                <p>Para aprobar o rechazar esta solicitud, por favor ingresa a la sección "Licencias" del CRM.</p>
            `,
        };
    }

    return { docId: docRef.id, emailPayload };
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
        const userRef = doc(db, 'users', requestData.userId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
            throw "Usuario solicitante no encontrado.";
        }
        const userData = userDoc.data() as User;
        
        const updatePayload: Partial<VacationRequest> = {
            status: newStatus,
            approvedBy: approverId,
            approvedAt: new Date().toISOString(),
        };

        let newVacationDays = userData.vacationDays || 0;

        if (newStatus === 'Aprobado' && requestData.status !== 'Aprobado') {
            newVacationDays -= requestData.daysRequested;
        } 
        else if (newStatus !== 'Aprobado' && requestData.status === 'Aprobado') {
            newVacationDays += requestData.daysRequested;
        }

        if (newVacationDays !== (userData.vacationDays || 0)) {
            transaction.update(userRef, { vacationDays: newVacationDays });
            invalidateCache('users');
        }
        pendingDaysAfterUpdate = newVacationDays;
        
        transaction.update(requestRef, updatePayload);
    });

    invalidateCache('licenses');
    const requestAfterUpdate = (await getDoc(requestRef)).data() as VacationRequest;
    
    let emailPayload: { to: string, subject: string, body: string } | null = null;
    if (applicantEmail) {
        if (newStatus === 'Aprobado') {
            const today = new Date();
            const start = format(new Date(requestAfterUpdate.startDate), "d 'de' MMMM 'de' yyyy", { locale: es });
            const end = format(new Date(requestAfterUpdate.endDate), "d 'de' MMMM 'de' yyyy", { locale: es });
            const returnDate = format(new Date(requestAfterUpdate.returnDate), "d 'de' MMMM 'de' yyyy", { locale: es });
            const todayFormatted = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
            const pending = pendingDaysAfterUpdate ?? 0;

            const approvalLetter = `
                <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6;">
                  <div style="text-align: right; margin-bottom: 16px;">Santa Fé, ${todayFormatted}</div>
                  <p>Estimado/a <strong>${requestAfterUpdate.userName}</strong></p>
                  <p>Mediante la presente le informamos la autorización de la solicitud de <strong>${requestAfterUpdate.daysRequested}</strong> días de vacaciones.</p>
                  <p>Del <strong>${start}</strong> al <strong>${end}</strong> de acuerdo con el período vacacional correspondiente al año actual.</p>
                  <p>La fecha de reincorporación a la actividad laboral será el día <strong>${returnDate}</strong>.</p>
                  <p>Quedarán <strong>${pending}</strong> días pendientes de licencia ${today.getFullYear()}.</p>
                  <p>Saludos cordiales.</p>
                  <br/>
                  <div style="display:flex; gap:48px; margin-top:32px; flex-wrap: wrap;">
                    <span>Gte. de área</span>
                    <span>Jefe de área</span>
                    <span>Área de rrhh</span>
                  </div>
                  <p style="margin-top:32px;">Notificado: ____________________</p>
                </div>
            `;

            emailPayload = {
                to: applicantEmail,
                subject: `Autorización de licencia (${requestAfterUpdate.daysRequested} días)`,
                body: approvalLetter,
            };
        } else {
            emailPayload = {
                to: applicantEmail,
                subject: `Tu Solicitud de Licencia ha sido ${newStatus}`,
                body: `
                    <p>Hola ${requestAfterUpdate.userName},</p>
                    <p>Tu solicitud de licencia para el período del <strong>${format(new Date(requestAfterUpdate.startDate), 'P', { locale: es })}</strong> al <strong>${format(new Date(requestAfterUpdate.endDate), 'P', { locale: es })}</strong> ha sido <strong>${newStatus}</strong>.</p>
                    <p>Puedes ver el estado de tus solicitudes en el CRM.</p>
                `,
            };
        }
    }
    
    return { emailPayload };
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


export const deleteVacationRequest = async (requestId: string): Promise<void> => {
    const docRef = doc(db, 'licencias', requestId);
    await deleteDoc(docRef);
    invalidateCache('licenses');
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
        createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collections.prospects, dataToSave);
    invalidateCache('prospects');
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
    return docRef.id;
};

export const updateProspect = async (id: string, data: Partial<Omit<Prospect, 'id'>>, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', id);
    const prospectSnap = await getDoc(docRef);
    if (!prospectSnap.exists()) throw new Error('Prospect not found');
    const prospectData = prospectSnap.data() as Prospect;

    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    invalidateCache('prospects');

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
};

export const deleteProspect = async (id: string, userId: string, userName: string): Promise<void> => {
    const docRef = doc(db, 'prospects', id);
    const prospectSnap = await getDoc(docRef);
    if (!prospectSnap.exists()) throw new Error("Prospect not found");
    const prospectData = prospectSnap.data() as Prospect;

    await deleteDoc(docRef);
    invalidateCache('prospects');

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
    
    if (dataToSave.historialMensual) {
      delete dataToSave.historialMensual;
    }


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
    const cachedData = getFromCache('invoices');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.invoices, orderBy("dateGenerated", "desc")));
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data();
        
        const validDate = data.date && typeof data.date === 'string' ? parseDateWithTimezone(data.date) : null;
        const validDatePaid = data.datePaid && typeof data.datePaid === 'string' ? parseDateWithTimezone(data.datePaid) : null;

        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkedAt = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkedAt = rawDeletionMarkedAt instanceof Timestamp
            ? rawDeletionMarkedAt.toDate().toISOString()
            : typeof rawDeletionMarkedAt === 'string'
                ? rawDeletionMarkedAt
                : null;

        const rawDeletionMarkDate = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkDate = rawDeletionMarkDate instanceof Timestamp
            ? rawDeletionMarkDate.toDate().toISOString()
            : typeof rawDeletionMarkDate === 'string'
                ? rawDeletionMarkDate
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
            deletionMarkedAt: normalizedDeletionMarkDate,
        } as Invoice;
    });
    setInCache('invoices', invoices);
    return invoices;
};


export const getInvoicesForOpportunity = async (opportunityId: string): Promise<Invoice[]> => {
    const q = query(collections.invoices, where("opportunityId", "==", opportunityId));
    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data();
        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkDate = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkDate = rawDeletionMarkDate instanceof Timestamp
            ? rawDeletionMarkDate.toDate().toISOString()
            : typeof rawDeletionMarkDate === 'string'
                ? rawDeletionMarkDate
                : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            isCreditNote: Boolean(data.isCreditNote),
            creditNoteMarkedAt: normalizedCreditNoteDate,
            deletionMarkedAt: normalizedDeletionMarkDate,
        } as Invoice;
    });
    invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    return invoices;
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const oppsSnapshot = await getDocs(query(collections.opportunities, where("clientId", "==", clientId)));
    const opportunityIds = oppsSnapshot.docs.map(doc => doc.id);
    if (opportunityIds.length === 0) return [];
    
    const q = query(collections.invoices, where("opportunityId", "in", opportunityIds));
    const invoicesSnapshot = await getDocs(q);
    return invoicesSnapshot.docs.map(doc => {
        const data = doc.data();
        const rawCreditNoteDate = data.creditNoteMarkedAt;
        const normalizedCreditNoteDate = rawCreditNoteDate instanceof Timestamp
            ? rawCreditNoteDate.toDate().toISOString()
            : typeof rawCreditNoteDate === 'string'
                ? rawCreditNoteDate
                : null;
        const rawDeletionMarkDate = (data as any).deletionMarkedAt;
        const normalizedDeletionMarkDate = rawDeletionMarkDate instanceof Timestamp
            ? rawDeletionMarkDate.toDate().toISOString()
            : typeof rawDeletionMarkDate === 'string'
                ? rawDeletionMarkDate
                : null;

        return {
            id: doc.id,
            ...data,
            amount: normalizeInvoiceAmount(data.amount),
            isCreditNote: Boolean(data.isCreditNote),
            creditNoteMarkedAt: normalizedCreditNoteDate,
            deletionMarkedAt: normalizedDeletionMarkDate,
        } as Invoice;
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
    };
    const docRef = await addDoc(collections.invoices, dataToSave);
    invalidateCache('invoices');
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
    invalidateCache('invoices');
};

export const deleteInvoice = async (id: string, userId: string, userName: string, ownerName: string): Promise<void> => {
    const docRef = doc(db, 'invoices', id);
    const invoiceSnap = await getDoc(docRef);
    const invoiceData = invoiceSnap.data();

    await deleteDoc(docRef);
    invalidateCache('invoices');

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
    const cached = getFromCache(PAYMENT_CACHE_KEY);
    if (cached) return cached;

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

    setInCache(PAYMENT_CACHE_KEY, payments);
    return payments;
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
        batch.delete(doc(collections.paymentEntries, id));
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

export const getUserProfile = async (uid: string): Promise<User | null> => {
    const userRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return null;
}

export const updateUserProfile = async (uid: string, data: Partial<User>): Promise<void> => {
    const userRef = doc(db, 'users', uid);
    const originalSnap = await getDoc(userRef);
    if (!originalSnap.exists()) return;
    const originalData = originalSnap.data() as User;
    
    const dataToUpdate: {[key: string]: any} = { ...data };
    if (data.managerId === undefined) {
      dataToUpdate.managerId = deleteField();
    }
    
    await updateDoc(userRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp()
    });
    invalidateCache('users');

    if (data.role && data.role !== originalData.role) {
        await logActivity({
            userId: uid,
            userName: data.name || originalData.name,
            type: 'update',
            entityType: 'user',
            entityId: uid,
            entityName: data.name || originalData.name,
            details: `cambió el rol de <strong>${data.name || originalData.name}</strong> a <strong>${data.role}</strong>`,
            ownerName: data.name || originalData.name,
        });
    }
};


export const getAllUsers = async (role?: User['role']): Promise<User[]> => {
    const cacheKey = role ? `users_${role}` : 'users';
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData;

    let q;
    if (role) {
      q = query(collections.users, where("role", "==", role));
    } else {
      q = query(collections.users);
    }
    const snapshot = await getDocs(q);
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    setInCache(cacheKey, users);
    if (!role) setInCache('users', users);
    return users;
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

export const getClients = async (): Promise<Client[]> => {
    const cachedData = getFromCache('clients');
    if (cachedData) return cachedData;
    
    const snapshot = await getDocs(query(collections.clients, orderBy("denominacion")));
    const clients = snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        newClientDate: data.newClientDate instanceof Timestamp ? data.newClientDate.toDate().toISOString() : data.newClientDate,
      } as Client
    });
    setInCache('clients', clients);
    return clients;
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
    const newClientData: any = {
        ...clientData,
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
    invalidateCache('clients');
    
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
    invalidateCache('clients');

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
        updatePayload.razonSocial = data.razonSocial.trim();
    }
    if (data.denominacion && data.denominacion.trim().length > 0) {
        updatePayload.denominacion = data.denominacion.trim();
    }
    if (data.idAireSrl && data.idAireSrl.toString().trim().length > 0) {
        updatePayload.idAireSrl = data.idAireSrl.toString().trim();
    }
    if (data.idAireDigital && data.idAireDigital.toString().trim().length > 0) {
        updatePayload.idAireDigital = data.idAireDigital.toString().trim();
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
    invalidateCache();

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
    invalidateCache();
  
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



// --- Person (Contact) Functions ---

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
    invalidateCache('people'); // A generic cache invalidation
    
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


// --- Opportunity Functions ---

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

export const getOpportunities = async (): Promise<Opportunity[]> => {
    const cachedData = getFromCache('opportunities');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(collections.opportunities);
    const opportunities = snapshot.docs.map(mapOpportunityDoc);
    setInCache('opportunities', opportunities);
    return opportunities;
};

export const getAllOpportunities = async (): Promise<Opportunity[]> => {
    const snapshot = await getDocs(collections.opportunities);
    return snapshot.docs.map(mapOpportunityDoc);
};


export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    const q = query(collections.opportunities, where('clientId', '==', clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapOpportunityDoc);
};

export const getOpportunitiesForUser = async (userId: string): Promise<Opportunity[]> => {
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
};


export const createOpportunity = async (
    opportunityData: Omit<Opportunity, 'id'>,
    userId: string,
    userName: string,
    ownerName: string
): Promise<string> => {
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
    invalidateCache('opportunities');

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

    return docRef.id;
};

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
    pendingInvoices?: Omit<Invoice, 'id' | 'opportunityId'>[]
): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const originalData = docSnap.data() as Opportunity;

    const clientSnap = await getDoc(doc(db, 'clients', originalData.clientId));
    if (!clientSnap.exists()) throw new Error("Client not found for opportunity update");
    const clientData = clientSnap.data() as Client;

    const updateData: {[key: string]: any} = {
        ...data,
        updatedAt: serverTimestamp()
    };

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
    invalidateCache('opportunities');

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
    invalidateCache('opportunities');
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


// --- General Activity Functions ---

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


// --- Client-Specific Activity Functions ---

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
    const activities = snapshot.docs.map(convertActivityDoc);
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

// --- Google Chat direct spaces ---

export const getChatSpaces = async (): Promise<ChatSpaceMapping[]> => {
    const cached = getFromCache(CHAT_SPACES_CACHE_KEY);
    if (cached) return cached;

    const snap = await getDocs(collections.chatSpaces);
    const mappings: ChatSpaceMapping[] = snap.docs
        .map((docSnap) => {
            const data = docSnap.data() as any;
            if (!data?.spaceId || !data?.userEmail) return null;
            return {
                userId: docSnap.id,
                userEmail: data.userEmail as string,
                spaceId: data.spaceId as string,
                updatedById: data.updatedById as string | undefined,
                updatedByName: data.updatedByName as string | undefined,
                updatedAt: timestampToISO(data.updatedAt),
            } satisfies ChatSpaceMapping;
        })
        .filter(Boolean) as ChatSpaceMapping[];

    setInCache(CHAT_SPACES_CACHE_KEY, mappings);
    return mappings;
};

export const upsertChatSpace = async (params: {
    userId: string;
    userEmail: string;
    spaceId: string;
    updatedById: string;
    updatedByName: string;
}) => {
    const { userId, userEmail, spaceId, updatedById, updatedByName } = params;
    const docRef = doc(collections.chatSpaces, userId);

    await setDoc(
        docRef,
        {
            userId,
            userEmail,
            spaceId,
            updatedById,
            updatedByName,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );

    invalidateCache(CHAT_SPACES_CACHE_KEY);

    await logActivity({
        userId: updatedById,
        userName: updatedByName,
        type: 'update',
        entityType: 'chat_space',
        entityId: userId,
        entityName: 'Chat directo',
        details: `actualizó el space de chat para ${userEmail}.`,
        ownerName: updatedByName,
    });
};
