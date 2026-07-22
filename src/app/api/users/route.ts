import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { userErrorResponse } from '@/app/api/users/errors';
import type { User, UserRole } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as UserRole | null;

    const snapshot = await dbAdmin.collection('users').get();
    let users = snapshot.docs.map(doc => serializeDocument<User>(doc.id, doc.data()));

    if (role) {
      users = users.filter(user => user.role === role);
    }

    users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('USERS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los usuarios.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
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
  } catch (error) {
    return userErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el usuario.',
    });
  }
}
