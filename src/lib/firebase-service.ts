
import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import type { Client, Person } from './types';

const clientsCollection = collection(db, 'clients');
const peopleCollection = collection(db, 'people');

// --- Client Functions ---

export const getClients = async (): Promise<Client[]> => {
    const snapshot = await getDocs(clientsCollection);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
};

export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Client;
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
    const snapshot = await getDocs(peopleCollection);
    const allPeople = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Person));
    return allPeople.filter(person => person.clientIds.includes(clientId));
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
