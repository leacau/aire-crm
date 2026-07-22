import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { getRequesterName, mapClient } from '@/app/api/clients/utils';

async function commitWhenNeeded(state: { batch: FirebaseFirestore.WriteBatch; count: number }) {
  if (state.count >= 450) {
    await state.batch.commit();
    state.batch = dbAdmin.batch();
    state.count = 0;
  }
}

async function updateMatchingDocs(
  state: { batch: FirebaseFirestore.WriteBatch; count: number },
  collectionName: string,
  field: string,
  sourceClientId: string,
  dataToUpdate: Record<string, unknown>,
) {
  const snapshot = await dbAdmin.collection(collectionName).where(field, '==', sourceClientId).get();
  for (const doc of snapshot.docs) {
    state.batch.update(doc.ref, dataToUpdate);
    state.count += 1;
    await commitWhenNeeded(state);
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const targetClientId = String(body?.targetClientId || '');
    const sourceClientId = String(body?.sourceClientId || '');

    if (!targetClientId || !sourceClientId) {
      return NextResponse.json({ error: 'targetClientId y sourceClientId son obligatorios.' }, { status: 400 });
    }
    if (targetClientId === sourceClientId) {
      return NextResponse.json({ error: 'No puedes fusionar un cliente consigo mismo.' }, { status: 400 });
    }

    const targetRef = dbAdmin.collection('clients').doc(targetClientId);
    const sourceRef = dbAdmin.collection('clients').doc(sourceClientId);
    const [targetSnap, sourceSnap] = await Promise.all([targetRef.get(), sourceRef.get()]);

    if (!targetSnap.exists || !sourceSnap.exists) {
      return NextResponse.json({ error: 'Uno de los clientes no existe.' }, { status: 404 });
    }

    const targetData = mapClient(targetSnap.id, targetSnap.data());
    const sourceData = mapClient(sourceSnap.id, sourceSnap.data());
    const targetName = targetData.denominacion;
    const state = { batch: dbAdmin.batch(), count: 0 };

    await updateMatchingDocs(state, 'opportunities', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
    await updateMatchingDocs(state, 'advertising_orders', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
    await updateMatchingDocs(state, 'billing_requests', 'clientId', sourceClientId, { clientId: targetClientId });
    await updateMatchingDocs(state, 'client-activities', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });

    const peopleSnap = await dbAdmin.collection('people').where('clientIds', 'array-contains', sourceClientId).get();
    for (const doc of peopleSnap.docs) {
      const data = doc.data();
      const newIds = Array.isArray(data.clientIds) ? data.clientIds.filter((id: string) => id !== sourceClientId) : [];
      if (!newIds.includes(targetClientId)) newIds.push(targetClientId);
      state.batch.update(doc.ref, { clientIds: newIds });
      state.count += 1;
      await commitWhenNeeded(state);
    }

    await updateMatchingDocs(state, 'commercial_notes', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
    await updateMatchingDocs(state, 'social_media_requests', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
    await updateMatchingDocs(state, 'web_notes', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
    await updateMatchingDocs(state, 'canjes', 'clienteId', sourceClientId, { clienteId: targetClientId, clienteName: targetName });
    await updateMatchingDocs(state, 'convenios', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });

    state.batch.delete(sourceRef);
    state.count += 1;
    await state.batch.commit();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'client',
      entityId: targetClientId,
      entityName: targetName,
      details: `fusiono el cliente duplicado <strong>${sourceData.denominacion}</strong> hacia este cliente, migrando todo su historial.`,
      ownerName: targetData.ownerName || 'Sistema',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'MERGE',
      requesterId: requester.uid,
      publicError: 'No se pudo fusionar el cliente.',
    });
  }
}
