import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerUser,
} from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { User } from '@/lib/types';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { userId } = await context.params;
  const snap = await dbAdmin.collection('users').doc(userId).get();

  return NextResponse.json({
    user: snap.exists ? serializeDocument<User>(snap.id, snap.data()) : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { userId } = await context.params;
  if (requester.uid !== userId && !hasServerManagementPrivileges(requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id: _ignoredId, ...rawData } = body || {};
  const data = Object.fromEntries(
    Object.entries(rawData).filter(([, value]) => value !== undefined),
  );

  await dbAdmin.collection('users').doc(userId).set(data, { merge: true });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!hasServerManagementPrivileges(requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await context.params;
  const userRef = dbAdmin.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  }

  const userData = serializeDocument<User>(userSnap.id, userSnap.data());
  const [clientsSnapshot, prospectsSnapshot] = await Promise.all([
    dbAdmin.collection('clients').where('ownerId', '==', userId).get(),
    dbAdmin.collection('prospects').where('ownerId', '==', userId).get(),
  ]);

  const refsToUpdate = [
    ...clientsSnapshot.docs.map(doc => doc.ref),
    ...prospectsSnapshot.docs.map(doc => doc.ref),
  ];

  for (let index = 0; index < refsToUpdate.length; index += 450) {
    const batch = dbAdmin.batch();
    refsToUpdate.slice(index, index + 450).forEach(ref => {
      batch.update(ref, {
        ownerId: FieldValue.delete(),
        ownerName: FieldValue.delete(),
      });
    });
    await batch.commit();
  }

  await userRef.delete();

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'delete',
    entityType: 'user',
    entityId: userId,
    entityName: userData.name,
    details: `elimino al usuario <strong>${userData.name}</strong> y desasigno ${clientsSnapshot.size} cliente(s) y ${prospectsSnapshot.size} prospecto(s).`,
    ownerName: requester.name || requester.email || 'Usuario',
  });

  return NextResponse.json({ ok: true });
}
