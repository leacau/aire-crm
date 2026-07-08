import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { User, UserRole } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') as UserRole | null;

  const snapshot = await dbAdmin.collection('users').get();
  let users = snapshot.docs.map(doc => serializeDocument<User>(doc.id, doc.data()));

  if (role) {
    users = users.filter(user => user.role === role);
  }

  users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const uid = String(body?.uid || requester.uid);

  if (uid !== requester.uid && !hasServerManagementPrivileges(requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const name = String(body?.name || requester.name || requester.email || 'Usuario').trim();
  const email = String(body?.email || requester.email || '').trim().toLowerCase();

  if (!name || !email) {
    return NextResponse.json({ error: 'Nombre y email son obligatorios.' }, { status: 400 });
  }

  await dbAdmin.collection('users').doc(uid).set({
    name,
    email,
    role: 'Asesor',
    photoURL: body?.photoURL || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
