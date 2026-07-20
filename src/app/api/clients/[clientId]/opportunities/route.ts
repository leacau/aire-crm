import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getAccessibleClient } from '@/lib/server/client-access';
import { serializeDocument } from '@/lib/server/firestore';
import type { Opportunity } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;
  if (!clientId) return NextResponse.json({ opportunities: [] });
  const client = await getAccessibleClient(clientId, requester);
  if (!client) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const snapshot = await dbAdmin.collection('opportunities').where('clientId', '==', clientId).get();
  const opportunities = snapshot.docs.map(doc => serializeDocument<Opportunity>(doc.id, doc.data()));

  return NextResponse.json({ opportunities });
}
