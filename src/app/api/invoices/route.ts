import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { canAccessInvoiceMutationByOpportunity } from '@/lib/server/invoice-access';
import {
  buildInvoiceCreatePayload,
  buildMonthlyBillingIncrement,
  compareInvoicesByGeneratedDesc,
  mapInvoice,
  normalizeInvoiceAmount,
} from '@/app/api/invoices/utils';
import type { Invoice } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get('opportunityId');
    const dashboard = searchParams.get('dashboard') === 'true';

    const collectionRef = dbAdmin.collection('invoices');
    let snapshot: FirebaseFirestore.QuerySnapshot;

    if (opportunityId) {
      snapshot = await collectionRef.where('opportunityId', '==', opportunityId).get();
    } else if (dashboard) {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      snapshot = await collectionRef
        .where('dateGenerated', '>=', thirteenMonthsAgo.toISOString())
        .orderBy('dateGenerated', 'desc')
        .get();
    } else {
      snapshot = await collectionRef.orderBy('dateGenerated', 'desc').get();
    }

    const invoices = snapshot.docs
      .map(doc => mapInvoice(doc.id, doc.data()))
      .sort(compareInvoicesByGeneratedDesc);

    return NextResponse.json({ invoices });
  } catch (error: any) {
    console.error('INVOICES LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las facturas.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const invoiceData = body?.invoiceData as Omit<Invoice, 'id'> | undefined;

    if (!invoiceData?.invoiceNumber || !invoiceData.opportunityId) {
      return NextResponse.json({ error: 'Numero de factura y oportunidad son obligatorios.' }, { status: 400 });
    }

    if (!(await canAccessInvoiceMutationByOpportunity(invoiceData.opportunityId, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dataToSave = buildInvoiceCreatePayload(invoiceData);
    const docRef = await dbAdmin.collection('invoices').add(dataToSave);

    if (invoiceData.date && !invoiceData.isCreditNote) {
      const monthKey = invoiceData.date.substring(0, 7);
      const amountToLog = Math.abs(normalizeInvoiceAmount(invoiceData.amount));
      const increment = buildMonthlyBillingIncrement(monthKey, amountToLog, requester.uid);
      await dbAdmin.collection('estadisticas_mensuales').doc(increment.monthKey).set(increment.data, { merge: true });
    }

    return NextResponse.json({ id: docRef.id });
  } catch (error: any) {
    console.error('INVOICE CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear la factura.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
