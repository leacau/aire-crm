
import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, query, where, Timestamp } from 'firebase/firestore';
import type { Client, Person, Opportunity, Activity } from './types';

const clientsCollection = collection(db, 'clients');
const peopleCollection = collection(db, 'people');
const opportunitiesCollection = collection(db, 'opportunities');
const activitiesCollection = collection(db, 'activities');


// --- Client Functions ---

export const getClients = async (): Promise<Client[]> => {
    const snapshot = await getDocs(clientsCollection);
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
    ownerId: string
): Promise<string> => {
    const newClientData = {
        ...clientData,
        avatarUrl: `https://picsum.photos/seed/client-${Date.now()}/40/40`,
        avatarFallback: clientData.denominacion.substring(0, 2).toUpperCase(),
        personIds: [],
        ownerId,
        createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(clientsCollection, newClientData);
    return docRef.id;
};

export const updateClient = async (id: string, data: Partial<Omit<Client, 'id'>>): Promise<void> => {
    const docRef = doc(db, 'clients', id);
    const updateData = { ...data };
    if (data.denominacion && !data.avatarFallback) {
        updateData.avatarFallback = data.denominacion.substring(0, 2).toUpperCase();
    }
    
    await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
    });
};


// --- Person (Contact) Functions ---

export const getPeopleByClientId = async (clientId: string): Promise<Person[]> => {
    const q = query(peopleCollection, where("clientIds", "array-contains", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
}

export const createPerson = async (
    personData: Omit<Person, 'id'>
): Promise<string> => {
    const docRef = await addDoc(peopleCollection, {
        ...personData,
        createdAt: serverTimestamp()
    });
    
    // Link this new person to their client(s)
    for (const clientId of personData.clientIds) {
        const clientRef = doc(db, 'clients', clientId);
        await updateDoc(clientRef, {
            personIds: arrayUnion(docRef.id)
        });
    }
    
    return docRef.id;
};

export const updatePerson = async (id: string, data: Partial<Omit<Person, 'id'>>): Promise<void> => {
    const docRef = doc(db, 'people', id);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
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
    opportunityData: Omit<Opportunity, 'id'>
): Promise<string> => {
    const docRef = await addDoc(opportunitiesCollection, {
        ...opportunityData,
        createdAt: serverTimestamp()
    });
    return docRef.id;
};

export const updateOpportunity = async (id: string, data: Partial<Omit<Opportunity, 'id'>>): Promise<void> => {
    const docRef = doc(db, 'opportunities', id);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
};

// --- Activity Functions ---

export const getAllActivities = async (): Promise<Activity[]> => {
    const snapshot = await getDocs(activitiesCollection);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        // Convert Firestore Timestamps to serializable strings
        if (data.date instanceof Timestamp) {
            data.date = data.date.toDate().toISOString();
        }
        return { id: doc.id, ...data } as Activity;
    });
};
