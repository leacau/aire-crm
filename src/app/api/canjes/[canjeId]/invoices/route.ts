import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { mapInvoice } from '@/app/api/canjes/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { canjeId } = await context.params;
  if (!canjeId) return NextResponse.json({ invoices: [] });

  const snapshot = await dbAdmin.collection('invoices').where('canjeId', '==', canjeId).get();
  const invoices = snapshot.docs
    .map(doc => mapInvoice(doc.id, doc.data()))
    .sort((a, b) => (b.date || b.dateGenerated || '').localeCompare(a.date || a.dateGenerated || ''));

  return NextResponse.json({ invoices });
}
