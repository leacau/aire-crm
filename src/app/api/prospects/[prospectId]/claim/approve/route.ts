import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Prospect } from '@/lib/types';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const { prospectId } = await context.params;
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: 'Prospecto no encontrado.' }, { status: 404 });
  }

  const prospect = serializeDocument<Prospect>(snapshot.id, snapshot.data());
  if (!prospect.claimantId || !prospect.claimantName) {
    return NextResponse.json({ error: 'No hay reclamante valido.' }, { status: 400 });
  }

  await docRef.update({
    ownerId: prospect.claimantId,
    ownerName: prospect.claimantName,
    status: 'Nuevo',
    statusChangedAt: FieldValue.serverTimestamp(),
    claimStatus: FieldValue.delete(),
    claimantId: FieldValue.delete(),
    claimantName: FieldValue.delete(),
    claimedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: prospect.companyName,
    details: `aprobo el reclamo y asigno el prospecto a <strong>${prospect.claimantName}</strong>`,
    ownerName: prospect.claimantName,
  });

  return NextResponse.json({ ok: true });
}
