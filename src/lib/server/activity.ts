import { FieldValue } from 'firebase-admin/firestore';

import { dbAdmin } from '@/lib/firebase-admin';

type ServerActivityPayload = {
  userId: string;
  userName: string;
  type: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  ownerName?: string;
  organizationId: string;
};

export async function logServerActivity(payload: ServerActivityPayload): Promise<void> {
  try {
    await dbAdmin.collection('activities').add({
      ...payload,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('No se pudo registrar la actividad del servidor:', error);
  }
}
