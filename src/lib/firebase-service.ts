

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User, Agency, UserRole, Invoice, Canje, CanjeEstado, ProposalItem, HistorialMensualItem, Program, CommercialItem, ProgramSchedule, Prospect, ProspectStatus, OrdenPautado, VacationRequest } from './types';
import { logActivity } from './activity-logger';
import { sendEmail, createCalendarEvent } from './google-gmail-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const usersCollection = collection(db, 'users');
const clientsCollection = collection(db, 'clients');
const peopleCollection = collection(db, 'people');
const opportunitiesCollection = collection(db, 'opportunities');
const activitiesCollection = collection(db, 'activities');
const clientActivitiesCollection = collection(db, 'client-activities');
const agenciesCollection = collection(db, 'agencies');
const invoicesCollection = collection(db, 'invoices');
const canjesCollection = collection(db, 'canjes');
const programsCollection = collection(db, 'programs');
const commercialItemsCollection = collection(db, 'commercial_items');
const prospectsCollection = collection(db, 'prospects');
const licensesCollection = collection(db, 'licencias');

// --- Vacation Request Functions ---

export const getVacationRequests = async (currentUser: User): Promise<VacationRequest[]> => {
    let q;
    const isManager = currentUser.role === 'Jefe' || currentUser.role === 'Gerencia' || currentUser.role === 'Administracion';

    if (isManager) {
        q = query(licensesCollection);
    } else {
        q = query(licensesCollection, where("userId", "==", currentUser.id));
    }
    const snapshot = await getDocs(q);
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRequest));
    
    // Sort client-side
    requests.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
    
    return requests;
};


export const createVacationRequest = async (requestData: Omit<VacationRequest, 'id'>, accessToken: string, managerEmail: string): Promise<string> => {
    const { userName, startDate, endDate, daysRequested, returnDate } = requestData;

    const docRef = await addDoc(licensesCollection, {
        ...requestData,
        requestDate: new Date().toISOString()
    });
    
    const subject = `Nueva Solicitud de Licencia - ${userName}`;
    const body = `
        <p>El asesor <strong>${userName}</strong> ha solicitado una licencia.</p>
        <ul>
            <li><strong>Período:</strong> ${format(parseISO(startDate), 'P', { locale: es })} - ${format(parseISO(endDate), 'P', { locale: es })}</li>
            <li><strong>Días solicitados:</strong> ${daysRequested}</li>
            <li><strong>Fecha de reincorporación:</strong> ${format(parseISO(returnDate), 'P', { locale: es })}</li>
        </ul>
        <p>Para gestionar esta solicitud, por favor ingresa a la sección "Licencias" en el CRM.</p>
    `;

    await sendEmail({
        accessToken,
        to: managerEmail,
        subject,
        body,
    });
    
    return docRef.id;
};

export const updateVacationRequest = async (requestId: string, data: Partial<Omit<VacationRequest, 'id'>>, adminUserId: string, accessToken?: string): Promise<void> => {
    const requestRef = doc(db, 'licencias', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) throw new Error('Solicitud no encontrada');
    
    const originalRequest = requestSnap.data() as VacationRequest;
    
    const updateData: { [key: string]: any } = { ...data, updatedAt: serverTimestamp(), updatedBy: adminUserId };

    if (data.status === 'Aprobado' && originalRequest.status !== 'Aprobado') {
        const userRef = doc(db, 'users', originalRequest.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentDays = userSnap.data().vacationDays || 0;
            await updateDoc(userRef, {
                vacationDays: Math.max(0, currentDays - originalRequest.daysRequested)
            });
        }
        
        // Send email to user
        if (accessToken) {
            const userToNotify = await getUserProfile(originalRequest.userId);
            if (userToNotify?.email) {
                 const subject = `Tu solicitud de licencia ha sido Aprobada`;
                 const body = `
                    <p>Hola ${userToNotify.name},</p>
                    <p>Tu solicitud de licencia para el período del ${format(parseISO(originalRequest.startDate), 'P', { locale: es })} al ${format(parseISO(originalRequest.endDate), 'P', { locale: es })} ha sido aprobada.</p>
                    <p>¡Que las disfrutes!</p>
                 `;
                 await sendEmail({ accessToken, to: userToNotify.email, subject, body });
            }
        }
    }
    
    await updateDoc(requestRef, updateData);
};


export const deleteVacationRequest = async (requestId: string, adminUserId: string): Promise<void> => {
    const docRef = doc(db, 'licencias', requestId);
    await deleteDoc(docRef);
};


// --- Prospect Functions ---
export const getProspects = async (): Promise<Prospect[]> => {
    const snapshot = await getDocs(query(prospectsCollection, orderBy("createdAt", "desc")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
      return { 
          id: doc.id,
          ...data,
          createdAt: convertTimestamp(data.createdAt),
          statusChangedAt: convertTimestamp(data.statusChangedAt),
      } as Prospect
    });
};

export const createProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>, userId: string, userName: string): Promise<string> => {
    const dataToSave = {
        ...prospectData,
        ownerId: userId,
        ownerName: userName,
        createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(prospectsCollection, dataToSave);
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
    const snapshot = await getDocs(query(programsCollection, orderBy("name")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      // On-the-fly migration for old data structure
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
    const docRef = await addDoc(programsCollection, { ...dataToSave, createdBy: userId, createdAt: serverTimestamp() });
    
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

const parseDateWithTimezone = (dateString: string) => {
    // For "YYYY-MM-DD", this creates a date at midnight in the local timezone,
    // avoiding the off-by-one error caused by UTC conversion.
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const getCommercialItems = async (date: string): Promise<CommercialItem[]> => {
    const q = query(commercialItemsCollection, where("date", "==", date));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
        return { 
            id: doc.id, 
            ...data,
            date: format(parseDateWithTimezone(data.date), 'yyyy-MM-dd'),
            pntReadAt: convertTimestamp(data.pntReadAt),
        } as CommercialItem
    });
};

export const getCommercialItemsBySeries = async (seriesId: string): Promise<CommercialItem[]> => {
    const q = query(commercialItemsCollection, where("seriesId", "==", seriesId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        date: format(parseDateWithTimezone(data.date), 'yyyy-MM-dd')
      } as CommercialItem
    });
};

export const createCommercialItem = async (item: Omit<CommercialItem, 'id'>, userId: string, userName: string): Promise<string> => {
    const dataToSave: { [key: string]: any } = { ...item, createdAt: serverTimestamp(), createdBy: userId };

    Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === undefined) {
            delete dataToSave[key];
        }
    });

    const docRef = await addDoc(commercialItemsCollection, dataToSave);
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'commercial_item',
        entityId: docRef.id,
        entityName: item.title || item.description,
        details: `creó un elemento comercial <strong>${item.title || item.description}</strong>`,
        ownerName: item.clientName || userName,
    });

    return docRef.id;
};


export const saveCommercialItem = async (item: Omit<CommercialItem, 'id' | 'date'>, dates: Date[], userId: string, isEditingSeries?: boolean): Promise<string | void> => {
    const batch = writeBatch(db);
    const newSeriesId = item.seriesId || doc(collection(db, 'dummy')).id;

    const formattedDates = new Set(dates.map(d => d.toISOString().split('T')[0]));
    
    const itemToSave: {[key: string]: any} = {...item};
    if (!itemToSave.clientId) {
      delete itemToSave.clientId;
      delete itemToSave.clientName;
    }
    if (!itemToSave.opportunityId) {
      delete itemToSave.opportunityId;
      delete itemToSave.opportunityTitle;
    }

    if (isEditingSeries && item.seriesId) {
        // If editing, find existing items in the series to update or delete
        const existingItems = await getCommercialItemsBySeries(item.seriesId);

        // Delete items that are no longer in the selected dates
        for (const existingItem of existingItems) {
            if (!formattedDates.has(existingItem.date)) {
                const docRef = doc(db, 'commercial_items', existingItem.id);
                batch.delete(docRef);
            }
        }

        // Update existing or create new for the selected dates
        for (const dateStr of formattedDates) {
            const existingItem = existingItems.find(i => i.date === dateStr);
            const dataToSave = { ...itemToSave, seriesId: newSeriesId, date: dateStr, updatedBy: userId, updatedAt: serverTimestamp() };
            
            const docRef = existingItem ? doc(db, 'commercial_items', existingItem.id) : doc(collection(db, 'commercial_items'));
            batch.set(docRef, dataToSave, { merge: true });
        }

    } else {
        // Creating a new series or single item
        for (const date of dates) {
            const docRef = doc(collection(db, 'commercial_items'));
            const formattedDate = date.toISOString().split('T')[0];

            const itemData: Omit<CommercialItem, 'id'> = {
                ...item,
                date: formattedDate,
                seriesId: dates.length > 1 ? newSeriesId : undefined,
            };

            const dataToSave = { ...itemData, createdBy: userId };

            batch.set(docRef, dataToSave);
        }
    }
    
    await batch.commit();

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
    const snapshot = await getDocs(query(canjesCollection, orderBy("fechaCreacion", "desc")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
      
      const canje: Canje = { 
          id: doc.id,
          ...data,
          fechaCreacion: convertTimestamp(data.fechaCreacion),
          fechaResolucion: convertTimestamp(data.fechaResolucion),
          fechaCulminacion: convertTimestamp(data.fechaCulminacion),
      } as Canje;
      
      if (canje.historialMensual) {
        canje.historialMensual = canje.historialMensual.map(h => ({
          ...h,
          fechaEstado: convertTimestamp(h.fechaEstado),
          fechaCulminacion: convertTimestamp(h.fechaCulminacion),
        })).sort((a,b) => b.mes.localeCompare(a.mes));
      }

      return canje;
    });
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
    
    // Do not save this on creation, it's for monthly management
    if (dataToSave.historialMensual) {
      delete dataToSave.historialMensual;
    }


    const docRef = await addDoc(canjesCollection, dataToSave);
    
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

    // Handle canje 'Una vez' approval
    if (data.tipo === 'Una vez' && data.estado === 'Aprobado' && originalData.estado !== 'Aprobado') {
        updateData.culminadoPorId = userId;
        updateData.culminadoPorName = userName;
    }
    
    // Handle 'Mensual' history items (convert dates back to strings for Firestore)
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
    const snapshot = await getDocs(query(invoicesCollection, orderBy("dateGenerated", "desc")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
          id: doc.id,
          ...data,
          dateGenerated: data.dateGenerated instanceof Timestamp ? data.dateGenerated.toDate().toISOString() : data.dateGenerated,
          datePaid: data.datePaid instanceof Timestamp ? data.datePaid.toDate().toISOString() : data.datePaid,
       } as Invoice
    });
};

export const getInvoicesForOpportunity = async (opportunityId: string): Promise<Invoice[]> => {
    const q = query(invoicesCollection, where("opportunityId", "==", opportunityId));
    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
    // Sort manually to avoid composite index requirement
    invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());
    return invoices;
};

export const getInvoicesForClient = async (clientId: string): Promise<Invoice[]> => {
    const oppsSnapshot = await getDocs(query(opportunitiesCollection, where("clientId", "==", clientId)));
    const opportunityIds = oppsSnapshot.docs.map(doc => doc.id);
    if (opportunityIds.length === 0) return [];
    
    const q = query(invoicesCollection, where("opportunityId", "in", opportunityIds));
    const invoicesSnapshot = await getDocs(q);
    return invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const createInvoice = async (invoiceData: Omit<Invoice, 'id'>, userId: string, userName: string, ownerName: string): Promise<string> => {
    const dataToSave = {
        ...invoiceData,
        dateGenerated: new Date(invoiceData.dateGenerated).toISOString(),
    };
    
    const docRef = await addDoc(invoicesCollection, dataToSave);
    
    const oppSnap = await getDoc(doc(db, 'opportunities', invoiceData.opportunityId));
    const oppTitle = oppSnap.exists() ? oppSnap.data().title : `ID ${invoiceData.opportunityId}`;

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'invoice',
        entityId: docRef.id,
        entityName: `Factura #${invoiceData.invoiceNumber || docRef.id}`,
        details: `creó la factura #${invoiceData.invoiceNumber} para la oportunidad "${oppTitle}"`,
        ownerName: userName,
    });

    return docRef.id;
};

export const updateInvoice = async (id: string, data: Partial<Omit<Invoice, 'id'>>, userId: string, userName: string, ownerName: string): Promise<void> => {
    const docRef = doc(db, 'invoices', id);
    const updateData: Partial<Invoice> & { [key: string]: any } = {...data};

    // Ensure we don't try to update the ID
    delete updateData.id;

    if (updateData.status === 'Pagada' && !updateData.datePaid) {
        updateData.datePaid = new Date().toISOString();
    }
    
    await updateDoc(docRef, updateData);
    
    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'invoice',
        entityId: id,
        entityName: `Factura #${data.invoiceNumber || id}`,
        details: `actualizó la factura #${data.invoiceNumber || id}`,
        ownerName: ownerName
    });
};

export const deleteInvoice = async (id: string, userId: string, userName: string, ownerName: string): Promise<void> => {
    const docRef = doc(db, 'invoices', id);
    const invoiceSnap = await getDoc(docRef);
    const invoiceData = invoiceSnap.data();

    await deleteDoc(docRef);

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
    const snapshot = await getDocs(query(agenciesCollection, orderBy("name")));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agency));
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
    const docRef = await addDoc(agenciesCollection, newAgencyData);
    
    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'agency',
        entityId: docRef.id,
        entityName: agencyData.name,
        details: `creó la agencia <strong>${agencyData.name}</strong>`,
        ownerName: userName // Or a more generic term if agencies don't have owners
    });

    return docRef.id;
};


// --- User Profile Functions ---

export const createUserProfile = async (uid: string, name: string, email: string, photoURL?: string): Promise<void> => {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
        name,
        email,
        role: 'Asesor', // Default role for new users
        photoURL: photoURL || null,
        createdAt: serverTimestamp(),
    });
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

    if (data.role && data.role !== originalData.role) {
        await logActivity({
            userId: uid, // This might need to be the admin user ID
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
    let q;
    if (role) {
      q = query(usersCollection, where("role", "==", role));
    } else {
      q = query(usersCollection);
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

export const getUsersByRole = async (role: UserRole): Promise<User[]> => {
    const q = query(usersCollection, where("role", "==", role));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
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

    // 1. Find all clients owned by the user and unassign them
    const clientsQuery = query(clientsCollection, where('ownerId', '==', userIdToDelete));
    const clientsSnapshot = await getDocs(clientsQuery);
    clientsSnapshot.forEach(doc => {
        batch.update(doc.ref, {
            ownerId: deleteField(),
            ownerName: deleteField()
        });
    });

    // 2. Find all prospects owned by the user and unassign them
    const prospectsQuery = query(prospectsCollection, where('ownerId', '==', userIdToDelete));
    const prospectsSnapshot = await getDocs(prospectsQuery);
    prospectsSnapshot.forEach(doc => {
        batch.update(doc.ref, {
            ownerId: deleteField(),
            ownerName: deleteField()
        });
    });
    
    // 3. Delete the user document
    batch.delete(userRef);

    // Commit all changes in a single batch
    await batch.commit();

    // 4. Log the admin activity
    await logActivity({
        userId: adminUserId,
        userName: adminUserName,
        type: 'delete',
        entityType: 'user',
        entityId: userIdToDelete,
        entityName: userData.name,
        details: `eliminó al usuario <strong>${userData.name}</strong> y desasignó ${clientsSnapshot.size} cliente(s) y ${prospectsSnapshot.size} prospecto(s).`,
        ownerName: adminUserName, // The action is owned by the admin
    });

    // Note: Deleting from Firebase Auth is a separate, client-side or admin SDK action and is not handled here.
};


// --- Client Functions ---

export const getClients = async (): Promise<Client[]> => {
    const snapshot = await getDocs(query(clientsCollection, orderBy("denominacion")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        newClientDate: data.newClientDate instanceof Timestamp ? data.newClientDate.toDate().toISOString() : data.newClientDate,
      } as Client
    });
};

export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        // Convert Firestore Timestamps to serializable strings
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
        // Do not add newClientDate if it's not a new client
    }
    
    if (newClientData.agencyId === undefined) {
        delete newClientData.agencyId;
    }

    const docRef = await addDoc(clientsCollection, newClientData);
    
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
    
    // Clean up undefined fields before sending to Firestore
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
            delete updateData[key];
        }
    });

    // Handle deactivation logic
    if (data.isDeactivated === true && originalData.isDeactivated === false) {
        updateData.deactivationHistory = arrayUnion(serverTimestamp());
    }
    
    await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
    });

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

    // Delete opportunities associated with the client
    const oppsQuery = query(opportunitiesCollection, where('clientId', '==', id));
    const oppsSnap = await getDocs(oppsQuery);
    oppsSnap.forEach(doc => batch.delete(doc.ref));

    // Delete people associated ONLY with this client
    const peopleQuery = query(peopleCollection, where('clientIds', 'array-contains', id));
    const peopleSnap = await getDocs(peopleQuery);
    peopleSnap.forEach(doc => batch.delete(doc.ref));
    
    // Delete client activities
    const clientActivitiesQuery = query(clientActivitiesCollection, where('clientId', '==', id));
    const clientActivitiesSnap = await getDocs(clientActivitiesQuery);
    clientActivitiesSnap.forEach(doc => batch.delete(doc.ref));

    // Delete invoices associated with the client's opportunities
    const clientOpps = oppsSnap.docs.map(d => d.id);
    if (clientOpps.length > 0) {
      const invoicesQuery = query(invoicesCollection, where('opportunityId', 'in', clientOpps));
      const invoicesSnap = await getDocs(invoicesQuery);
      invoicesSnap.forEach(doc => batch.delete(doc.ref));
    }


    // Finally, delete the client itself
    batch.delete(clientRef);

    await batch.commit();

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
  
      const oppsQuery = query(opportunitiesCollection, where('clientId', '==', clientId));
      const oppsSnap = await getDocs(oppsQuery);
      oppsSnap.forEach(doc => batch.delete(doc.ref));
  
      const activitiesQuery = query(clientActivitiesCollection, where('clientId', '==', clientId));
      const activitiesSnap = await getDocs(activitiesQuery);
      activitiesSnap.forEach(doc => batch.delete(doc.ref));
  
      const peopleQuery = query(peopleCollection, where('clientIds', 'array-contains', clientId));
      const peopleSnap = await getDocs(peopleQuery);
      peopleSnap.forEach(doc => batch.delete(doc.ref));

      // Delete invoices
      const clientOpps = oppsSnap.docs.map(d => d.id);
      if (clientOpps.length > 0) {
        const invoicesQuery = query(invoicesCollection, where('opportunityId', 'in', clientOpps));
        const invoicesSnap = await getDocs(invoicesQuery);
        invoicesSnap.forEach(doc => batch.delete(doc.ref));
      }
    }
  
    await batch.commit();
  
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
    const q = query(peopleCollection, where("clientIds", "array-contains", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
}

export const createPerson = async (
    personData: Omit<Person, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const docRef = await addDoc(peopleCollection, {
        ...personData,
        createdAt: serverTimestamp()
    });
    
    // Link this new person to their client(s)
    if (personData.clientIds) {
        for (const clientId of personData.clientIds) {
            const clientRef = doc(db, 'clients', clientId);
            const clientSnap = await getDoc(clientRef);
            if (clientSnap.exists()) {
                const clientData = clientSnap.data() as Client;
                await updateDoc(clientRef, {
                    personIds: arrayUnion(docRef.id)
                });

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

    if (originalData.clientIds && originalData.clientIds.length > 0) {
        const clientRef = doc(db, 'clients', originalData.clientIds[0]);
        const clientSnap = await getDoc(clientRef);
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
    
    // Just delete the person. We don't remove them from the client's personIds array
    // to avoid complex state management on the client. It's harmless to have a stale ID.
    await deleteDoc(personRef);

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

export const getAllOpportunities = async (): Promise<Opportunity[]> => {
    const snapshot = await getDocs(opportunitiesCollection);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const opp: Opportunity = { id: doc.id, ...data } as Opportunity;
      // Convert server timestamp to string if it exists
      if (data.updatedAt && data.updatedAt instanceof Timestamp) {
        // @ts-ignore
        opp.updatedAt = data.updatedAt.toDate().toISOString();
      }
       if (data.closeDate && !(data.closeDate instanceof Timestamp)) {
          // If it's a string, ensure it's in the right format for consistency.
          // This handles old and new data.
          opp.closeDate = new Date(data.closeDate).toISOString().split('T')[0];
      } else if (data.closeDate instanceof Timestamp) {
          opp.closeDate = data.closeDate.toDate().toISOString().split('T')[0];
      }

      return opp;
    });
};

export const getOpportunitiesByClientId = async (clientId: string): Promise<Opportunity[]> => {
    const q = query(opportunitiesCollection, where("clientId", "==", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
};

export const getOpportunitiesForUser = async (userId: string): Promise<Opportunity[]> => {
    const clientsSnapshot = await getDocs(query(clientsCollection, where("ownerId", "==", userId)));
    const clientIds = clientsSnapshot.docs.map(doc => doc.id);

    if (clientIds.length === 0) {
        return [];
    }

    const snapshot = await getDocs(query(opportunitiesCollection, where("clientId", "in", clientIds)));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
}

export const createOpportunity = async (
    opportunityData: Omit<Opportunity, 'id'>,
    userId: string,
    userName: string,
    ownerName: string
): Promise<string> => {
    const dataToSave: any = { ...opportunityData };
    if (dataToSave.agencyId === undefined) {
        delete dataToSave.agencyId;
    }
    // Remove legacy fields on creation
    delete dataToSave.pautados;


    const docRef = await addDoc(opportunitiesCollection, {
        ...dataToSave,
        createdAt: serverTimestamp()
    });

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

        let currentDate = parseDateWithTimezone(orden.fechaInicio);
        const endDate = parseDateWithTimezone(orden.fechaFin);

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

        await logActivity({
            userId,
            userName,
            type: 'create',
            entityType: 'commercial_item_series',
            entityId: opportunity.id,
            entityName: opportunity.title,
            details: `generó <strong>${newItems.length}</strong> pautas comerciales desde la oportunidad <strong>${opportunity.title}</strong>`,
            ownerName: userName, // Assuming the person closing the deal is the owner of this log
        });
    }
};


export const updateOpportunity = async (
    id: string, 
    data: Partial<Omit<Opportunity, 'id'>>,
    userId: string,
    userName: string,
    ownerName: string,
    accessToken?: string | null
): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const originalData = docSnap.data() as Opportunity;

    const updateData: {[key: string]: any} = {
        ...data,
        updatedAt: serverTimestamp()
    };
    
    // --- Bonus Approval Logic ---
    const bonusStateChanged = data.bonificacionEstado && data.bonificacionEstado !== originalData.bonificacionEstado && originalData.bonificacionEstado === 'Pendiente';
    if (bonusStateChanged) {
        // If bonus is approved/rejected, move stage back to Negotiation
        if (originalData.stage === 'Negociación a Aprobar') {
            updateData.stage = 'Negociación';
        }
    }

     // --- Generate Commercial Items on "Closed Won" ---
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
    
    // Remove legacy 'pautados' field if it exists
    updateData.pautados = deleteField();


    await updateDoc(docRef, updateData);

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

    // Delete invoices associated with the opportunity
    const invoicesQuery = query(invoicesCollection, where('opportunityId', '==', id));
    const invoicesSnap = await getDocs(invoicesQuery);
    invoicesSnap.forEach(doc => batch.delete(doc.ref));
    
    // Delete opportunity
    batch.delete(docRef);

    await batch.commit();

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
    const q = query(activitiesCollection, orderBy('timestamp', 'desc'), limit(activityLimit));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertActivityLogDoc);
};


export const getActivitiesForEntity = async (entityId: string): Promise<ActivityLog[]> => {
    const clientRef = doc(db, 'clients', entityId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) return [];
    
    const clientOwnerId = clientSnap.data().ownerId;

    // Query for activities directly related to the client (entityId)
    const directClientActivitiesQuery = query(
        activitiesCollection, 
        where('entityId', '==', entityId),
        where('entityType', '==', 'client')
    );

    // Query for activities related to opportunities of that client
    const oppsOfClientSnap = await getDocs(query(opportunitiesCollection, where('clientId', '==', entityId)));
    const oppIds = oppsOfClientSnap.docs.map(doc => doc.id);

    const activities: ActivityLog[] = [];

    // Get direct activities
    const directClientActivitiesSnap = await getDocs(directClientActivitiesQuery);
    directClientActivitiesSnap.forEach(doc => {
        activities.push(convertActivityLogDoc(doc));
    });
    
    // Get opportunity-related activities if any
    if (oppIds.length > 0) {
        const oppActivitiesQuery = query(
            activitiesCollection, 
            where('entityType', '==', 'opportunity'), 
            where('entityId', 'in', oppIds)
        );
        const oppActivitiesSnap = await getDocs(oppActivitiesQuery);
        oppActivitiesSnap.forEach(doc => {
            activities.push(convertActivityLogDoc(doc));
        });
    }
    
    // Add person creation/update activities for this client
    const peopleSnap = await getDocs(query(peopleCollection, where('clientIds', 'array-contains', entityId)));
    const personIds = peopleSnap.docs.map(p => p.id);
    if (personIds.length > 0) {
        const personActivitiesQuery = query(
            activitiesCollection, 
            where('entityType', '==', 'person'), 
            where('entityId', 'in', personIds)
        );
         const personActivitiesSnap = await getDocs(personActivitiesQuery);
         personActivitiesSnap.forEach(doc => {
            activities.push(convertActivityLogDoc(doc));
        });
    }

    // Sort all combined activities by timestamp
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
    const q = query(clientActivitiesCollection, where('clientId', '==', clientId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertActivityDoc);
};

export const getAllClientActivities = async (): Promise<ClientActivity[]> => {
    const q = query(clientActivitiesCollection, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertActivityDoc);
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


    const docRef = await addDoc(clientActivitiesCollection, dataToSave);
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
        // If un-checking, remove the completion fields
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
};

    
