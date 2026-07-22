import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { mapCommercialItem } from '@/app/api/commercial-items/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.filter((id: unknown) => typeof id === 'string') : [];

    if (itemIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const firstItemRef = dbAdmin.collection('commercial_items').doc(itemIds[0]);
    const firstItemSnap = await firstItemRef.get();
    const firstItem = firstItemSnap.exists ? mapCommercialItem(firstItemSnap.id, firstItemSnap.data()) : null;

    for (let index = 0; index < itemIds.length; index += 450) {
      const batch = dbAdmin.batch();
      itemIds.slice(index, index + 450).forEach(id => {
        batch.delete(dbAdmin.collection('commercial_items').doc(id));
      });
      await batch.commit();
    }

    if (body?.logDeletion && firstItem) {
      const requesterName = getRequesterName(requester);
      await logServerActivity({
        userId: requester.uid,
        userName: requesterName,
        type: 'delete',
        entityType: 'commercial_item' as any,
        entityId: 'multiple',
        entityName: firstItem.title || firstItem.description,
        details: `elimino ${itemIds.length} elemento(s) comercial(es) de la serie <strong>${firstItem.title || firstItem.description}</strong>`,
        ownerName: firstItem.clientName || requesterName,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'BULK DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudieron eliminar los items comerciales.',
    });
  }
}
