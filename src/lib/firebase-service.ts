

'use client';

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalFile, OrdenPautado, InvoiceStatus, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, VacationRequest, VacationRequestStatus, MonthlyClosure, AreaType, ScreenName, ScreenPermission, OpportunityAlertsConfig } from './types';
import { logActivity } from './activity-logger';
import { sendEmail, createCalendarEvent as apiCreateCalendarEvent } from './google-gmail-service';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { defaultPermissions } from './data';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';


const SUPER_ADMIN_EMAIL = 'lchena@airedesantafe.com.ar';
const PERMISSIONS_DOC_ID = 'area_permissions';

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
};

const cache: {
    [key: string]: {
        data: any;
        timestamp: number;
    }
} = {};

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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

// --- Config Functions ---

export const getOpportunityAlertsConfig = async (): Promise<OpportunityAlertsConfig> => {
    const docRef = doc(collections.systemConfig, 'opportunity_alerts');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
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
        
        transaction.update(requestRef, updatePayload);
    });

    invalidateCache('licenses');
    const requestAfterUpdate = (await getDoc(requestRef)).data() as VacationRequest;
    
    let emailPayload: { to: string, subject: string, body: string } | null = null;
    if (applicantEmail) {
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
    
    return { emailPayload };
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
export const getInvoices = async (): Promise<Invoice[]> => {
    const cachedData = getFromCache('invoices');
    if (cachedData) return cachedData;

    const snapshot = await getDocs(query(collections.invoices, orderBy("dateGenerated", "desc")));
    const invoices = snapshot.docs.map(doc => {
        const data = doc.data();
        
        const validDate = data.date && typeof data.date === 'string' ? parseDateWithTimezone(data.date) : null;
        const validDatePaid = data.datePaid && typeof data.datePaid === 'string' ? parseDateWithTimezone(data.datePaid) : null;

        return {
            id: doc.id,
            ...data,
            date: validDate ? format(validDate, 'yyyy-MM-dd') : undefined,
            dateGenerated: data.dateGenerated instanceof Timestamp ? data.dateGenerated.toDate().toISOString() : data.dateGenerated,
            datePaid: validDatePaid ? format(validDatePaid, 'yyyy-MM-dd') : undefined,
        } as Invoice;
    });
    setInCache('invoices', invoices);
    return invoices;
};


export const getInvoicesForOpportunity = async (opportunityId: string): Promise<Invoice[]> => {
    const q = query(collections.invoices, where("opportunityId", "==", opportunityId));
    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
    invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    return invoices;
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const oppsSnapshot = await getDocs(query(collections.opportunities, where("clientId", "==", clientId)));
    const opportunityIds = oppsSnapshot.docs.map(doc => doc.id);
    if (opportunityIds.length === 0) return [];
    
    const q = query(collections.invoices, where("opportunityId", "in", opportunityIds));
    const invoicesSnapshot = await getDocs(q);
    return invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const createInvoice = async (invoiceData: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const dataToSave = {
      ...invoiceData,
      dateGenerated: new Date().toISOString(),
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
    
    if (data.closeDate && !(data.closeDate instanceof Timestamp)) {
        const validDate = parseDateWithTimezone(data.closeDate);
        opp.closeDate = validDate ? validDate.toISOString().split('T')[0] : '';
    } else if (data.closeDate instanceof Timestamp) {
        opp.closeDate = data.closeDate.toDate().toISOString().split('T')[0];
    }
    
    return opp;
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
    
    const q = query(collections.opportunities, where('clientId', 'in', Array.from(userClientIds)));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapOpportunityDoc);
}


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
        createdAt: serverTimestamp() 
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

    if (data.stage && data.stage !== originalData.stage) {
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
