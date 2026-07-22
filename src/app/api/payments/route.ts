import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { buildPaymentImportPayload, mapPaymentEntry, type PaymentImportRow } from '@/app/api/payments/utils';
import type { PaymentStatus } from '@/lib/types';

const PENDING_STATUSES: PaymentStatus[] = ['Pendiente', 'Reclamado', 'Incobrable'];

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const pending = searchParams.get('pending') === 'true';

    const collectionRef = dbAdmin.collection('payment_entries');
    const snapshot = pending
      ? await collectionRef.where('status', 'in', PENDING_STATUSES).orderBy('createdAt', 'desc').get()
      : await collectionRef.orderBy('createdAt', 'desc').get();

    const payments = snapshot.docs.map(doc => mapPaymentEntry(doc.id, doc.data()));
    return NextResponse.json({ payments });
  } catch (error: any) {
    console.error('PAYMENTS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los pagos.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const advisorId = typeof body?.advisorId === 'string' ? body.advisorId : '';
    const advisorName = typeof body?.advisorName === 'string' ? body.advisorName : '';
    const rows = Array.isArray(body?.rows) ? (body.rows as PaymentImportRow[]) : [];

    if (!advisorId || !advisorName) {
      return NextResponse.json({ error: 'Asesor obligatorio para importar pagos.' }, { status: 400 });
    }

    const existingSnap = await dbAdmin.collection('payment_entries').where('advisorId', '==', advisorId).get();
    const existingEntries = existingSnap.docs.map(docSnap => {
      const data = docSnap.data();
      const comprobanteNumber = typeof data.comprobanteNumber === 'string' ? data.comprobanteNumber.trim() : '';

      return {
        ref: docSnap.ref,
        comprobanteNumber: comprobanteNumber || null,
      };
    });

    const existingMap = existingEntries.reduce((acc, entry) => {
      if (entry.comprobanteNumber) acc.set(entry.comprobanteNumber, entry.ref);
      return acc;
    }, new Map<string, FirebaseFirestore.DocumentReference>());

    const existingNumbers = new Set(
      existingEntries.map(entry => entry.comprobanteNumber).filter((value): value is string => Boolean(value)),
    );

    const incomingNumbers = new Set(
      rows.map(row => (row.comprobanteNumber || '').trim()).filter(Boolean),
    );

    const batch = dbAdmin.batch();
    existingEntries
      .filter(entry => entry.comprobanteNumber && !incomingNumbers.has(entry.comprobanteNumber))
      .forEach(entry => batch.delete(entry.ref));

    rows.forEach(row => {
      const comprobante = (row.comprobanteNumber || '').trim();
      const payload = {
        ...buildPaymentImportPayload(row, advisorId, advisorName),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (comprobante && existingMap.has(comprobante)) {
        batch.update(existingMap.get(comprobante)!, payload);
      } else if (!comprobante || !existingNumbers.has(comprobante)) {
        const docRef = dbAdmin.collection('payment_entries').doc();
        batch.set(docRef, {
          ...payload,
          status: 'Pendiente' as PaymentStatus,
          notes: row.notes || '',
          nextContactAt: row.nextContactAt || null,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    await batch.commit();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      ownerName: advisorName,
      type: 'update',
      entityType: 'invoice',
      entityId: advisorId,
      entityName: 'Pagos',
      details: `actualizo la lista de pagos del asesor ${advisorName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('PAYMENTS IMPORT ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron importar los pagos.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json().catch(() => null);
    const paymentIds = Array.isArray(body?.paymentIds)
      ? body.paymentIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
      : [];

    if (paymentIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const batch = dbAdmin.batch();
    paymentIds.forEach(id => {
      batch.delete(dbAdmin.collection('payment_entries').doc(id));
    });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('PAYMENTS DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron eliminar los pagos.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
