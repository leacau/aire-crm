import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ServerUser } from '@/lib/server/auth';
import type { Agency } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

export class AgencyApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


export async function listAgenciesServer(): Promise<Agency[]> {
  const snapshot = await dbAdmin.collection('agencies').orderBy('name').get();
  return snapshot.docs.map(doc => serializeDocument<Agency>(doc.id, doc.data()));
}

export async function createAgencyServer(
  agencyData: Omit<Agency, 'id'> | undefined,
  requester: ServerUser,
): Promise<string> {
  const name = agencyData?.name?.trim();

  if (!name) {
    throw new AgencyApiError('El nombre de la agencia es obligatorio.', 400);
  }

  const requesterName = getRequesterName(requester);
  const docRef = await dbAdmin.collection('agencies').add({
    ...agencyData,
    name,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: requester.uid,
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'agency',
    entityId: docRef.id,
    entityName: name,
    details: `creo la agencia <strong>${name}</strong>`,
    ownerName: requesterName,
  });

  return docRef.id;
}