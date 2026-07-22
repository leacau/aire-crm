import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { mapCommercialItem } from '@/app/api/commercial-items/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { seriesId } = await context.params;
    const snapshot = await dbAdmin
      .collection('commercial_items')
      .where('seriesId', '==', seriesId)
      .get();

    const items = snapshot.docs
      .map(doc => mapCommercialItem(doc.id, doc.data()))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ items });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'SERIES DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la serie comercial.',
    });
  }
}
