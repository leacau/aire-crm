import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { mapCommercialItem, prepareCommercialItemUpdate } from '@/app/api/commercial-items/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import type { CommercialItem } from '@/lib/types';

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { itemId } = await context.params;
  const body = await request.json();
  const itemData = (body?.itemData || {}) as Partial<Omit<CommercialItem, 'id'>>;
  const docRef = dbAdmin.collection('commercial_items').doc(itemId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    return NextResponse.json({ error: 'Commercial item not found' }, { status: 404 });
  }

  const originalItem = mapCommercialItem(originalSnap.id, originalSnap.data());
  const dataToUpdate = {
    ...prepareCommercialItemUpdate(itemData as Record<string, unknown>),
    updatedBy: requester.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.update(dataToUpdate);

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'commercial_item' as any,
    entityId: itemId,
    entityName: originalItem.title || originalItem.description,
    details: `actualizo el elemento comercial <strong>${originalItem.title || originalItem.description}</strong>`,
    ownerName: originalItem.clientName || requesterName,
  });

  return NextResponse.json({ ok: true });
}
