import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { defaultPermissions } from '@/lib/data';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';

const AREA_PERMISSIONS_DOC_ID = 'area_permissions';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const docRef = dbAdmin.collection('system_config').doc(AREA_PERMISSIONS_DOC_ID);
  const snap = await docRef.get();

  if (snap.exists) {
    return NextResponse.json({ permissions: snap.data()?.permissions || defaultPermissions });
  }

  await docRef.set({ permissions: defaultPermissions });
  return NextResponse.json({ permissions: defaultPermissions });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  if (!body?.permissions || typeof body.permissions !== 'object') {
    return NextResponse.json({ error: 'Permissions payload is required' }, { status: 400 });
  }

  await dbAdmin
    .collection('system_config')
    .doc(AREA_PERMISSIONS_DOC_ID)
    .set({ permissions: body.permissions }, { merge: true });

  return NextResponse.json({ permissions: body.permissions });
}

