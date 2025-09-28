import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { Client } from './types';

const clientsCollection = collection(db, 'clients');

// Function to get all clients
export const getClients = async (): Promise<Client[]> => {
    const snapshot = await getDocs(clientsCollection);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
};

// Function to get a single client by ID
export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = doc(db, 'clients', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Client;
    }
    return null;
};

// Function to create a new client
export const createClient = async (
    clientData: Omit<Client, 'id' | 'avatarUrl' | 'avatarFallback' | 'personIds' | 'ownerId'>,
    ownerId: string
): Promise<string> => {
    const newClientData = {
        ...clientData,
        name: clientData.name, // Main contact person
        avatarUrl: `https://picsum.photos/seed/new-${Date.now()}/40/40`,
        avatarFallback: clientData.company.substring(0, 2).toUpperCase(),
        personIds: [],
        ownerId,
        createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(clientsCollection, newClientData);
    return docRef.id;
};

// Function to update an existing client
export const updateClient = async (id: string, data: Partial<Omit<Client, 'id'>>): Promise<void> => {
    const docRef = doc(db, 'clients', id);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
};
