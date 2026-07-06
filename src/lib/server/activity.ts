import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import type { ActivityLog } from '@/lib/types';

type LogActivityPayload = Omit<ActivityLog, 'id' | 'timestamp' | 'ownerName'> & {
  ownerName?: string;
  timestamp?: unknown;
};

export async function logServerActivity(payload: LogActivityPayload): Promise<void> {
  try {
    await dbAdmin.collection('activities').add({
      ...payload,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error logging server activity:', error);
  }
}

