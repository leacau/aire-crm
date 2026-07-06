import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { Person } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;
  if (!clientId) return NextResponse.json({ people: [] });

  const snapshot = await dbAdmin.collection('people').where('clientIds', 'array-contains', clientId).get();
  const people = snapshot.docs.map(doc => serializeDocument<Person>(doc.id, doc.data()));

  return NextResponse.json({ people });
}
