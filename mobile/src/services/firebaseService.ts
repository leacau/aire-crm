import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ActivityLog, Client, ClientActivity, Opportunity, User } from '../types';

const usersCollection = collection(db, 'users');
const clientsCollection = collection(db, 'clients');
const opportunitiesCollection = collection(db, 'opportunities');
const activitiesCollection = collection(db, 'activities');
const clientActivitiesCollection = collection(db, 'client-activities');

const convertTimestamp = (value: any) => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return value ?? undefined;
};

const mapDoc = <T>(snapshot: any): T => ({ id: snapshot.id, ...snapshot.data() });

export const getUserProfile = async (uid: string): Promise<User | null> => {
  const ref = doc(usersCollection, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }

  return mapDoc<User>(snap);
};

export const getClientsForUser = async (userId: string): Promise<Client[]> => {
  const q = query(clientsCollection, where('ownerId', '==', userId));
  const snapshot = await getDocs(q);
  const clients = snapshot.docs.map(docSnap => ({
    ...mapDoc<Client>(docSnap),
    denominacion: docSnap.data().denominacion
  }));

  return clients.sort((a, b) => a.denominacion.localeCompare(b.denominacion));
};

export const getOpportunitiesForUser = async (userId: string): Promise<Opportunity[]> => {
  const clients = await getClientsForUser(userId);
  if (!clients.length) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < clients.length; i += 10) {
    chunks.push(clients.slice(i, i + 10).map(client => client.id));
  }

  const opportunities: Opportunity[] = [];
  for (const chunk of chunks) {
    const q = query(opportunitiesCollection, where('clientId', 'in', chunk));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      opportunities.push({
        ...mapDoc<Opportunity>(docSnap),
        closeDate: convertTimestamp(data.closeDate)
      });
    });
  }

  return opportunities;
};

export const getTasksForUser = async (userId: string): Promise<ClientActivity[]> => {
  const q = query(
    clientActivitiesCollection,
    where('userId', '==', userId),
    where('isTask', '==', true)
  );
  const snapshot = await getDocs(q);

  const tasks = snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      ...mapDoc<ClientActivity>(docSnap),
      dueDate: convertTimestamp(data.dueDate),
      completedAt: convertTimestamp(data.completedAt)
    };
  });

  return tasks.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
};

export const getRecentActivities = async (limitValue = 10): Promise<ActivityLog[]> => {
  const q = query(activitiesCollection, orderBy('timestamp', 'desc'), limit(limitValue));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      ...mapDoc<ActivityLog>(docSnap),
      timestamp: convertTimestamp(data.timestamp) ?? new Date().toISOString()
    };
  });
};
