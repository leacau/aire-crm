import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
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
    prospectIds.slice(index, index + 450).forEach(id => {
      batch.update(dbAdmin.collection('prospects').doc(id), {
        ownerId: '',
        ownerName: 'Sin Asignar',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'prospect',
    entityId: 'multiple_release',
    entityName: `${prospectIds.length} prospectos`,
    details: `libero automaticamente <strong>${prospectIds.length}</strong> prospectos por inactividad.`,
    ownerName: 'Sistema',
  });

  return NextResponse.json({ ok: true });
}
