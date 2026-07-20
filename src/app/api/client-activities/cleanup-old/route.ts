import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const snapshot = await dbAdmin
    .collection('client-activities')
    .where('completed', '==', true)
    .where('completedAt', '<', sixtyDaysAgo.toISOString())
    .limit(100)
    .get();

  if (snapshot.empty) {
    return NextResponse.json({ deleted: 0 });
  }

  const batch = dbAdmin.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return NextResponse.json({ deleted: snapshot.size });
}
