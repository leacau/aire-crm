

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { Client, Person, Opportunity, ActivityLog, OpportunityStage, ClientActivity, User } from './types';
import { logActivity } from './activity-logger';

const usersCollection = collection(db, 'users');
const clientsCollection = collection(db, 'clients');
const peopleCollection = collection(db, 'people');
const opportunitiesCollection = collection(db, 'opportunities');
const activitiesCollection = collection(db, 'activities');
const clientActivitiesCollection = collection(db, 'client-activities');


// --- User Profile Functions ---

export const createUserProfile = async (uid: string, name: string, email: string): Promise<void> => {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
        name,
        email,
        role: 'Asesor', // Default role for new users
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

export const getAllUsers = async (role?: User['role']): Promise<User[]> => {
    let q = query(usersCollection);
    if (role) {
        q = query(usersCollection, where("role", "==", role));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
}


// --- Client Functions ---

export const getClients = async (): Promise<Client[]> => {
    const snapshot = await getDocs(query(clientsCollection, orderBy("denominacion")));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
};

export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        // Convert Firestore Timestamps to serializable strings
        if (data.createdAt instanceof Timestamp) {
            data.createdAt = data.createdAt.toDate().toISOString();
        }
        if (data.updatedAt instanceof Timestamp) {
            data.updatedAt = data.updatedAt.toDate().toISOString();
        }
        return { id: docSnap.id, ...data } as Client;
    }
    return null;
};

export const createClient = async (
    clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>,
    userId: string,
    userName: string
): Promise<string> => {
    const newClientData = {
        ...clientData,
        personIds: [],
        ownerId: userId,
        ownerName: userName,
        createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(clientsCollection, newClientData);
    
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
    const originalData = originalDoc.data() as Client;

    const updateData = { ...data };
    
    await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
    });

    await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'client',
        entityId: id,
        entityName: data.denominacion || originalData.denominacion,
        details: `actualizó el cliente <a href="/clients/${id}" class="font-bold text-primary hover:underline">${data.denominacion || originalData.denominacion}</a>`,
        ownerName: originalData.ownerName
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
    const peopleQuery = query(peopleCollection, where('clientIds', '==', [id]));
    const peopleSnap = await getDocs(peopleQuery);
    peopleSnap.forEach(doc => batch.delete(doc.ref));
    
    // Delete client activities
    const clientActivitiesQuery = query(clientActivitiesCollection, where('clientId', '==', id));
    const clientActivitiesSnap = await getDocs(clientActivitiesQuery);
    clientActivitiesSnap.forEach(doc => batch.delete(doc.ref));

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
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
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
    const docRef = await addDoc(opportunitiesCollection, {
        ...opportunityData,
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

export const updateOpportunity = async (
    id: string, 
    data: Partial<Omit<Opportunity, 'id'>>,
    userId: string,
    userName: string,
    ownerName: string
): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const originalData = docSnap.data() as Opportunity;

    const updateData: {[key: string]: any} = {
        ...data,
        updatedAt: serverTimestamp()
    };
    
    if (data.bonificacionPorcentaje !== undefined && data.bonificacionPorcentaje <= 0) {
        updateData.bonificacionEstado = deleteField();
        updateData.bonificacionAutorizadoPorId = deleteField();
        updateData.bonificacionAutorizadoPorNombre = deleteField();
        updateData.bonificacionFechaAutorizacion = deleteField();
    }


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
    
    await deleteDoc(docRef);

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


    await updateDoc(docRef, updateData);
};
