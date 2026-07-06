import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerUser,
} from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { User } from '@/lib/types';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { userId } = await context.params;
  const snap = await dbAdmin.collection('users').doc(userId).get();

  return NextResponse.json({
    user: snap.exists ? serializeDocument<User>(snap.id, snap.data()) : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { userId } = await context.params;
  if (requester.uid !== userId && !hasServerManagementPrivileges(requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id: _ignoredId, ...rawData } = body || {};
  const data = Object.fromEntries(
    Object.entries(rawData).filter(([, value]) => value !== undefined),
  );

  await dbAdmin.collection('users').doc(userId).set(data, { merge: true });

  return NextResponse.json({ ok: true });
}

