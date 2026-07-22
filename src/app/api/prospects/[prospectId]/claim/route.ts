import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { differenceInCalendarDays } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { Prospect } from '@/lib/types';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

function toDate(value: unknown): Date | null {
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { prospectId } = await context.params;
  const requesterName = getRequesterName(requester);
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  let prospectName = 'Prospecto';

  try {
    await dbAdmin.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) throw new Error('El prospecto ya no existe.');

      const currentProspect = { id: snapshot.id, ...snapshot.data() } as Prospect;
      prospectName = currentProspect.companyName;

      if (currentProspect.ownerId) {
        throw new Error('El prospecto ya fue asignado a otro asesor.');
      }
      if (currentProspect.claimStatus === 'Pendiente') {
        throw new Error(
          currentProspect.claimantId === requester.uid
            ? 'Tu reclamo ya esta pendiente de aprobacion.'
            : 'Otro asesor ya reclamo este prospecto.',
        );
      }

      if (currentProspect.previousOwnerId === requester.uid && currentProspect.unassignedAt) {
        const unassignedDate = toDate(currentProspect.unassignedAt);
        if (unassignedDate) {
          const daysPassed = differenceInCalendarDays(new Date(), unassignedDate);
          if (daysPassed < 3) {
            throw new Error(`Debes esperar ${3 - daysPassed} dias mas para volver a reclamar este prospecto.`);
          }
        }
      }

      transaction.update(docRef, {
        claimStatus: 'Pendiente',
        claimantId: requester.uid,
        claimantName: requesterName,
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo reclamar el prospecto.' },
      { status: 400 },
    );
  }

  try {
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'prospect',
      entityId: prospectId,
      entityName: prospectName,
      details: `solicito reclamar el prospecto <strong>${prospectName}</strong>`,
      ownerName: 'Sin Asignar',
    });
  } catch (error: any) {
    console.error('PROSPECT CLAIM ACTIVITY ERROR:', {
      requester: requester.uid,
      prospectId,
      code: error?.code,
      message: error?.message,
    });
  }

  return NextResponse.json({ ok: true });
}
