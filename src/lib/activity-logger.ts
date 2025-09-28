
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ActivityLog } from './types';

const activitiesCollection = collection(db, 'activities');

type LogActivityPayload = Omit<ActivityLog, 'id' | 'timestamp'>;

export const logActivity = async (payload: LogActivityPayload): Promise<void> => {
    try {
        await addDoc(activitiesCollection, {
            ...payload,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error logging activity:", error);
        // Depending on the requirements, you might want to handle this error more gracefully
        // For now, we just log it to the console.
    }
};
