

import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp, orderBy, limit, deleteField, setDoc } from 'firebase/firestore';
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
    clientData: Omit<Client, 'id' | 'avatarUrl' | 'avatarFallback' | 'personIds' | 'ownerId'>,
    userId: string,
    userName: string
): Promise<string> => {
    const newClientData = {
        ...clientData,
        avatarUrl: `https://picsum.photos/seed/client-${Date.now()}/40/40`,
        avatarFallback: clientData.denominacion.substring(0, 2).toUpperCase(),
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
    const updateData = { ...data };
    if (data.denominacion && !data.avatarFallback) {
        updateData.avatarFallback = data.denominacion.substring(0, 2).toUpperCase();
    }
    
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
        entityName: data.denominacion || '',
        details: `actualizó el cliente <a href="/clients/${id}" class="font-bold text-primary hover:underline">${data.denominacion || 'un cliente'}</a>`,
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
            await updateDoc(clientRef, {
                personIds: arrayUnion(docRef.id)
            });
        }
    }

    await logActivity({
        userId,
        userName,
        type: 'create',
        entityType: 'person',
        entityId: docRef.id,
        entityName: personData.name,
        details: `creó el contacto <strong>${personData.name}</strong>`,
    });
    
    return docRef.id;
};

export const updatePerson = async (
    id: string, 
    data: Partial<Omit<Person, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'people', id);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });

     await logActivity({
        userId,
        userName,
        type: 'update',
        entityType: 'person',
        entityId: id,
        entityName: data.name || '',
        details: `actualizó el contacto <strong>${data.name || 'un contacto'}</strong>`,
    });
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
    const q = query(opportunitiesCollection, where("ownerId", "==", userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity));
}

export const createOpportunity = async (
    opportunityData: Omit<Opportunity, 'id'>,
    userId: string,
    userName: string
): Promise<string> => {
    const docRef = await addDoc(opportunitiesCollection, {
        ...opportunityData,
        ownerName: userName, // Also store the owner's name
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
    });

    return docRef.id;
};

export const updateOpportunity = async (
    id: string, 
    data: Partial<Omit<Opportunity, 'id'>>,
    userId: string,
    userName: string
): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Opportunity not found");
    const originalData = docSnap.data() as Opportunity;

    const clientRef = doc(db, 'clients', originalData.clientId);
    const clientSnap = await getDoc(clientRef);
    const clientName = clientSnap.exists() ? clientSnap.data().denominacion : 'un cliente';


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
        entityType: 'opportunity',
        entityId: id,
        entityName: originalData.title,
    };

    if (data.stage && data.stage !== originalData.stage) {
        await logActivity({
            ...activityDetails,
            type: 'stage_change',
            details: `cambió la etapa de <strong>${originalData.title}</strong> a <strong>${data.stage}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${clientName}</a>`,
        });
    } else {
        await logActivity({
            ...activityDetails,
            type: 'update',
            details: `actualizó la oportunidad <strong>${originalData.title}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${clientName}</a>`,
        });
    }
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

    
