import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { mapCommercialItem } from '@/app/api/commercial-items/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { seriesId } = await context.params;
  const snapshot = await dbAdmin
    .collection('commercial_items')
    .where('seriesId', '==', seriesId)
    .get();

  const items = snapshot.docs
    .map(doc => mapCommercialItem(doc.id, doc.data()))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ items });
}
