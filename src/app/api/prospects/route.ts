import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Prospect } from '@/lib/types';

function mapProspect(id: string, data: FirebaseFirestore.DocumentData | undefined): Prospect {
  return serializeDocument<Prospect>(id, data);
}

function cleanProspectPayload(payload: Partial<Prospect>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'updatedAt'
      && key !== 'ownerId'
      && key !== 'ownerName'
      && key !== 'creatorId'
      && key !== 'creatorName'
      && value !== undefined
    )),
  );
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snapshot = await dbAdmin.collection('prospects').orderBy('createdAt', 'desc').get();
  const prospects = snapshot.docs.map(doc => mapProspect(doc.id, doc.data()));

  return NextResponse.json({ prospects });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const prospectData = body?.prospectData as Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'> | undefined;

  if (!prospectData?.companyName?.trim()) {
    return NextResponse.json({ error: 'El nombre de la empresa es obligatorio.' }, { status: 400 });
  }

  const requesterName = getRequesterName(requester);
  const dataToSave = {
    ...cleanProspectPayload(prospectData),
    ownerId: requester.uid,
    ownerName: requesterName,
    creatorId: requester.uid,
    creatorName: requesterName,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('prospects').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'prospect',
    entityId: docRef.id,
    entityName: prospectData.companyName,
    details: `creo el prospecto <strong>${prospectData.companyName}</strong>`,
    ownerName: requesterName,
  });

  return NextResponse.json({ id: docRef.id });
}
