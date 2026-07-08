import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const prospectIds = Array.isArray(body?.prospectIds)
    ? body.prospectIds.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  if (prospectIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  for (let index = 0; index < prospectIds.length; index += 450) {
    const batch = dbAdmin.batch();
    prospectIds.slice(index, index + 450).forEach(prospectId => {
      batch.update(dbAdmin.collection('prospects').doc(prospectId), {
        lastProspectNotificationAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'prospect',
    entityId: 'prospect_notifications',
    entityName: 'Notificaciones de prospectos',
    details: `envio recordatorios de seguimiento para ${prospectIds.length} prospecto(s).`,
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}
