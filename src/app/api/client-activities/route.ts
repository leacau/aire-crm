import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ClientActivity } from '@/lib/types';

function mapClientActivity(id: string, data: FirebaseFirestore.DocumentData | undefined): ClientActivity {
  return serializeDocument<ClientActivity>(id, data);
}

function buildClientActivityCreatePayload(
  activityData: Omit<ClientActivity, 'id' | 'timestamp'>,
  requesterId: string,
  requesterName: string,
) {
  const dataToSave: Record<string, unknown> = {
    ...activityData,
    userId: requesterId,
    userName: requesterName,
    timestamp: FieldValue.serverTimestamp(),
  };

  if (activityData.isTask && activityData.dueDate) {
    dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
  } else {
    delete dataToSave.dueDate;
  }

  if (!activityData.opportunityId || activityData.opportunityId === 'none') {
    delete dataToSave.opportunityId;
    delete dataToSave.opportunityTitle;
  }

  if (!activityData.clientId) delete dataToSave.clientId;
  if (!activityData.clientName) delete dataToSave.clientName;
  if (!activityData.prospectId) delete dataToSave.prospectId;
  if (!activityData.prospectName) delete dataToSave.prospectName;

  return Object.fromEntries(
    Object.entries(dataToSave).filter(([, value]) => value !== undefined),
  );
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snapshot = await dbAdmin
    .collection('client-activities')
    .orderBy('timestamp', 'desc')
    .get();

  const activities = snapshot.docs.map(doc => mapClientActivity(doc.id, doc.data()));
  return NextResponse.json({ activities });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const activityData = body?.activityData as Omit<ClientActivity, 'id' | 'timestamp'> | undefined;

  if (!activityData?.type || !activityData.observation?.trim()) {
    return NextResponse.json({ error: 'Tipo y observacion son obligatorios.' }, { status: 400 });
  }

  const requesterName = getRequesterName(requester);
  const docRef = await dbAdmin.collection('client-activities').add(
    buildClientActivityCreatePayload(activityData, requester.uid, requesterName),
  );

  return NextResponse.json({ id: docRef.id });
}
