import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getAccessibleClient } from '@/lib/server/client-access';
import { serializeDocument } from '@/lib/server/firestore';
import type { Invoice } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function normalizeInvoiceAmount(rawAmount: unknown): number {
  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) return rawAmount;
  if (typeof rawAmount === 'string') {
    const parsed = Number(rawAmount.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const fallback = Number(rawAmount ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;
  if (!clientId) return NextResponse.json({ invoices: [] });
  const client = await getAccessibleClient(clientId, requester);
  if (!client) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const oppsSnap = await dbAdmin.collection('opportunities').where('clientId', '==', clientId).get();
  const opportunityIds = oppsSnap.docs.map(doc => doc.id);
  if (opportunityIds.length === 0) return NextResponse.json({ invoices: [] });

  const invoices: Invoice[] = [];
  for (let index = 0; index < opportunityIds.length; index += 30) {
    const chunk = opportunityIds.slice(index, index + 30);
    const snapshot = await dbAdmin.collection('invoices').where('opportunityId', 'in', chunk).get();
    invoices.push(
      ...snapshot.docs.map(doc => {
        const invoice = serializeDocument<Invoice>(doc.id, doc.data());
        return {
          ...invoice,
          amount: normalizeInvoiceAmount(invoice.amount),
          isCreditNote: Boolean(invoice.isCreditNote),
        };
      }),
    );
  }

  invoices.sort((a, b) => new Date(b.dateGenerated).getTime() - new Date(a.dateGenerated).getTime());

  return NextResponse.json({ invoices });
}
