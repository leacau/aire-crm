import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName, mapClient } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Client, Opportunity } from '@/lib/types';

type RouteContext = {
  params: Promise<{ opportunityId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { opportunityId } = await context.params;
  const opportunityRef = dbAdmin.collection('opportunities').doc(opportunityId);
  const opportunitySnap = await opportunityRef.get();

  if (!opportunitySnap.exists) {
    return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 });
  }

  const opportunity = serializeDocument<Opportunity>(opportunitySnap.id, opportunitySnap.data());
  const invoicesSnap = await dbAdmin.collection('invoices').where('opportunityId', '==', opportunityId).get();

  const refsToDelete: FirebaseFirestore.DocumentReference[] = [
    ...invoicesSnap.docs.map(invoiceDoc => invoiceDoc.ref),
    opportunityRef,
  ];

  for (let index = 0; index < refsToDelete.length; index += 450) {
    const batch = dbAdmin.batch();
    refsToDelete.slice(index, index + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  const clientSnap = opportunity.clientId
    ? await dbAdmin.collection('clients').doc(opportunity.clientId).get()
    : null;
  const client = clientSnap?.exists ? mapClient(clientSnap.id, clientSnap.data()) : null;
  const requesterName = getRequesterName(requester);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityName: opportunity.title,
    details: `elimino la oportunidad <strong>${opportunity.title}</strong> del cliente ${opportunity.clientName}`,
    ownerName: (client as Client | null)?.ownerName || 'N/A',
  });

  return NextResponse.json({ ok: true });
}
