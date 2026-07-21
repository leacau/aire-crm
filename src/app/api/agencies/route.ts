import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { logServerActivity } from '@/lib/server/activity';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { getRequesterName } from '@/app/api/clients/utils';
import type { Agency } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const snapshot = await dbAdmin.collection('agencies').orderBy('name').get();
    const agencies = snapshot.docs.map(doc => serializeDocument<Agency>(doc.id, doc.data()));

    return NextResponse.json({ agencies });
  } catch (error: any) {
    console.error('AGENCIES LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las agencias.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Opportunities', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const agencyData = body?.agencyData as Omit<Agency, 'id'> | undefined;
    const name = agencyData?.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'El nombre de la agencia es obligatorio.' }, { status: 400 });
    }

    const requesterName = getRequesterName(requester);
    const docRef = await dbAdmin.collection('agencies').add({
      ...agencyData,
      name,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: requester.uid,
    });

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'agency',
      entityId: docRef.id,
      entityName: name,
      details: `creo la agencia <strong>${name}</strong>`,
      ownerName: requesterName,
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error: any) {
    console.error('AGENCY CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear la agencia.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
