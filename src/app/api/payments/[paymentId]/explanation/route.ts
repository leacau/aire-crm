import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { paymentErrorResponse } from '@/app/api/payments/errors';

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { paymentId } = await context.params;
    const body = await request.json();
    const advisorName = typeof body?.advisorName === 'string' ? body.advisorName : undefined;
    const note = typeof body?.note === 'string' ? body.note : '';
    const comprobanteNumber = typeof body?.comprobanteNumber === 'string' ? body.comprobanteNumber : null;
    const requesterName = getRequesterName(requester);

    await dbAdmin.collection('payment_entries').doc(paymentId).update({
      lastExplanationRequestAt: FieldValue.serverTimestamp(),
      lastExplanationRequestById: requester.uid,
      lastExplanationRequestByName: requesterName,
      explanationRequestNote: note || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      ownerName: advisorName,
      type: 'comment',
      entityType: 'payment',
      entityId: paymentId,
      entityName: comprobanteNumber ? `Comprobante ${comprobanteNumber}` : 'Mora',
      details: note ? `Solicito aclaracion (${note})` : 'Solicito aclaracion al asesor sobre el registro de mora.',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'EXPLANATION REQUEST',
      requesterId: requester.uid,
      publicError: 'No se pudo solicitar la aclaracion del pago.',
    });
  }
}
